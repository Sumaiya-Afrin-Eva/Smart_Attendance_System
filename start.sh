#!/bin/bash

echo "Starting Smart Attendance System..."

# Ensure we kill all spawned child processes when this script exits
trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

# 1. Start the backend in the background
echo "-> Starting Backend (FastAPI on port 8000)"
cd backend
source .venv/bin/activate
uvicorn app.main:app --port 8000 --workers 1 &
BACKEND_PID=$!
cd ..

# 2. Start the frontend
echo "-> Starting Frontend (React on port 5173)"
cd frontend
npm run dev
