import asyncio
import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from backend.bridge import OpenCodeBridge, BridgeError
from backend.models import (
    ChatRequest,
    CouncilRequest,
    CouncilResponse,
    ModelRef,
    PresetConfig,
    SessionInfo,
)
from backend.pipeline import run_council, run_council_streaming, run_council_debate, run_council_debate_streaming
from backend.presets import get_preset, list_presets
from backend import debug_log, storage
from backend.config import env


bridge: OpenCodeBridge | None = None
opencode_process: asyncio.subprocess.Process | None = None
_launched_manually = False


OPENCODE_BASE = env.opencode.base_url
OPENCODE_PASSWORD = env.opencode.password


async def _find_running_server() -> bool:
    global bridge
    if bridge is None:
        bridge = OpenCodeBridge(OPENCODE_BASE, OPENCODE_PASSWORD)
    try:
        ok = await bridge.health()
        return ok
    except Exception:
        return False


async def _launch_opencode() -> asyncio.subprocess.Process | None:
    global opencode_process
    oc = env.opencode
    cmd = ["opencode", "serve", "--port", str(oc.port)]
    if OPENCODE_PASSWORD:
        cmd.extend(["--password", OPENCODE_PASSWORD])
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    for _ in range(oc.launch_timeout):
        await asyncio.sleep(1)
        try:
            r = await bridge.health()
            if r:
                return proc
        except Exception:
            continue
    proc.kill()
    await proc.wait()
    raise RuntimeError(f"opencode serve failed to start within {oc.launch_timeout} seconds")


async def _wait_for_server(proc: asyncio.subprocess.Process, timeout: int | None = None):
    oc = env.opencode
    timeout = timeout or oc.health_timeout
    for _ in range(timeout):
        await asyncio.sleep(1)
        try:
            if await bridge.health():
                return
        except Exception:
            continue
    proc.kill()
    await proc.wait()
    raise RuntimeError("opencode serve did not become healthy")


async def _read_stderr(proc: asyncio.subprocess.Process):
    assert proc.stderr is not None
    async for line in proc.stderr:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bridge, opencode_process, _launched_manually
    bridge = OpenCodeBridge(OPENCODE_BASE, OPENCODE_PASSWORD)
    already_running = await _find_running_server()
    if not already_running:
        proc = await _launch_opencode()
        opencode_process = proc
        _launched_manually = True
        asyncio.create_task(_read_stderr(proc))
    yield
    if _launched_manually and opencode_process:
        opencode_process.terminate()
        try:
            await asyncio.wait_for(opencode_process.wait(), timeout=env.opencode.shutdown_wait)
        except asyncio.TimeoutError:
            opencode_process.kill()
            await opencode_process.wait()
    if bridge:
        await bridge.close()


app = FastAPI(
    title=env.server.title,
    version=env.server.version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=env.cors.allow_origins,
    allow_credentials=env.cors.allow_credentials,
    allow_methods=env.cors.allow_methods,
    allow_headers=env.cors.allow_headers,
)


@app.get("/api/health")
async def health():
    if bridge is None:
        raise HTTPException(503, "Bridge not initialized")
    ok = await bridge.health()
    return {"status": "ok" if ok else "degraded", "opencode": ok}


_models_cache: list[dict] | None = None
_models_cache_ts: float = 0


def _resolve_session(req: ChatRequest | CouncilRequest) -> str:
    sid = getattr(req, "app_session_id", None)
    if sid:
        existing = storage.get_session(sid)
        if existing:
            return existing["id"]
    title = "Chat" if isinstance(req, ChatRequest) else f"Council: {getattr(req, 'preset_id', '')}"
    return storage.create_session(title)["id"]


def _preset_label(preset_id: str) -> str:
    try:
        return get_preset(preset_id).label
    except ValueError:
        return preset_id

@app.get("/api/models")
async def list_models():
    global _models_cache, _models_cache_ts
    now = time.time()
    if _models_cache is not None and (now - _models_cache_ts) < env.opencode.models_cache_ttl:
        return _models_cache
    try:
        proc = await asyncio.create_subprocess_exec(
            "opencode", "models",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=env.opencode.models_timeout)
        raw = stdout.decode().strip()
        models = []
        seen = set()
        for line in raw.split("\n"):
            line = line.strip()
            if not line or line in seen:
                continue
            seen.add(line)
            if "/" in line:
                provider, model_name = line.split("/", 1)
            else:
                provider, model_name = "unknown", line
            models.append({
                "value": line,
                "label": model_name.replace("-", " ").title(),
                "provider": provider,
            })
        # Group providers
        providers = {}
        for m in models:
            p = m["provider"]
            if p not in providers:
                providers[p] = []
            providers[p].append(m)
        result = {"models": models, "providers": sorted(providers.keys())}
        _models_cache = result
        _models_cache_ts = now
        return result
    except Exception as e:
        return {"models": [], "providers": [], "error": str(e)}


@app.get("/api/presets")
async def list_presets_route():
    return [p.model_dump() for p in list_presets()]


@app.get("/api/presets/{preset_id}")
async def get_preset_route(preset_id: str):
    try:
        return get_preset(preset_id).model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.post("/api/chat", response_model=None)
async def chat(req: ChatRequest):
    if bridge is None:
        raise HTTPException(503, "Bridge not initialized")
    app_session_id = _resolve_session(req)
    debug_log.append(app_session_id, {
        "type": "chat_start",
        "model": req.model.model_dump(),
        "text": req.text,
        "system": req.system,
    })
    if req.stream:
        return await _stream_chat(req)
    try:
        async with bridge.session_context() as session:
            text = await bridge.send_message(
                session_id=session.id,
                model=req.model,
                system=req.system or "",
                parts=[{"type": "text", "text": req.text}],
                tools={},
                log_session_id=app_session_id,
            )
        debug_log.append(app_session_id, {
            "type": "chat_complete",
            "response": text,
        })
        return {"text": text, "model": req.model.model_dump()}
    except Exception as e:
        debug_log.append(app_session_id, {
            "type": "chat_error",
            "error": str(e),
        })
        raise


async def _stream_chat(req: ChatRequest) -> EventSourceResponse:
    if bridge is None:
        raise HTTPException(503, "Bridge not initialized")
    app_session_id = _resolve_session(req)

    async def event_generator() -> AsyncIterator[dict]:
        session = await bridge.create_session()
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        async def listen():
            try:
                async for ev in bridge.stream_events():
                    if ev.get("sessionId") == session.id:
                        await queue.put(ev)
            except Exception:
                pass
            finally:
                await queue.put(None)

        full_response = ""
        listener = asyncio.create_task(listen())
        try:
            await asyncio.sleep(0.05)
            await bridge.send_message_async(
                session_id=session.id,
                model=req.model,
                system=req.system or "",
                parts=[{"type": "text", "text": req.text}],
                tools={},
                log_session_id=app_session_id,
            )
            while True:
                ev = await queue.get()
                if ev is None:
                    break
                ev_type = ev.get("type", "")
                props = ev.get("properties", {})
                if ev_type == "message.part.delta":
                    delta = props.get("delta", "")
                    if delta:
                        full_response += delta
                        yield {"event": "chunk", "data": delta}
                elif ev_type == "message.part.updated":
                    part = props.get("part", {})
                    if part.get("type") == "text" and part.get("text"):
                        pass
                elif ev_type == "session.status":
                    status = props.get("status", {})
                    if status.get("type") == "idle":
                        debug_log.append(app_session_id, {
                            "type": "chat_complete",
                            "response": full_response,
                        })
                        yield {"event": "done", "data": ""}
                        return
                elif ev_type == "session.idle":
                    debug_log.append(app_session_id, {
                        "type": "chat_complete",
                        "response": full_response,
                    })
                    yield {"event": "done", "data": ""}
                    return
                elif ev_type == "error":
                    debug_log.append(app_session_id, {
                        "type": "chat_error",
                        "error": ev.get("content", ""),
                    })
                    yield {"event": "error", "data": ev.get("content", "")}
                    return
            yield {"event": "done", "data": ""}
        finally:
            listener.cancel()
            try:
                await listener
            except (asyncio.CancelledError, Exception):
                pass
            await session.delete()

    return EventSourceResponse(event_generator())


@app.post("/api/council/stream")
async def council_stream(req: CouncilRequest):
    if bridge is None:
        raise HTTPException(503, "Bridge not initialized")

    app_session_id = _resolve_session(req)

    async def event_generator() -> AsyncIterator[dict]:
        try:
            preset_label = _preset_label(req.preset_id)
            debug_log.append(app_session_id, {
                "type": "council_start",
                "mode": req.mode,
                "preset_id": req.preset_id,
                "preset_label": preset_label,
                "text": req.text,
                "scratchpad": req.scratchpad,
                "model_overrides": req.model_overrides,
                "contract_overrides": req.contract_overrides,
            })
            if req.mode == "debate":
                pipeline = run_council_debate_streaming
            else:
                pipeline = run_council_streaming
            async for ev in pipeline(
                bridge=bridge,
                preset_id=req.preset_id,
                text=req.text,
                scratchpad=req.scratchpad,
                model_overrides=req.model_overrides,
                contract_overrides=req.contract_overrides,
                log_session_id=app_session_id,
            ):
                yield {"event": ev["event"], "data": json.dumps(ev["data"])}
            debug_log.append(app_session_id, {
                "type": "council_complete",
                "preset_id": req.preset_id,
            })
        except Exception as e:
            debug_log.append(app_session_id, {
                "type": "council_error",
                "error": str(e),
            })
            yield {"event": "error", "data": json.dumps(str(e))}
        finally:
            yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_generator())


@app.post("/api/council")
async def council(req: CouncilRequest):
    if bridge is None:
        raise HTTPException(503, "Bridge not initialized")
    try:
        presets = get_preset(req.preset_id)
    except ValueError as e:
        raise HTTPException(404, str(e))

    app_session_id = _resolve_session(req)
    debug_log.append(app_session_id, {
        "type": "council_start",
        "mode": req.mode,
        "preset_id": req.preset_id,
        "text": req.text,
    })

    try:
        if req.mode == "debate":
            from backend.pipeline import run_council_debate_nonstream
            members, chair, critiques = await run_council_debate_nonstream(
                bridge=bridge,
                preset_id=req.preset_id,
                text=req.text,
                scratchpad=req.scratchpad,
                model_overrides=req.model_overrides,
                contract_overrides=req.contract_overrides,
                log_session_id=app_session_id,
            )
        else:
            members, chair, critiques = await run_council(
                bridge=bridge,
                preset_id=req.preset_id,
                text=req.text,
                scratchpad=req.scratchpad,
                model_overrides=req.model_overrides,
                contract_overrides=req.contract_overrides,
                log_session_id=app_session_id,
            )
    except Exception as e:
        debug_log.append(app_session_id, {
            "type": "council_error",
            "error": str(e),
        })
        raise HTTPException(500, f"Council pipeline failed: {e}")

    debug_log.append(app_session_id, {
        "type": "council_complete",
        "preset_id": req.preset_id,
    })
    return CouncilResponse(
        preset_id=req.preset_id,
        text=req.text,
        chair=chair,
        members=members,
        critiques=critiques,
    ).model_dump()


@app.get("/api/sessions")
async def list_sessions():
    return storage.list_sessions()


@app.post("/api/sessions")
async def create_session():
    return storage.create_session()


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = storage.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Session not found")
    return session


@app.post("/api/sessions/{session_id}/messages")
async def add_message(session_id: str, req: ChatRequest):
    session = storage.add_message(
        session_id, "user", {"text": req.text, "model": req.model.model_dump()}
    )
    if session is None:
        raise HTTPException(404, "Session not found")
    return session


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    if not storage.delete_session(session_id):
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@app.get("/api/debug/logs")
async def list_debug_logs():
    return debug_log.list_logs()


@app.get("/api/debug/logs/{session_id}")
async def get_debug_log(session_id: str):
    return debug_log.get_log(session_id)
