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


def _build_peer_pool(
    results: list[MemberResult],
    exclude_id: str | None = None,
) -> list[tuple[str, str]]:
    pool = [(r.member_id, r.analysis) for r in results if r.member_id != exclude_id]
    random.shuffle(pool)
    return pool


def _build_critique_prompt(
    member: PresetMember,
    text: str,
    peer_pool: list[tuple[str, str]],
    scratchpad: str | None = None,
) -> str:
    labels = "ABCDEFGHIJ"
    responses_block = "\n\n".join(
        f"=== Response {labels[i]} ===\n{analysis}"
        for i, (_, analysis) in enumerate(peer_pool)
    )
    return f"""Role: {member.role}
Contract: {member.contract}

You are evaluating your PEERS' responses to the original text below. Your own response is NOT included.

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
    peer_pool: list[tuple[str, str]],
    scratchpad: str | None = None,
) -> Critique:
    prompt = _build_critique_prompt(member, text, peer_pool, scratchpad)
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
    contract_overrides: dict[str, str] | None = None,
) -> tuple[list[MemberResult], ChairResult | None, list[Critique] | None]:
    preset = get_preset(preset_id)
    model_over = model_overrides or {}
    contract_over = contract_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=model_over.get(m.id, m.model),
            contract=contract_over.get(m.id, m.contract),
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
        critique_tasks = []
        for m in members:
            if m.skip_in_critique:
                continue
            pool = _build_peer_pool(member_results, exclude_id=m.id)
            if len(pool) < 1:
                continue
            critique_tasks.append(
                _run_critique(bridge, m, text, pool, scratchpad)
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
    contract_overrides: dict[str, str] | None = None,
) -> AsyncIterator[dict]:
    preset = get_preset(preset_id)
    model_over = model_overrides or {}
    contract_over = contract_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=model_over.get(m.id, m.model),
            contract=contract_over.get(m.id, m.contract),
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
    if preset.sequential:
        previous: list[tuple[str, str, str]] = []
        for m in members:
            try:
                full_text = ""
                async for evt in _stream_member(bridge, m, text, scratchpad, previous):
                    if evt[0] == "chunk":
                        full_text = evt[1]
                        yield {"event": "member_text", "data": {"member_id": m.id, "text": full_text}}
                result = MemberResult(
                    member_id=m.id, role=m.role, model=m.model,
                    analysis=full_text, recommendation=None, risks=[], confidence=0.5,
                )
                member_results.append(result)
                previous.append((m.id, m.role, full_text))
                yield _emit_member(m.role, full_text, [], 0.5, m.id, m.model.model_dump())
            except Exception as e:
                yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e)}}
    else:
        queue: asyncio.Queue = asyncio.Queue()
        member_texts: dict[str, str] = {}
        member_complete: dict[str, bool] = {}

        async def run_one(member: PresetMember):
            try:
                async for evt in _stream_member(bridge, member, text, scratchpad):
                    if evt[0] == "chunk":
                        await queue.put(("text", member.id, evt[1]))
                    elif evt[0] == "done":
                        await queue.put(("done", member.id, evt[1]))
            except Exception as e:
                await queue.put(("error", member.id, str(e)))

        tasks = [asyncio.create_task(run_one(m)) for m in members]

        while len(member_complete) < len(members):
            evt_type, mid, val = await queue.get()
            if evt_type == "text":
                member_texts[mid] = val
                yield {"event": "member_text", "data": {"member_id": mid, "text": val}}
            elif evt_type == "done":
                member_complete[mid] = True
                member_texts[mid] = val
                m = next(m for m in members if m.id == mid)
                result = MemberResult(
                    member_id=mid, role=m.role, model=m.model,
                    analysis=val, recommendation=None, risks=[], confidence=0.5,
                )
                member_results.append(result)
                yield _emit_member(m.role, val, [], 0.5, mid, m.model.model_dump())
            elif evt_type == "error":
                member_complete[mid] = True
                yield {"event": "member_error", "data": {"member_id": mid, "error": val}}

        for t in tasks:
            t.cancel()

    yield {"event": "stage", "data": {"stage": "members", "status": "complete", "total": len(member_results)}}

    if len(member_results) < 2:
        yield {"event": "error", "data": f"Quorum not met: {len(member_results)}/2 members"}
        return

    critiques: list[Critique] = []
    if not preset.skip_critique and len(member_results) >= 2:
        yield {"event": "stage", "data": {"stage": "critiques", "status": "starting", "total": len(members)}}

        critique_tasks: dict[asyncio.Task, PresetMember] = {}
        for m in members:
            if m.skip_in_critique:
                continue
            pool = _build_peer_pool(member_results, exclude_id=m.id)
            if len(pool) < 1:
                continue
            t = asyncio.create_task(_run_critique(bridge, m, text, pool, scratchpad))
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


def _build_revision_prompt(
    member: PresetMember,
    text: str,
    own_review: str,
    all_member_results: list[MemberResult],
    critiques: list[Critique],
    scratchpad: str | None = None,
) -> str:
    others_block = "\n\n".join(
        f"=== {r.role} ({r.member_id}) ===\n{r.analysis}"
        for r in all_member_results if r.member_id != member.id
    )
    critiques_of_self = [
        c for c in critiques if c.reviewer_id != member.id
    ]
    critiques_block = "\n\n".join(
        f"=== Critique by reviewer of {member.role} ===\n" + "\n".join(c.disagreements)
        for c in critiques_of_self
    )
    scratchpad_block = f"\n\nCouncil Scratchpad Notes:\n{scratchpad}" if scratchpad else ""
    return f"""You are {member.role} in a research writing council. You previously wrote the following analysis:

Original text:
---
{text}
---

Your original analysis:
---
{own_review}
---

Other council members' analyses:
{others_block}

Peer critiques directed at your analysis:
{critiques_block}
{scratchpad_block}

Now, based on the other members' perspectives and the critiques received, produce a REVISED analysis.
- You may change your mind, refine your reasoning, or defend your original position
- Respond to the critiques explicitly
- Update your risks, confidence, and recommendations as needed
- Write in natural prose

Your revised analysis:"""


async def _call_member_revision(
    bridge: OpenCodeBridge,
    member: PresetMember,
    text: str,
    own_review: str,
    all_member_results: list[MemberResult],
    critiques: list[Critique],
    scratchpad: str | None = None,
) -> MemberResult:
    system = f"Role: {member.role}\n\n{member.contract}\n\nYou are participating in a multi-round debate. Revise your analysis based on peer feedback."
    prompt = _build_revision_prompt(member, text, own_review, all_member_results, critiques, scratchpad)
    async with bridge.session_context() as session:
        response = await bridge.send_message(
            session_id=session.id,
            model=member.model,
            system=system,
            parts=[{"type": "text", "text": prompt}],
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


async def run_council_debate(
    bridge: OpenCodeBridge,
    preset_id: str,
    text: str,
    scratchpad: str | None = None,
    model_overrides: dict[str, ModelRef] | None = None,
    contract_overrides: dict[str, str] | None = None,
) -> AsyncIterator[dict]:
    preset = get_preset(preset_id)
    model_over = model_overrides or {}
    contract_over = contract_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=model_over.get(m.id, m.model),
            contract=contract_over.get(m.id, m.contract),
            skip_in_critique=m.skip_in_critique,
        )
        for m in preset.members
    ]

    if preset.skip_chair or preset.skip_critique:
        yield {"event": "error", "data": "Debate mode requires critiques and chair"}
        return

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_1_reviews", "round": 1, "total": 4}}

    # Round 1: Independent reviews
    member_results: list[MemberResult] = []
    if preset.sequential:
        previous: list[tuple[str, str, str]] = []
        for m in members:
            try:
                result = await _call_member(bridge, m, text, scratchpad, previous)
                member_results.append(result)
                previous.append((m.id, m.role, result.analysis))
                yield {"event": "member_done", "data": {
                    "member_id": m.id, "role": m.role, "analysis": result.analysis,
                    "risks": [], "confidence": 0.5, "model": m.model.model_dump(), "round": 1,
                }}
            except Exception as e:
                yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e), "round": 1}}
    else:
        tasks = [_call_member(bridge, m, text, scratchpad) for m in members]
        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
                member_results.append(result)
                yield {"event": "member_done", "data": {
                    "member_id": result.member_id, "role": result.role, "analysis": result.analysis,
                    "risks": [], "confidence": 0.5, "model": result.model.model_dump(), "round": 1,
                }}
            except Exception as e:
                pass

    if len(member_results) < 2:
        yield {"event": "error", "data": "Quorum not met"}
        return

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_2_critique", "round": 2, "total": 4}}

    # Round 2: Critique
    critiques: list[Critique] = []
    c2_tasks = []
    for m in members:
        if m.skip_in_critique:
            continue
        pool = _build_peer_pool(member_results, exclude_id=m.id)
        if len(pool) < 1:
            continue
        c2_tasks.append(_run_critique(bridge, m, text, pool, scratchpad))
    for coro in asyncio.as_completed(c2_tasks):
        try:
            c = await coro
            critiques.append(c)
            yield {"event": "critique_done", "data": {"reviewer_id": c.reviewer_id, "disagreements": c.disagreements, "round": 2}}
        except Exception:
            pass

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_3_revision", "round": 3, "total": 4}}

    # Round 3: Revision - each member revises their own review
    revised: list[MemberResult] = []
    revision_tasks = [
        _call_member_revision(bridge, m, text, result.analysis, member_results, critiques, scratchpad)
        for m, result in zip(members, member_results)
        if result.member_id == m.id
    ]
    for coro in asyncio.as_completed(revision_tasks):
        try:
            r = await coro
            revised.append(r)
            yield {"event": "member_revision", "data": {
                "member_id": r.member_id, "role": r.role, "analysis": r.analysis,
                "model": r.model.model_dump(), "round": 3,
            }}
        except Exception as e:
            yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e), "round": 3}}

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_4_final_critique", "round": 4, "total": 4}}

    # Round 4: Critique of revised reviews
    final_critiques: list[Critique] = []
    fc_tasks = []
    for m in members:
        if m.skip_in_critique:
            continue
        pool = _build_peer_pool(revised, exclude_id=m.id)
        if len(pool) < 1:
            continue
        fc_tasks.append(_run_critique(bridge, m, text, pool, scratchpad))
    for coro in asyncio.as_completed(fc_tasks):
        try:
            c = await coro
            final_critiques.append(c)
            yield {"event": "critique_done", "data": {"reviewer_id": c.reviewer_id, "disagreements": c.disagreements, "round": 4}}
        except Exception:
            pass

    yield {"event": "stage", "data": {"stage": "debate", "status": "chair_starting", "round": 5, "total": 4}}

    # Chair synthesis
    if preset.chair:
        all_reviews = member_results + revised
        all_critiques = critiques + final_critiques
        try:
            chair_prompt = _build_chair_prompt(preset, text, all_reviews, all_critiques, scratchpad)
            async with bridge.session_context() as session:
                chair_text = await bridge.send_message(
                    session_id=session.id,
                    model=preset.chair.model,
                    system="You are the Chair of a research writing council debate. Synthesize all rounds.",
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

    yield {"event": "stage", "data": {"stage": "debate", "status": "complete", "round": 5, "total": 4}}
    yield {"event": "done", "data": {"member_count": len(member_results), "critique_count": len(critiques), "mode": "debate"}}


async def run_council_debate_nonstream(
    bridge: OpenCodeBridge,
    preset_id: str,
    text: str,
    scratchpad: str | None = None,
    model_overrides: dict[str, ModelRef] | None = None,
    contract_overrides: dict[str, str] | None = None,
) -> tuple[list[MemberResult], ChairResult | None, list[Critique] | None]:
    members_list: list[MemberResult] = []
    chair_out: ChairResult | None = None
    critiques_out: list[Critique] = []

    async for ev in run_council_debate(bridge, preset_id, text, scratchpad, model_overrides, contract_overrides):
        if ev["event"] == "member_done":
            members_list.append(MemberResult(**ev["data"]))
        elif ev["event"] == "member_revision":
            members_list.append(MemberResult(**ev["data"]))
        elif ev["event"] == "critique_done":
            critiques_out.append(Critique(**ev["data"]))
        elif ev["event"] == "chair_done":
            chair_out = ChairResult(**ev["data"])

    return members_list, chair_out, critiques_out if critiques_out else None
async def _stream_member_revision(
    bridge: OpenCodeBridge,
    member: PresetMember,
    text: str,
    own_review: str,
    all_member_results: list[MemberResult],
    critiques: list[Critique],
    scratchpad: str | None = None,
    log_session_id: str | None = None,
) -> AsyncIterator[tuple[str, str, list[str], float]]:
    system = f"Role: {member.role}\n\n{member.contract}\n\nYou are participating in a multi-round debate. Revise your analysis based on peer feedback."
    prompt = _build_revision_prompt(member, text, own_review, all_member_results, critiques, scratchpad)

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
            parts=[{"type": "text", "text": prompt}],
            tools={},
            log_session_id=log_session_id,
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


async def run_council_debate_streaming(
    bridge: OpenCodeBridge,
    preset_id: str,
    text: str,
    scratchpad: str | None = None,
    model_overrides: dict[str, ModelRef] | None = None,
    contract_overrides: dict[str, str] | None = None,
    log_session_id: str | None = None,
) -> AsyncIterator[dict]:
    preset = get_preset(preset_id)
    model_over = model_overrides or {}
    contract_over = contract_overrides or {}

    members = [
        PresetMember(
            id=m.id,
            role=m.role,
            model=model_over.get(m.id, m.model),
            contract=contract_over.get(m.id, m.contract),
            skip_in_critique=m.skip_in_critique,
        )
        for m in preset.members
    ]

    if preset.skip_chair or preset.skip_critique:
        yield {"event": "error", "data": "Debate mode requires critiques and chair"}
        return

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_1_reviews", "round": 1, "total": 4}}

    # Round 1: Independent reviews (streaming)
    member_results: list[MemberResult] = []
    if preset.sequential:
        previous: list[tuple[str, str, str]] = []
        for m in members:
            try:
                full_text = ""
                async for evt in _stream_member(bridge, m, text, scratchpad, previous, log_session_id):
                    if evt[0] == "chunk":
                        full_text = evt[1]
                        yield {"event": "member_text", "data": {"member_id": m.id, "text": full_text, "round": 1}}
                result = MemberResult(
                    member_id=m.id, role=m.role, model=m.model,
                    analysis=full_text, recommendation=None, risks=[], confidence=0.5, round=1,
                )
                member_results.append(result)
                previous.append((m.id, m.role, full_text))
                yield {"event": "member_done", "data": {
                    "member_id": m.id, "role": m.role, "analysis": full_text,
                    "risks": [], "confidence": 0.5, "model": m.model.model_dump(), "round": 1,
                }}
            except Exception as e:
                yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e), "round": 1}}
    else:
        queue: asyncio.Queue = asyncio.Queue()
        member_texts: dict[str, str] = {}
        member_complete: dict[str, bool] = {}

        async def run_one(member: PresetMember):
            try:
                async for evt in _stream_member(bridge, member, text, scratchpad, log_session_id=log_session_id):
                    if evt[0] == "chunk":
                        await queue.put(("text", member.id, evt[1]))
                    elif evt[0] == "done":
                        await queue.put(("done", member.id, evt[1]))
            except Exception as e:
                await queue.put(("error", member.id, str(e)))

        tasks = [asyncio.create_task(run_one(m)) for m in members]

        while len(member_complete) < len(members):
            evt_type, mid, val = await queue.get()
            if evt_type == "text":
                member_texts[mid] = val
                yield {"event": "member_text", "data": {"member_id": mid, "text": val, "round": 1}}
            elif evt_type == "done":
                member_complete[mid] = True
                member_texts[mid] = val
                m = next(m for m in members if m.id == mid)
                result = MemberResult(
                    member_id=mid, role=m.role, model=m.model,
                    analysis=val, recommendation=None, risks=[], confidence=0.5, round=1,
                )
                member_results.append(result)
                yield {"event": "member_done", "data": {
                    "member_id": mid, "role": m.role, "analysis": val,
                    "risks": [], "confidence": 0.5, "model": m.model.model_dump(), "round": 1,
                }}
            elif evt_type == "error":
                member_complete[mid] = True
                yield {"event": "member_error", "data": {"member_id": mid, "error": val, "round": 1}}

        for t in tasks:
            t.cancel()

    if len(member_results) < 2:
        yield {"event": "error", "data": "Quorum not met"}
        return

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_2_critique", "round": 2, "total": 4}}

    # Round 2: Critique
    critiques: list[Critique] = []
    c2_tasks = []
    for m in members:
        if m.skip_in_critique:
            continue
        pool = _build_peer_pool(member_results, exclude_id=m.id)
        if len(pool) < 1:
            continue
        c2_tasks.append(_run_critique(bridge, m, text, pool, scratchpad, log_session_id))
    for coro in asyncio.as_completed(c2_tasks):
        try:
            c = await coro
            critiques.append(c)
            yield {"event": "critique_done", "data": {"reviewer_id": c.reviewer_id, "disagreements": c.disagreements, "round": 2}}
        except Exception:
            pass

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_3_revision", "round": 3, "total": 4}}

    # Round 3: Revision (streaming)
    revised: list[MemberResult] = []
    own_reviews = {r.member_id: r.analysis for r in member_results}
    revision_tasks = [
        _stream_member_revision(bridge, m, text, own_reviews[m.id], member_results, critiques, scratchpad, log_session_id)
        for m in members if m.id in own_reviews
    ]
    for coro in asyncio.as_completed(revision_tasks):
        try:
            full_text = ""
            async for evt in coro:
                if evt[0] == "chunk":
                    full_text = evt[1]
                    yield {"event": "member_revision_text", "data": {"member_id": m.id, "text": full_text, "round": 3}}
                elif evt[0] == "done":
                    full_text = evt[1]
            m = next(m for m in members if m.id == mid)
            result = MemberResult(
                member_id=m.id, role=m.role, model=m.model,
                analysis=full_text, recommendation=None, risks=[], confidence=0.5, round=3,
            )
            revised.append(result)
            yield {"event": "member_revision", "data": {
                "member_id": m.id, "role": m.role, "analysis": full_text,
                "model": m.model.model_dump(), "round": 3,
            }}
        except Exception as e:
            yield {"event": "member_error", "data": {"member_id": m.id, "role": m.role, "error": str(e), "round": 3}}

    yield {"event": "stage", "data": {"stage": "debate", "status": "round_4_final_critique", "round": 4, "total": 4}}
