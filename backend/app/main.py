from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, courses, students
from .security import hash_password


def ensure_seed_users() -> None:
    """Create the default staff accounts when the local SQLite database is empty."""
    with SessionLocal() as db:
        if db.query(User).count():
            return

        staff = [
            ("admin@kuet.ac.bd", "System Admin", "admin", "admin123"),
            ("teacher@kuet.ac.bd", "Sk Md Masudul Ahsan", "teacher", "teacher123"),
        ]

        for email, name, role, password in staff:
            db.add(User(
                email=email,
                name=name,
                role=role,
                password_hash=hash_password(password),
            ))
        db.commit()


# Creates the tables on first run (fine for this project; use Alembic for real migrations)
Base.metadata.create_all(bind=engine)
settings.storage_dir.mkdir(parents=True, exist_ok=True)
ensure_seed_users()

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
