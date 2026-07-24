# Research Writing Council

## Structure

Two-package project: `backend/` (Python FastAPI) + `frontend/` (React/Vite/Tailwind). No monorepo tool — each package has its own dependency manager.

```
backend/        Python 3.11+, FastAPI, httpx, sse-starlette, uvicorn
  main.py       FastAPI app, routes, lifespan-managed opencode bridge
  bridge.py     HTTP client to `opencode serve` (model gateway)
  pipeline.py   Council/debate orchestration (members → critiques → chair)
  storage.py    Session persistence (JSON files)
  debug_log.py  Debug logging (JSONL files)
  models.py     Pydantic models
  presets/*.json  Council member configurations
frontend/       React 19, TypeScript 5.7, Vite 6, Tailwind 3
  src/App.tsx   Root state, session creation, SSE event handling
  src/Chat.tsx  Chat UI, streaming display, council progress
```

## Setup & Run

```bash
# Backend
cd backend && uv sync && uv pip install -e .

# Frontend
cd frontend && pnpm install

# Run both
./run.sh
# Backend: http://127.0.0.1:8080  (uvicorn --reload)
# Frontend: http://localhost:5173   (Vite dev server proxies /api → :8080)
```

## Key Commands

| Action | Command |
|---|---|
| Start dev | `./run.sh` (kills stale :8080/:5173 first) |
| Typecheck frontend | `cd frontend && npx tsc --noEmit` |
| Build frontend | `cd frontend && pnpm build` (tsc -b + vite build) |
| Run backend alone | `PYTHONPATH=<root> uv run --directory backend uvicorn backend.main:app --app-dir <root> --host 127.0.0.1 --port 8080 --reload` |

## Architecture Notes

- **Model gateway**: `opencode serve` (external CLI) is auto-launched by the backend lifespan. The `OpenCodeBridge` speaks HTTP REST + SSE to it.
- **Two modes**: "council" (reviews → critiques → chair) and "debate" (4 rounds: reviews → critique → revision → final critique → chair).
- **SSE streaming**: Both `/api/chat` and `/api/council/stream` return `EventSourceResponse`. The frontend reads the SSE body reader directly (no EventSource API).
- **Sessions**: Created on page load, passed as `app_session_id` on every request. Persisted to `data/sessions/*.json`. Debug logs to `data/debug/*.jsonl` (ignored by git).
- **Import quirk**: Backend uses `from backend import ...` style. Needs `PYTHONPATH=<project_root>` when running, which `./run.sh` sets via `--app-dir` and `PYTHONPATH`.
- **Presets**: JSON files in `backend/presets/` define member roles, models, contracts, and chair config. Loaded by `presets/__init__.py` on each request (not cached).
- **No tests, no linter, no CI, no pre-commit**. This is a dev prototype.
- **No `model_overrides` or `contract_overrides` endpoint exists for runtime overrides** — they're handled at the API level via request body fields.

## Debug Logs

Every model call is logged as JSONL to `data/debug/<session_id>.jsonl`. Inspect in-app via the debug button (list icon next to settings gear) or at:
- `GET /api/debug/logs` — list all debug logs
- `GET /api/debug/logs/{session_id}` — get entries for a session

## Conventions

- Frontend uses `fetch` (no axios/React Query). SSE uses raw `ReadableStream` reader.
- No CSS modules or styled components — Tailwind utility classes throughout.
- No React Router — single-page, state-driven UI.
- Backend uses SSE events with `event:` + `data:` lines (not NDJSON).
- `data/` dirs are gitignored — all session/debug data is ephemeral per dev environment.
