# Student part: setup guide

## What is inside
- backend/   FastAPI + SQLite database
- frontend/  React app (updated: real login, registration, dashboard, history, courses, face, profile)

## 1. Configure the administrator code
1. Create `backend/.env` from `backend/.env.example` if it does not exist.
2. Generate a private code in PowerShell:

       python -c "import secrets; print(secrets.token_urlsafe(32))"

3. Put that value in `backend/.env` as `ADMIN_ACCESS_CODE=...`. Keep it private and do not commit the `.env` file.
4. Start the backend. On the login page, open **Faculty & Staff** → **First-time admin? Set up admin account** and use the code to create the first administrator. The code is also required whenever an administrator signs in.

The first admin setup only works while the SQLite database has no administrator account. If `backend/seed.py` has been run, it creates a local development administrator (`admin@kuet.ac.bd`, initial password `admin123`), so sign in with that account instead of using first-time setup. Admin sign-in also requires the access code in `backend/.env`. Do not use the seeded password outside local development.

## 2. Backend
    cd backend
    py -3.11 -m venv venv
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Check: http://localhost:8000/docs shows all API endpoints.

## 3. Frontend (second terminal)
    cd frontend
    npm install
    npm run dev

Open http://localhost:5173

## 4. Open the classroom kiosk
1. Open `http://localhost:5173/kiosk`; the kiosk does not require an admin or student login.
2. Enter the active course code (the sample seed uses `CSE 3200` for **System Development Project**) and select **Open kiosk**. This creates or reopens one completed class session for that course for today; no separate admin session setup is required.
3. Select **Start Camera**, allow browser camera access, then use **Scan Face & Record Attendance**. A verified student assigned and enrolled in that course is recorded as present in the `attendance` table. A failed face match is not recorded, and a repeat scan does not create another record.
4. Students in that course who have not scanned are shown as **Absent** under **Today's class attendance** on their dashboard. The dashboard refreshes periodically while open. The course must already exist and have registered students assigned to it.

To run the kiosk on a separate computer from the backend, keep the browser URL on the kiosk computer at `http://localhost:5173/kiosk` so camera access works over localhost. On the backend computer, run Uvicorn with `--host 0.0.0.0 --port 8000` and allow inbound TCP port 8000 through its firewall. On the kiosk computer, set `VITE_API_URL=http://<backend-computer-LAN-IP>:8000/api` in `frontend/.env.local`, then restart Vite. The backend `.env` must allow the page's browser origin; `FRONTEND_ORIGIN=http://localhost:5173` already allows the local kiosk and local portal. For additional browser origins, set `FRONTEND_ORIGINS` to a comma-separated list such as `http://localhost:5173,http://192.168.1.20:5173`. Use a trusted HTTPS deployment for production; do not expose the development server or an unencrypted API to the public internet.

## 5. Add students and control registration
1. Sign in as the student administrator and open **Student Records**. Use **Add Student** to open the separate create-student page; edit actions open that same form as a separate page.
2. Add each approved student record: name, 7-digit roll, KUET student email, session, department, and official JPEG/PNG photo. The photo is required for registration and later kiosk face matching. Saving an active roster entry approves that email to sign in and open the registration page.
3. Open **Student Courses & Terms** to create, view, edit, or archive course offerings. Each offering is scoped by department, academic session, and year-term. Open **Course Assignments** to assign students: enter one admin-approved roll (for example, `2207001`) or a range (for example, `2207001-2207023`) in the single input box. Commas can separate multiple rolls/ranges. Only active matching `student_roster` rolls are accepted; a range selects matching roster entries, not students outside that table.
4. The student signs in with the approved email. During registration, they enter the matching roll, session, department, and year-term; no face photo enrollment is required. The kiosk compares the live camera image directly with the official photo in the student's admin-approved roster record. Section and phone are not student-entered; the admin may enter the contact phone on the roster form. Course selection is managed by the admin; once assigned, the student's courses appear on the dashboard and **My Courses** page.

The app stores admin-approved student records and official photo image bytes in the `student_roster` SQLite table. Kiosk face recognition compares the live camera image against this official photo. A row appears in `student_profiles` only after the student signs in and completes academic profile registration; adding a roster entry does not create that profile row. Course offerings are in `courses`; admin assignments linking roster students to courses are in `course_roster_assignments`, and registered-student enrollments are in `enrollments`. Archiving a course removes it from active offerings but keeps its course row, assignments, enrollments, class sessions, and attendance history. Course codes may be reused for a different session/department/year-term offering.

In **Student Records**, use **Delete** on an unlinked legacy student to permanently remove that student's account, profile, enrollments, attendance history, and any legacy face samples. Deleting a student with an approved roster record disables the account instead, preserving attendance history.

## 6. View the SQLite database
The default database file is `backend/attendance.db` (unless `DATABASE_URL` in `backend/.env` points elsewhere). Open that file in **DB Browser for SQLite** or **SQLiteStudio**, then select **Browse Data** to inspect `student_roster`, `student_profiles`, and `courses`. The admin's official picture is a BLOB in `student_roster.photo_data`. Older `face_samples` rows may remain in existing databases, but the kiosk no longer uses them.

## 6. Real Google login
1. console.cloud.google.com > new project > APIs & Services > OAuth consent screen (External, add test users)
2. Credentials > Create credentials > OAuth client ID > Web application
   Authorized JavaScript origins: http://localhost  and  http://localhost:5173
3. Put the client ID in BOTH files:
   backend/.env      GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   frontend/.env     VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
4. Restart both servers. Set DEV_LOGIN_ENABLED=false before the final demo.

## Marking rule
backend/app/marks.py  (90%+ = 10, 60-90% = 0 to 10 linear, below 60% = Incomplete)
