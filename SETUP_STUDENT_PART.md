# Student part: setup guide

## What is inside
- backend/   FastAPI + SQLite database (new)
- frontend/  React app (updated: real login, registration, dashboard, history, courses, face, profile)

## 1. Backend (first time)
    cd backend
    py -3.11 -m venv venv
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    copy .env.example .env
    python seed.py --demo
    uvicorn app.main:app --reload --port 8000

Check: http://localhost:8000/docs shows all API endpoints.

## 2. Frontend (second terminal)
    cd frontend
    npm install
    npm run dev

Open http://localhost:5173

## 3. Test accounts
- Student with 7 weeks of data: type demo@stud.kuet.ac.bd in the Students box
- New student (goes through registration): any name2107xxx@stud.kuet.ac.bd
- Teacher: teacher@kuet.ac.bd / teacher123
- Admin: admin@kuet.ac.bd / admin123

## 4. Real Google login (later)
1. console.cloud.google.com > new project > APIs & Services > OAuth consent screen (External, add test users)
2. Credentials > Create credentials > OAuth client ID > Web application
   Authorized JavaScript origins: http://localhost  and  http://localhost:5173
3. Put the client ID in BOTH files:
   backend/.env      GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   frontend/.env     VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
4. Restart both servers. Set DEV_LOGIN_ENABLED=false before the final demo.

## Marking rule
backend/app/marks.py  (90%+ = 10, 60-90% = 0 to 10 linear, below 60% = Incomplete)
