from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .models import AdminSetting
from .routers import auth, courses, face, students


def ensure_seed_settings() -> None:
    """Create the default system toggles used by the admin settings page."""
    with SessionLocal() as db:
        defaults = [
            ("googleLogin", "Google academic sign-in", "Allow KUET Gmail and faculty accounts to sign in securely", True, None),
            ("facialVerification", "Face biometrics verification", "Require facial confirmation before attendance is accepted", True, None),
            ("autoBackup", "Auto backup", "Create scheduled backups of student and teacher records", True, None),
            ("emailAlerts", "Email notifications", "Send alerts when attendance anomalies or spoofing events occur", False, None),
            ("roleLock", "Role-based access lock", "Block unauthorized role changes and privilege escalation", True, None),
            ("instName", "Institution Name", "The full name of the university or institute", True, "Khulna University of Engineering & Technology"),
            ("deptName", "Department Name", "The name of the department", True, "Department of Computer Science & Engineering"),
            ("instLogo", "Institution Logo URL", "URL or path to the institution logo", True, "/kuet_logo.png"),
        ]
        for key, label, description, enabled, value in defaults:
            existing = db.query(AdminSetting).filter_by(key=key).first()
            if existing is None:
                db.add(AdminSetting(key=key, label=label, description=description, enabled=enabled, value=value))
            elif key == "instLogo" and (existing.value == "/kuet-logo.png" or not existing.value):
                existing.value = "/kuet_logo.png"
        db.commit()


def ensure_database_schema() -> None:
    """Backfill existing SQLite databases with missing fields across tables."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        # Check users table
        columns = conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        col_names = {column[1] for column in columns}
        if "department" not in col_names:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN department VARCHAR(40)")
        if "designation" not in col_names:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN designation VARCHAR(60)")
        if "teacher_status" not in col_names:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN teacher_status VARCHAR(20)")

        # Preserve existing official roster photos while moving storage into SQLite.
        roster_columns = conn.exec_driver_sql("PRAGMA table_info(student_roster)").fetchall()
        roster_col_names = {column[1] for column in roster_columns}
        if "photo_data" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN photo_data BLOB")
        if "photo_mime_type" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN photo_mime_type VARCHAR(40)")
        if "phone" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN phone VARCHAR(20)")
        if "photo_path" in roster_col_names:
            legacy_photos = conn.exec_driver_sql(
                "SELECT id, photo_path FROM student_roster "
                "WHERE photo_path IS NOT NULL AND photo_data IS NULL"
            ).fetchall()
            for roster_id, photo_path in legacy_photos:
                path = Path(photo_path)
                if not path.is_file():
                    continue
                photo_data = path.read_bytes()
                mime_type = "image/png" if photo_data.startswith(b"\x89PNG") else "image/jpeg"
                conn.exec_driver_sql(
                    "UPDATE student_roster SET photo_data = ?, photo_mime_type = ? WHERE id = ?",
                    (photo_data, mime_type, roster_id),
                )

        # Student roster verification fields added after initial deployment.
        profile_columns = conn.exec_driver_sql("PRAGMA table_info(student_profiles)").fetchall()
        profile_col_names = {column[1] for column in profile_columns}
        if "roster_id" not in profile_col_names:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN roster_id INTEGER REFERENCES student_roster(id)")
        if "session" not in profile_col_names:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN session VARCHAR(20) DEFAULT ''")
        if "face_status" in profile_col_names:
            conn.exec_driver_sql("ALTER TABLE student_profiles DROP COLUMN face_status")
        if {"phone", "section"}.issubset(profile_col_names):
            conn.exec_driver_sql(
                "UPDATE student_profiles "
                "SET phone = (SELECT phone FROM student_roster WHERE student_roster.id = student_profiles.roster_id), "
                "section = NULL "
                "WHERE roster_id IS NOT NULL"
            )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_student_profiles_roster_id "
            "ON student_profiles (roster_id)"
        )
            
        # Check admin_settings table
        setting_columns = conn.exec_driver_sql("PRAGMA table_info(admin_settings)").fetchall()
        setting_col_names = {column[1] for column in setting_columns}
        if "value" not in setting_col_names:
            conn.exec_driver_sql("ALTER TABLE admin_settings ADD COLUMN value VARCHAR(500)")

        # Check courses table
        course_columns = conn.exec_driver_sql("PRAGMA table_info(courses)").fetchall()
        course_col_names = {column[1] for column in course_columns}
        if "session" not in course_col_names:
            conn.exec_driver_sql("ALTER TABLE courses ADD COLUMN session VARCHAR(20) DEFAULT '2025-2026'")
        if "section" not in course_col_names:
            conn.exec_driver_sql("ALTER TABLE courses ADD COLUMN section VARCHAR(10) DEFAULT 'A'")
        if "is_active" not in course_col_names:
            conn.exec_driver_sql("ALTER TABLE courses ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1")

        # Check class_sessions table
        session_columns = conn.exec_driver_sql("PRAGMA table_info(class_sessions)").fetchall()
        session_col_names = {column[1] for column in session_columns}
        if "students" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN students INTEGER DEFAULT 0")
        if "roll_start" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN roll_start VARCHAR(20) DEFAULT ''")
        if "roll_end" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN roll_end VARCHAR(20) DEFAULT ''")

    migrate_course_code_uniqueness()


def migrate_course_code_uniqueness() -> None:
    """Allow a course code to be reused in another session without losing history."""
    with engine.connect() as conn:
        indexes = conn.exec_driver_sql("PRAGMA index_list(courses)").fetchall()
        has_legacy_code_unique = any(
            index[2]
            and [
                column[2]
                for column in conn.exec_driver_sql(f"PRAGMA index_info('{index[1]}')").fetchall()
            ] == ["code"]
            for index in indexes
        )
        if not has_legacy_code_unique:
            return

        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        conn.commit()
        try:
            with conn.begin():
                conn.exec_driver_sql(
                    "CREATE TABLE courses_new ("
                    "id INTEGER NOT NULL PRIMARY KEY, "
                    "code VARCHAR(20) NOT NULL, "
                    "title VARCHAR(150) NOT NULL, "
                    "credit FLOAT NOT NULL, "
                    "department VARCHAR(40) NOT NULL, "
                    "semester VARCHAR(5) NOT NULL, "
                    "course_type VARCHAR(10) NOT NULL, "
                    "session VARCHAR(20) NOT NULL DEFAULT '2025-2026', "
                    "section VARCHAR(10) NOT NULL DEFAULT 'A', "
                    "is_active BOOLEAN NOT NULL DEFAULT 1, "
                    "teacher_id INTEGER, "
                    "UNIQUE (code, session, department, semester), "
                    "FOREIGN KEY(teacher_id) REFERENCES users (id))"
                )
                conn.exec_driver_sql(
                    "INSERT INTO courses_new "
                    "(id, code, title, credit, department, semester, course_type, session, section, is_active, teacher_id) "
                    "SELECT id, code, title, credit, department, semester, course_type, session, section, is_active, teacher_id "
                    "FROM courses"
                )
                conn.exec_driver_sql("DROP TABLE courses")
                conn.exec_driver_sql("ALTER TABLE courses_new RENAME TO courses")
                conn.exec_driver_sql("CREATE INDEX ix_courses_code ON courses (code)")
                conn.exec_driver_sql("CREATE INDEX ix_courses_department ON courses (department)")
                conn.exec_driver_sql("CREATE INDEX ix_courses_semester ON courses (semester)")
                conn.exec_driver_sql("CREATE INDEX ix_courses_is_active ON courses (is_active)")
        finally:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            conn.commit()
        violations = conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
        if violations:
            raise RuntimeError(f"Course migration left foreign-key violations: {violations!r}")


# Creates the tables on first run (fine for this project; use Alembic for real migrations)
Base.metadata.create_all(bind=engine)
ensure_database_schema()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
ensure_seed_settings()

app = FastAPI(title="Smart Attendance API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        *[origin.strip() for origin in settings.frontend_origins.split(",") if origin.strip()],
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.exception_handler(RequestValidationError)
async def friendly_validation_errors(request: Request, exc: RequestValidationError):
    """Return {"detail": "...", "errors": {"field": "message"}} instead of FastAPI's raw list."""
    errors = {}
    for err in exc.errors():
        field = str(err["loc"][-1]) if err.get("loc") else "form"
        errors.setdefault(field, err["msg"].removeprefix("Value error, "))
    return JSONResponse(status_code=422, content={"detail": next(iter(errors.values()), "Invalid input"), "errors": errors})


@app.exception_handler(Exception)
async def catch_all_errors(request: Request, exc: Exception):
    """Ensure every error returns a JSON body with a string 'detail' field."""
    import logging
    logging.getLogger(__name__).exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(students.router)
app.include_router(face.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
