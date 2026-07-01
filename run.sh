#!/usr/bin/env bash
# Dev launcher: FastAPI on :8000, Vite on :5173 (proxies /api).
set -e
cd "$(dirname "$0")"

if [ ! -d backend/.venv ]; then
  echo "Creating venv..."
  uv venv --python 3.12 backend/.venv
  uv pip install -r backend/requirements.txt --python backend/.venv/bin/python
fi
if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend deps..."
  (cd frontend && npm install)
fi

trap 'kill 0' EXIT
(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev) &
wait
