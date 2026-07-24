import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from httpx import BasicAuth, HTTPError, Timeout

from backend.models import ModelRef


class BridgeError(Exception):
    pass


class Session:
    def __init__(self, id: str, bridge: "OpenCodeBridge"):
        self.id = id
        self._bridge = bridge

    async def delete(self) -> None:
        await self._bridge.delete_session(self.id)


class OpenCodeBridge:
    def __init__(self, base_url: str, password: str | None = None):
        self.base_url = base_url.rstrip("/")
        self._auth = BasicAuth("opencode", password) if password else None
        self._client = httpx.AsyncClient(
            auth=self._auth,
            timeout=Timeout(600.0, read=600.0, connect=30.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def health(self) -> bool:
        try:
            r = await self._client.get(f"{self.base_url}/global/health")
            return r.status_code == 200
        except HTTPError:
            return False

    async def create_session(self) -> Session:
        r = await self._client.post(f"{self.base_url}/session", json={})
        if r.status_code != 200:
            raise BridgeError(f"create_session failed: {r.status_code} {r.text}")
        data = r.json()
        return Session(id=data["id"], bridge=self)

    async def delete_session(self, session_id: str) -> None:
        try:
            await self._client.delete(f"{self.base_url}/session/{session_id}")
        except HTTPError:
            pass

    def _build_message_payload(
        self,
        model: ModelRef,
        system: str,
        parts: list[dict],
        tools: dict | None = None,
    ) -> dict:
        payload: dict = {
            "model": {"providerID": model.provider, "modelID": model.model},
            "system": system,
            "parts": parts,
        }
        if tools is not None:
            payload["tools"] = tools
        return payload

    async def send_message(
        self,
        session_id: str,
        model: ModelRef,
        system: str,
        parts: list[dict],
        tools: dict | None = None,
        retries: int = 1,
    ) -> str:
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                payload = self._build_message_payload(model, system, parts, tools)
                r = await self._client.post(
                    f"{self.base_url}/session/{session_id}/message",
                    json=payload,
                )
                if r.status_code != 200:
                    raise BridgeError(
                        f"send_message failed: {r.status_code} {r.text[:500]}"
                    )
                data = r.json()
                return _extract_text(data)
            except HTTPError as e:
                last_error = e
                if attempt < retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
                raise BridgeError(f"send_message failed after {retries + 1} attempts: {e}") from e
            except Exception as e:
                raise BridgeError(f"send_message error: {e}") from e

    async def send_message_async(
        self,
        session_id: str,
        model: ModelRef,
        system: str,
        parts: list[dict],
        tools: dict | None = None,
    ) -> None:
        payload = self._build_message_payload(model, system, parts, tools)
        r = await self._client.post(
            f"{self.base_url}/session/{session_id}/prompt_async",
            json=payload,
        )
        if r.status_code not in (200, 204):
            raise BridgeError(
                f"send_message_async failed: {r.status_code} {r.text[:500]}"
            )

    async def stream_events(self) -> AsyncIterator[dict]:
        try:
            async with self._client.stream(
                "GET", f"{self.base_url}/event"
            ) as r:
                if r.status_code != 200:
                    raise BridgeError(
                        f"stream_events failed: {r.status_code}"
                    )
                buffer = ""
                async for chunk in r.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        raw, buffer = buffer.split("\n\n", 1)
                        event = _parse_sse_event(raw)
                        if event:
                            yield event
        except HTTPError as e:
            raise BridgeError(f"SSE stream error: {e}") from e

    @asynccontextmanager
    async def session_context(self) -> AsyncIterator[Session]:
        session = await self.create_session()
        try:
            yield session
        finally:
            await session.delete()


def _extract_text(data: dict) -> str:
    parts = data.get("parts") or data.get("messages", [{}])[-1].get("parts", [])
    texts = [p["text"] for p in parts if p.get("type") == "text"]
    return "\n".join(texts)


def _parse_sse_event(raw: str) -> dict | None:
    lines = raw.strip().split("\n")
    event = {}
    for line in lines:
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                event["data"] = line[6:]
        elif line.startswith("event: "):
            event["event"] = line[7:]
        elif line.startswith("id: "):
            event["id"] = line[4:]
    return event if event else None
