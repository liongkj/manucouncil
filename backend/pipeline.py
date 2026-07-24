import asyncio
import json
import random
from collections.abc import AsyncIterator

from backend.bridge import OpenCodeBridge
from backend.models import (
    ChairResult,
    Critique,
    MemberResult,
    ModelRef,
    PresetConfig,
    PresetMember,
)
from backend.presets import get_preset


class PipelineError(Exception):
    pass


def _clean_response(text: str) -> str:
    import re
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n?\s*```$", "", text, flags=re.MULTILINE)
    text = text.strip()
    return text


def _build_system_prompt(role: str, contract: str) -> str:
    return f"""Role: {role}

{contract}

Respond with natural prose. Do NOT use JSON or markdown code fences. Write in clear paragraph form. Include your analysis, key findings, risks, and recommendation in plain text."""


CHAIN_OF_THOUGHT_KICKER = "\n\nFirst, re-read the user's text carefully. Then work through your analysis step by step before writing your final response."


def _build_user_text(text: str, scratchpad: str | None = None, previous_results: list[tuple[str, str, str]] | None = None) -> str:
    parts = []
    if scratchpad:
        parts.append(f"Council Scratchpad Notes:\n{scratchpad}")
    if previous_results:
        block = "\n\n".join(
            f"=== Previous Review: {role} ===\n{analysis}"
            for _, role, analysis in previous_results
        )
        parts.insert(0, block)
    if parts:
        return f"""Original text:
---
{text}
---

{"\n\n".join(parts)}"""
    return text


async def _call_member(
    bridge: OpenCodeBridge,
    member: PresetMember,
    text: str,
    scratchpad: str | None = None,
    previous_results: list[tuple[str, str, str]] | None = None,
) -> MemberResult:
    system = _build_system_prompt(member.role, member.contract) + CHAIN_OF_THOUGHT_KICKER
    user_text = _build_user_text(text, scratchpad, previous_results)
    async with bridge.session_context() as session:
        response = await bridge.send_message(
            session_id=session.id,
            model=member.model,
            system=system,
            parts=[{"type": "text", "text": user_text}],
            tools={},
        )
    return MemberResult(
        member_id=member.id,
        role=member.role,
        model=member.model,
        analysis=_clean_response(response),
        recommendation=None,
        risks=[],
        confidence=0.5,
    )


def anonymize_and_shuffle(
    results: list[MemberResult],
) -> list[tuple[str, str, str]]:
    pool = [(r.member_id, r.role, r.analysis) for r in results]
    random.shuffle(pool)
    return pool


def _build_critique_prompt(
    member: PresetMember,
    text: str,
    anonymized: list[tuple[str, str, str]],
    scratchpad: str | None = None,
) -> str:
    responses_block = "\n\n".join(
        f"=== Response {i+1} (by {role}) ===\n{analysis}"
        for i, (_, role, analysis) in enumerate(anonymized)
    )
    return f"""Role: {member.role}
Contract: {member.contract}

You are evaluating your PEERS' responses to the original text below. Do NOT evaluate your own response — you will only see other reviewers' answers.

Original text:
---
{text}
---

Peer responses to evaluate:
{responses_block}

For each response, provide:
1. A ranking (best to worst)
2. Strongest points of each response
3. Weaknesses of each response
4. Specific disagreements you have with each response

IMPORTANT: Cite specific passages from the responses to justify your evaluation. Be critical but constructive.

Output as JSON with keys: rankings (list of response numbers, best first), strongest_points (map), weaknesses (map), disagreements (list)."""


async def _run_critique(
    bridge: OpenCodeBridge,
    member: PresetMember,
    text: str,
    anonymized: list[tuple[str, str, str]],
    scratchpad: str | None = None,
) -> Critique:
    prompt = _build_critique_prompt(member, text, anonymized, scratchpad)
    async with bridge.session_context() as session:
        response = await bridge.send_message(
            session_id=session.id,
            model=member.model,
            system="You are a peer reviewer evaluating other reviewers. Be critical and specific.",
            parts=[{"type": "text", "text": prompt}],
            tools={},
        )
    return Critique(
        reviewer_id=member.id,
        rankings=[],
        strongest_points=[],
        weaknesses={},
        disagreements=[_clean_response(response)],
    )


def _build_chair_prompt(
    preset: PresetConfig,
    text: str,
    member_results: list[MemberResult],
    critiques: list[Critique],
    scratchpad: str | None = None,
) -> str:
    members_block = "\n\n".join(
        f"=== {r.role} ({r.member_id}) ===\n{r.analysis}"
        for r in member_results
    )
    critiques_block = "\n\n".join(
        f"=== Critique by {c.reviewer_id} ===\n" + "\n".join(c.disagreements)
        for c in critiques
    )
    scratchpad_block = f"\n\nCouncil Scratchpad Notes:\n{scratchpad}" if scratchpad else ""
    return f"""You are the Chair of a scientific writing council.

Original text:
---
{text}
---

Independent member reviews:
{members_block}

Peer critiques of those reviews:
{critiques_block}
{scratchpad_block}
{preset.chair.contract}

IMPORTANT: Respond with ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON. Start your response with {{ and end with }}.

JSON schema:
{{
  "verdict": "brief verdict",
  "consensus": ["point 1", "point 2"],
  "disagreements": ["point 1", "point 2"],
  "scientific_risks": ["risk 1", "risk 2"],
  "recommended_text": "revised passage or null",
  "rationale": "detailed explanation"
}}"""


def _parse_chair_json(text: str) -> dict:
    import re
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end > brace_start:
            try:
                return json.loads(text[brace_start : brace_end + 1])
            except json.JSONDecodeError:
                pass
    return {"rationale": text}


async def run_council(
    bridge: OpenCodeBridge,
    preset_id: str,
    text: str,
    scratchpad: str | None = None,
    model_overrides: dict[str, ModelRef] | None = None,
) -> tuple[list[MemberResult], ChairResult | None, list[Critique] | None]:
    preset = get_preset(preset_id)
    overrides = model_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=overrides.get(m.id, m.model),
            contract=m.contract,
            skip_in_critique=m.skip_in_critique,
        )
        for m in preset.members
    ]

    stage_errors: list[tuple[str, str]] = []

    member_results: list[MemberResult] = []
    if preset.sequential:
        previous: list[tuple[str, str, str]] = []
        for m in members:
            try:
                result = await _call_member(bridge, m, text, scratchpad, previous)
                member_results.append(result)
                previous.append((m.id, m.role, result.analysis))
            except Exception as e:
                stage_errors.append(("member", str(e)))
    else:
        tasks = [_call_member(bridge, m, text, scratchpad) for m in members]
        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
                member_results.append(result)
            except Exception as e:
                stage_errors.append(("member", str(e)))

    if len(member_results) < 2:
        raise PipelineError(
            f"Quorum not met: {len(member_results)}/2 members succeeded. "
            f"Errors: {stage_errors}"
        )

    critiques: list[Critique] | None = None
    chair_result: ChairResult | None = None

    if not preset.skip_critique and len(member_results) >= 2:
        anonymized = anonymize_and_shuffle(member_results)
        critique_tasks = []
        for m in members:
            if m.skip_in_critique:
                continue
            critique_tasks.append(
                _run_critique(bridge, m, text, anonymized, scratchpad)
            )
        if critique_tasks:
            critiques_results: list[Critique | None] = []
            for coro in asyncio.as_completed(critique_tasks):
                try:
                    critiques_results.append(await coro)
                except Exception as e:
                    stage_errors.append(("critique", str(e)))
            critiques = [c for c in critiques_results if c is not None]

    if not preset.skip_chair and preset.chair and member_results:
        try:
            chair_prompt = _build_chair_prompt(
                preset, text, member_results, critiques or [], scratchpad
            )
            async with bridge.session_context() as session:
                chair_text = await bridge.send_message(
                    session_id=session.id,
                    model=preset.chair.model,
                    system="You are the Chair of a scientific writing council. Synthesize, do not average.",
                    parts=[{"type": "text", "text": chair_prompt}],
                    tools={},
                )
            parsed_chair = _parse_chair_json(chair_text)
            chair_result = ChairResult(
                verdict=parsed_chair.get("verdict", ""),
                consensus=parsed_chair.get("consensus", []),
                disagreements=parsed_chair.get("disagreements", []),
                scientific_risks=parsed_chair.get("scientific_risks", []),
                recommended_text=parsed_chair.get("recommended_text"),
                rationale=parsed_chair.get("rationale", chair_text),
            )
        except Exception as e:
            stage_errors.append(("chair", str(e)))

    if stage_errors:
        member_results.append(
            MemberResult(
                member_id="_system",
                role="System",
                model=ModelRef(provider="", model=""),
                analysis=f"Stage errors during council run:\n" + "\n".join(
                    f"  [{s}] {e}" for s, e in stage_errors
                ),
                recommendation=None,
                risks=[],
                confidence=0.0,
            )
        )

    return member_results, chair_result, critiques


async def _stream_member(
    bridge: OpenCodeBridge,
    member: PresetMember,
    text: str,
    scratchpad: str | None = None,
    previous_results: list[tuple[str, str, str]] | None = None,
) -> AsyncIterator[tuple[str, list[str], float]]:
    system = _build_system_prompt(member.role, member.contract) + CHAIN_OF_THOUGHT_KICKER
    user_text = _build_user_text(text, scratchpad, previous_results)

    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    session = await bridge.create_session()
    try:
        async def listen():
            try:
                async for ev in bridge.stream_events():
                    props = ev.get("properties", {})
                    if props.get("sessionID") == session.id:
                        await queue.put(ev)
            except Exception:
                pass
            finally:
                await queue.put(None)

        listener = asyncio.create_task(listen())
        await asyncio.sleep(0.05)

        await bridge.send_message_async(
            session_id=session.id,
            model=member.model,
            system=system,
            parts=[{"type": "text", "text": user_text}],
            tools={},
        )

        full = ""
        risks: list[str] = []
        confidence = 0.5
        while True:
            ev = await queue.get()
            if ev is None:
                break
            ev_type = ev.get("type", "")
            props = ev.get("properties", {})
            if ev_type == "message.part.delta":
                delta = props.get("delta", "")
                if delta:
                    full += delta
                    yield ("chunk", _clean_response(full), risks, confidence)
            elif ev_type == "message.part.updated":
                part = props.get("part", {})
                if part.get("type") == "text" and part.get("text"):
                    pass
            elif ev_type == "session.idle":
                break

        listener.cancel()
        try:
            await listener
        except (asyncio.CancelledError, Exception):
            pass

        final = _clean_response(full)
        yield ("done", final, risks, confidence)

    finally:
        await session.delete()


async def run_council_streaming(
    bridge: OpenCodeBridge,
    preset_id: str,
    text: str,
    scratchpad: str | None = None,
    model_overrides: dict[str, ModelRef] | None = None,
) -> AsyncIterator[dict]:
    preset = get_preset(preset_id)
    overrides = model_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=overrides.get(m.id, m.model),
            contract=m.contract,
            skip_in_critique=m.skip_in_critique,
        )
        for m in preset.members
    ]

    yield {"event": "stage", "data": {"stage": "members", "status": "starting", "total": len(members)}}

    def _emit_member(role, analysis, risks, confidence, mid, model_dict):
        return {
            "event": "member_done",
            "data": {
                "member_id": mid,
                "role": role,
                "analysis": analysis,
                "risks": risks,
                "confidence": confidence,
                "model": model_dict,
            },
        }

    member_results: list[MemberResult] = []
    previous: list[tuple[str, str, str]] = []
    for m in members:
        try:
            utils_block = (previous if not preset.sequential else None)
            full_text = ""
            member_risks: list[str] = []
            member_conf = 0.5
            async for evt in _stream_member(bridge, m, text, scratchpad,
                                             previous if preset.sequential else None):
                etype = evt[0]
                if etype == "chunk":
                    full_text = evt[1]
                    yield {"event": "member_text", "data": {"member_id": m.id, "text": full_text}}
                elif etype == "done":
                    full_text = evt[1]
            result = MemberResult(
                member_id=m.id, role=m.role, model=m.model,
                analysis=full_text, recommendation=None, risks=[], confidence=0.5,
            )
            member_results.append(result)
            previous.append((m.id, m.role, full_text))
            yield _emit_member(m.role, full_text, [], 0.5, m.id, m.model.model_dump())
        except Exception as e:
            yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e)}}

    yield {"event": "stage", "data": {"stage": "members", "status": "complete", "total": len(member_results)}}

    if len(member_results) < 2:
        yield {"event": "error", "data": f"Quorum not met: {len(member_results)}/2 members"}
        return

    critiques: list[Critique] = []
    if not preset.skip_critique and len(member_results) >= 2:
        yield {"event": "stage", "data": {"stage": "critiques", "status": "starting", "total": len(members)}}

        anonymized = anonymize_and_shuffle(member_results)
        critique_tasks: dict[asyncio.Task, PresetMember] = {}
        for m in members:
            if m.skip_in_critique:
                continue
            t = asyncio.create_task(_run_critique(bridge, m, text, anonymized, scratchpad))
            critique_tasks[t] = m

        pending = set(critique_tasks.keys())
        while pending:
            done_set, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done_set:
                m = critique_tasks[task]
                try:
                    c = task.result()
                    critiques.append(c)
                    yield {"event": "critique_done", "data": {"reviewer_id": c.reviewer_id, "disagreements": c.disagreements}}
                except Exception as e:
                    yield {"event": "critique_error", "data": {"reviewer_id": m.id, "role": m.role, "error": str(e)}}

        yield {"event": "stage", "data": {"stage": "critiques", "status": "complete", "total": len(critiques)}}

    chair_result: ChairResult | None = None
    if not preset.skip_chair and preset.chair and member_results:
        yield {"event": "stage", "data": {"stage": "chair", "status": "starting"}}
        try:
            chair_prompt = _build_chair_prompt(
                preset, text, member_results, critiques or [], scratchpad
            )
            async with bridge.session_context() as session:
                chair_text = await bridge.send_message(
                    session_id=session.id,
                    model=preset.chair.model,
                    system="You are the Chair of a scientific writing council. Synthesize, do not average.",
                    parts=[{"type": "text", "text": chair_prompt}],
                    tools={},
                )
            parsed = _parse_chair_json(chair_text)
            chair_result = ChairResult(
                verdict=parsed.get("verdict", ""),
                consensus=parsed.get("consensus", []),
                disagreements=parsed.get("disagreements", []),
                scientific_risks=parsed.get("scientific_risks", []),
                recommended_text=parsed.get("recommended_text"),
                rationale=parsed.get("rationale", chair_text),
            )
            yield {"event": "chair_done", "data": chair_result.model_dump()}
        except Exception as e:
            yield {"event": "chair_error", "data": str(e)}

    yield {"event": "stage", "data": {"stage": "chair", "status": "complete"}}
    yield {"event": "done", "data": {"member_count": len(member_results), "critique_count": len(critiques)}}
