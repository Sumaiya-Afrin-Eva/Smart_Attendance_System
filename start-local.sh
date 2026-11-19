#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_FILE="$ROOT_DIR/backend.log"

echo "== Smart Attendance: local backend mode =="

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend folder not found: $BACKEND_DIR"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend folder not found: $FRONTEND_DIR"
  exit 1
fi

if [[ ! -d "$BACKEND_DIR/venv" ]]; then
  echo "Creating backend virtual environment with Python 3.11..."
  cd "$BACKEND_DIR"
  python3.11 -m venv venv
fi

wait_for_backend() {
  local attempts="${1:-30}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if ! curl -fsS "http://127.0.0.1:8000/api/health" >/dev/null 2>&1; then
  echo "Starting local backend on http://127.0.0.1:8000..."
  cd "$BACKEND_DIR"
  # shellcheck disable=SC1091
  source venv/bin/activate
  nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_FILE" 2>&1 &
  deactivate

  if ! wait_for_backend 30; then
    echo "Backend failed to start. Check logs: $LOG_FILE"
    exit 1
  fi
else
  echo "Backend already running on http://127.0.0.1:8000"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm install
fi

echo "Starting frontend in local mode..."
cd "$FRONTEND_DIR"
VITE_API_URL= VITE_BACKEND_TARGET= npm run dev -- --host 0.0.0.0
