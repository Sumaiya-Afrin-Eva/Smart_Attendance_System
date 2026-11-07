#!/usr/bin/env bash
# ============================================================
#  Smart Attendance – Full Server Launcher (Friend's Laptop)
#
#  Starts:
#    1. FastAPI backend   on :8000  (LAN + internet via tunnel)
#    2. Cloudflare Tunnel → prints a public HTTPS URL to share
#    3. React frontend    on :5173  (local web app)
#
#  HOW TO USE (friend's laptop, first time)
#  -----------------------------------------
#  1. Install cloudflared (free, no account needed):
#       brew install cloudflare/cloudflare/cloudflared   # macOS
#       # OR download from https://github.com/cloudflare/cloudflared/releases
#
#  2. Install backend deps:
#       cd backend && python -m venv venv
#       source venv/bin/activate && pip install -r requirements.txt
#       deactivate && cd ..
#
#  3. Install frontend deps:
#       npm --prefix frontend install
#
#  4. Run:
#       chmod +x start-server.sh
#       ./start-server.sh
#
#  5. Copy the printed tunnel URL and share with Sumaiya, e.g.:
#       https://abc-def-123.trycloudflare.com
#
#  On Sumaiya's Mac:
#       export BACKEND_URL=https://abc-def-123.trycloudflare.com
#       ./kiosk/start-kiosk.sh
# ============================================================

set -e

trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

TUNNEL_LOG="/tmp/cloudflare-tunnel.log"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Smart Attendance  –  Full Server Mode      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Backend ────────────────────────────────────────────────
echo "→ Starting FastAPI backend on :8000"
cd backend
source venv/bin/activate
# host 0.0.0.0 so the tunnel (and LAN clients) can reach the API
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 &
BACKEND_PID=$!
deactivate
cd ..
echo "  Backend PID: $BACKEND_PID"

# Wait for FastAPI to be ready
echo "  Waiting for backend to start..."
for i in {1..20}; do
  if curl -sf http://127.0.0.1:8000/api/health > /dev/null 2>&1 || \
     curl -sf http://127.0.0.1:8000/docs       > /dev/null 2>&1; then
    echo "  ✓ Backend is ready"
    break
  fi
  sleep 1
done

# ── 2. Cloudflare Tunnel ─────────────────────────────────────
if command -v cloudflared &> /dev/null; then
  echo ""
  echo "→ Starting Cloudflare Tunnel (no account needed)"
  cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  echo "  Waiting for tunnel URL..."
  TUNNEL_URL=""
  for i in {1..30}; do
    TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [[ -n "$TUNNEL_URL" ]]; then break; fi
    sleep 1
  done

  echo ""
  if [[ -n "$TUNNEL_URL" ]]; then
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║  PUBLIC TUNNEL URL (share this with Sumaiya):             ║"
    echo "  ║                                                            ║"
    echo "  ║  $TUNNEL_URL"
    echo "  ║                                                            ║"
    echo "  ║  Sumaiya runs:                                            ║"
    echo "  ║    export BACKEND_URL=$TUNNEL_URL"
    echo "  ║    ./kiosk/start-kiosk.sh                                 ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo ""
  else
    echo "  ⚠ Could not detect tunnel URL. Check $TUNNEL_LOG"
    echo "    The backend is still running on :8000 for LAN access."
  fi
else
  echo ""
  echo "  ⚠ cloudflared not found — skipping tunnel."
  echo "    Install it:  brew install cloudflare/cloudflare/cloudflared"
  echo "    Or share your LAN IP with Sumaiya instead."
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
  echo ""
  echo "  Your LAN IP: ${LAN_IP:-<check manually>}"
  echo "  Sumaiya runs:"
  echo "    export BACKEND_URL=http://${LAN_IP:-192.168.1.X}:8000"
  echo "    ./kiosk/start-kiosk.sh"
  echo ""
fi

# ── 3. Frontend (local web app) ───────────────────────────────
echo "→ Starting React frontend on :5173"
cd frontend
npm run dev
