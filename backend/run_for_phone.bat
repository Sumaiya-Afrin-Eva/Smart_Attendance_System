@echo off
setlocal
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
    echo Backend virtual environment not found at backend\venv.
    pause
    exit /b 1
)

venv\Scripts\python.exe -c "import pandas" >nul 2>&1
if errorlevel 1 (
    echo Backend dependencies are missing. Install them with:
    echo   venv\Scripts\python.exe -m pip install -r requirements.txt
    pause
    exit /b 1
)

powershell -NoProfile -Command "$listeners = @(netstat -ano -p tcp | Select-String '^\s*TCP\s+\S+:8000\s+\S+\s+LISTENING\s+\d+'); if ($listeners.Count -gt 0) { $listeners | ForEach-Object { $_.Line.Trim() }; exit 1 }; exit 0"
if errorlevel 1 (
    echo Port 8000 is already in use.
    echo Stop the existing server with Ctrl+C, then run this script.
    echo For phone access, do not start with a plain uvicorn command;
    echo this script binds the backend to 0.0.0.0.
    pause
    exit /b 1
)

echo Starting the phone-accessible backend on all network interfaces.
"venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
