from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .models import AdminSetting, User
from .routers import auth, courses, students
from .security import hash_password


def ensure_seed_users() -> None:
    """Create the default staff accounts when the DB is empty.
    Also fixes any existing accounts whose password_hash is plain-text
    (bcrypt hashes always start with '$2b$').
    """
    staff = [
        ("admin@kuet.ac.bd", "System Admin", "admin", "admin123"),
        ("teacher@kuet.ac.bd", "Sk Md Masudul Ahsan", "teacher", "teacher123"),
    ]
    with SessionLocal() as db:
        if not db.query(User).count():
            # Fresh database — create seed accounts
            for email, name, role, password in staff:
                db.add(User(
                    email=email,
                    name=name,
                    role=role,
                    password_hash=hash_password(password),
                ))
            db.commit()
            return

        # Existing database — fix any unhashed passwords left from earlier runs
        default_passwords = {email: pwd for email, _, _, pwd in staff}
        changed = False
        for email, plain in default_passwords.items():
            user = db.query(User).filter_by(email=email).first()
            if user and user.password_hash and not user.password_hash.startswith("$2"):
                user.password_hash = hash_password(plain)
                changed = True
        if changed:
            db.commit()


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
            ("instLogo", "Institution Logo URL", "URL or path to the institution logo", True, "/kuet-logo.png"),
        ]
        for key, label, description, enabled, value in defaults:
            existing = db.query(AdminSetting).filter_by(key=key).first()
            if existing is None:
                db.add(AdminSetting(key=key, label=label, description=description, enabled=enabled, value=value))
        db.commit()


def ensure_user_department_column() -> None:
    """Backfill existing SQLite databases with the teacher department field and setting values."""
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
            
        # Check admin_settings table
        setting_columns = conn.exec_driver_sql("PRAGMA table_info(admin_settings)").fetchall()
        setting_col_names = {column[1] for column in setting_columns}
        if "value" not in setting_col_names:
            conn.exec_driver_sql("ALTER TABLE admin_settings ADD COLUMN value VARCHAR(500)")


# Creates the tables on first run (fine for this project; use Alembic for real migrations)
Base.metadata.create_all(bind=engine)
ensure_user_department_column()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
ensure_seed_users()
ensure_seed_settings()

app = FastAPI(title="Smart Attendance API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
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
    logging.getLogger(__name__).error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again."},
    )


app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(students.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
