#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

cleanup() {
  echo ""
  echo "→ Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Kill stale processes on our ports
lsof -ti tcp:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti tcp:5173 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "→ Starting Research Writing Council..."
echo ""

echo "→ Starting backend on http://127.0.0.1:8080"
cd "$ROOT"
PYTHONPATH="$ROOT" uv run --directory "$BACKEND_DIR" uvicorn backend.main:app \
  --app-dir "$ROOT" \
  --host 127.0.0.1 --port 8080 --reload &
BACKEND_PID=$!

sleep 2

echo "→ Starting frontend on http://localhost:5173"
cd "$FRONTEND_DIR"
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "→ Backend:  http://127.0.0.1:8080"
echo "→ Frontend: http://localhost:5173"
echo "→ Docs:     http://127.0.0.1:8080/docs"
echo ""

wait
