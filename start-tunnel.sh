#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
TARGET_URL="${1:-${BACKEND_URL:-}}"

if [[ -z "$TARGET_URL" ]]; then
  echo "Usage: ./start-tunnel.sh https://your-tunnel-url"
  echo "       or: BACKEND_URL=https://your-tunnel-url ./start-tunnel.sh"
  exit 1
fi

TARGET_URL="${TARGET_URL%/}"

echo "== Smart Attendance: tunnel backend mode =="
echo "Backend target: $TARGET_URL"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend folder not found: $FRONTEND_DIR"
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm install
fi

cd "$FRONTEND_DIR"
VITE_API_URL="${TARGET_URL}/api" VITE_BACKEND_TARGET="$TARGET_URL" npm run dev -- --host 0.0.0.0
