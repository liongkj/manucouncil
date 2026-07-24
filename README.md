# Research Writing Council

A multi-model editorial board for scientific writing. Submit a passage and get independent reviews from specialized agents (Scientific Editor, Skeptical Referee, Argument Editor, Language Editor), anonymous peer critique between them, and a Chair synthesis — all streamed progressively.

## Architecture

```
User text → Council members (parallel) → Anonymous critiques → Chair synthesis → Result
```

Built with **FastAPI** backend + **React** frontend. Uses `opencode serve` as the model gateway (works with any opencode-compatible provider).

## Presets

| Preset | Members | Chair | Use case |
|---|---|---|---|
| Scientific Claim | Scientific Editor, Skeptical Referee | Yes | Overstatement, causality, scope, novelty |
| Introduction | Argument Editor, Scientific Editor, Skeptical Referee | Yes | Structure, gap claims, logical flow |
| Reviewer Response | Scientific Editor, Argument Editor, Skeptical Referee, Language Editor | Yes | Evaluating rebuttals |
| Sentence Polish (Quick) | Language Editor, Scientific Verifier | No | Fast grammar + safety check |
| Sentence Polish (Council) | Language Editor, Scientific Verifier | Yes | Full council review of edits |

## Setup

```bash
# Backend
cd backend && uv sync

# Frontend
cd frontend && pnpm install
```

Requires `opencode` CLI with an active subscription or connected providers.

## Run

```bash
./run.sh
```

Opens at http://localhost:5173. Backend API at http://127.0.0.1:8080.
