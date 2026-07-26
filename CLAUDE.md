# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` in the repo root covers the same ground for other agents — keep the two in sync when architecture changes.

## Commands

```bash
./run.sh                                  # start both (kills stale :8080/:5173 first)
cd backend && uv sync                     # backend deps
cd frontend && pnpm install               # frontend deps (pnpm, not npm)
cd frontend && npx tsc --noEmit           # typecheck
cd frontend && pnpm build                 # tsc -b && vite build
```

Backend alone (the `PYTHONPATH`/`--app-dir` bit is required — see Import quirk):

```bash
PYTHONPATH="$PWD" uv run --directory backend uvicorn backend.main:app \
  --app-dir "$PWD" --host 127.0.0.1 --port 8080 --reload
```

Frontend dev server proxies `/api` → `127.0.0.1:8080`. FastAPI docs at `/docs`.

No tests, no linter, no CI, no pre-commit — this is a dev prototype.

## Architecture

Two packages, no monorepo tool: `backend/` (FastAPI, Python 3.11+) and `frontend/` (React 19 / Vite 6 / Tailwind 3 / TypeScript 5.7).

**Model gateway.** All model calls go through `opencode serve`, an external CLI. `main.py`'s lifespan looks for a running server, launches one if absent, waits for health, and tears it down on shutdown. `bridge.py`'s `OpenCodeBridge` speaks HTTP REST + SSE to it. Nothing in this repo talks to a model provider directly — provider/model pairs (`{"provider": "deepseek", "model": "..."}`) are just strings opencode resolves.

**Pipeline (`pipeline.py`, ~1200 lines — the core).** Two modes, each with a streaming and a non-streaming variant:

- `council`: members run in parallel → anonymous peer critiques → chair synthesis.
- `debate`: 4 rounds — reviews → critique → revision → final critique → chair.

Members are anonymized to each other via `label_map` on `Critique` so critique is blind. Chair output and critiques are JSON parsed from model text with a retry (`critique_retry`) and a fenced-code stripper (`_clean_response`); treat parse failures as expected, not exceptional.

**Member response format.** Members reply in five headings — `THINKING`, `ANALYSIS`, `RECOMMENDATION`, `RISKS`, `CONFIDENCE` — appended to every contract from `env.pipeline.prompts.member_output_format`. `_parse_member_response` splits them tolerantly (stray markdown, `85%` vs `0.85`) and each field degrades independently: a reply with no recognisable headings still yields its whole text as the analysis. This is what makes `recommendation`/`risks`/`confidence` real values rather than the hardcoded `None`/`[]`/`0.5` they used to be. Members whose deliverable is rewritten text rather than an analysis (the polish presets) set `output_format` on the preset member to override the five headings. Contracts should describe *what to examine* only — the format block owns response shape, so don't add an `Output:` section to a contract.

**Presets (`backend/presets/*.json`).** Define members (id, role, model, contract prompt), optional chair, and `skip_critique`/`skip_chair`/`sequential`. Loaded fresh from disk on every request (`load_presets()` — no caching), so editing a JSON preset takes effect without restart. Adding a preset = dropping in a JSON file matching `PresetConfig` in `models.py`.

**Config (`backend/config.py`)** — two TOML files, loaded once into module-level `env` and `council` singletons:

- `env.toml` → infrastructure: server, CORS, opencode ports/timeouts, HTTP client timeouts, storage/debug dirs, and the *pipeline prompt strings* (critique/chair/revision system prompts, chain-of-thought kicker). Prompt-tuning lives here, not in Python.
- `config.toml` → council defaults: `mode`, `model_overrides`, `contract_overrides`.

Dataclasses hold the defaults; `_merge` overlays TOML keys onto them and recurses into nested tables (`[pipeline.prompts]`) so a nested table refines the nested dataclass instead of replacing it with a bare dict. `OPENCODE_SERVER_PASSWORD` and `OPENCODE_PORT` env vars override `[opencode]`.

Per-request `model_overrides` / `contract_overrides` come in on the `CouncilRequest` body — there is no separate override endpoint.

**SSE.** `/api/chat`, `/api/council/stream` return `EventSourceResponse` with `event:` + `data:` line pairs (not NDJSON). Council event names: `starting`, `member_done`/`member_error`, `critique_done`/`critique_error`, `chair_starting`/`chair_done`/`chair_error`, `member_revision`, `complete`, `error`. The frontend does **not** use `EventSource` — `App.tsx` reads `res.body.getReader()` and parses the lines by hand, so any new event type needs handling in both places.

**Sessions & debug.** A session is created on page load; its id rides along as `app_session_id` on every request. Persisted as JSON under `data/sessions/`. Every model call is appended to `data/debug/<session_id>.jsonl` (`debug_log.py`), viewable in-app via the debug button or `GET /api/debug/logs[/{session_id}]`. All of `data/` is gitignored and ephemeral.

**Import quirk.** Backend modules import as `from backend import ...`, so running uvicorn requires the project root on the path — hence `PYTHONPATH` + `--app-dir` in `run.sh`. Running from inside `backend/` without those will fail.

## Conventions

- Frontend: `fetch` only (no axios/React Query), no React Router (single page, state in `App.tsx`), Tailwind utilities only (no CSS modules or styled-components).
- Backend request/response shapes all live in `models.py` as Pydantic models; the frontend mirrors them in `src/types.ts` by hand — change both together.
