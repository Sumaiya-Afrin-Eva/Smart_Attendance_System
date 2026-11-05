import json
from pathlib import Path
import shutil

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, select

from .config import settings
from .database import Base, SessionLocal, engine
from .models import (
    AdminSetting, Course, Enrollment, StudentProfile, StudentRoster, StudentSemesterFaceEnrollment, SystemMigration,
)
from .routers import auth, courses, devices, face, routine, students


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

        # Preserve existing official roster photos while moving storage into SQLite.
        roster_columns = conn.exec_driver_sql("PRAGMA table_info(student_roster)").fetchall()
        roster_col_names = {column[1] for column in roster_columns}
        if "photo_data" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN photo_data BLOB")
        if "photo_mime_type" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN photo_mime_type VARCHAR(40)")
        if "phone" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN phone VARCHAR(20)")
        if "photo_path" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN photo_path VARCHAR(500)")
        if "face_sample_paths" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN face_sample_paths TEXT")
        if "face_enrollment_version" not in roster_col_names:
            conn.exec_driver_sql("ALTER TABLE student_roster ADD COLUMN face_enrollment_version INTEGER NOT NULL DEFAULT 0")
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
        settings.storage_dir.mkdir(parents=True, exist_ok=True)
        roster_photo_dir = settings.picture_dir
        roster_photo_dir.mkdir(parents=True, exist_ok=True)
        stored_photos = conn.exec_driver_sql(
            "SELECT id, photo_data, photo_mime_type, photo_path, department, roll FROM student_roster "
            "WHERE photo_data IS NOT NULL"
        ).fetchall()
        for roster_id, photo_data, mime_type, stored_path, dept, roll in stored_photos:
            suffix = ".png" if mime_type == "image/png" else ".jpg"
            dept_name = (dept or "GENERAL").strip()
            dept_folder = roster_photo_dir / dept_name
            dept_folder.mkdir(parents=True, exist_ok=True)
            name = roll if roll else str(roster_id)
            photo_path = dept_folder / f"{name}{suffix}"
            if not photo_path.is_file() or photo_path.stat().st_size != len(photo_data):
                photo_path.write_bytes(photo_data)
            relative_path = f"picture/{dept_name}/{photo_path.name}"
            if not stored_path or not (settings.picture_dir.parent / stored_path).is_file():
                conn.exec_driver_sql(
                    "UPDATE student_roster SET photo_path = ? WHERE id = ?",
                    (relative_path, roster_id),
                )

        # Student roster verification fields added after initial deployment.
        profile_columns = conn.exec_driver_sql("PRAGMA table_info(student_profiles)").fetchall()
        profile_col_names = {column[1] for column in profile_columns}
        if "roster_id" not in profile_col_names:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN roster_id INTEGER REFERENCES student_roster(id)")
        if "session" not in profile_col_names:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN session VARCHAR(20) DEFAULT ''")
        if "face_status" not in profile_col_names:
            conn.exec_driver_sql(
                "ALTER TABLE student_profiles ADD COLUMN face_status VARCHAR(20) NOT NULL DEFAULT 'none'"
            )
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
        if "status" not in course_col_names:
            conn.exec_driver_sql("ALTER TABLE courses ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active'")

        # Check class_sessions table
        session_columns = conn.exec_driver_sql("PRAGMA table_info(class_sessions)").fetchall()
        session_col_names = {column[1] for column in session_columns}
        if "students" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN students INTEGER DEFAULT 0")
        if "roll_start" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN roll_start VARCHAR(20) DEFAULT ''")
        if "roll_end" not in session_col_names:
            conn.exec_driver_sql("ALTER TABLE class_sessions ADD COLUMN roll_end VARCHAR(20) DEFAULT ''")

        # Ensure separate teachers table exists and is backfilled from users table
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS teachers (
                id INTEGER PRIMARY KEY,
                user_id INTEGER UNIQUE,
                name VARCHAR(120) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                department VARCHAR(40),
                designation VARCHAR(60),
                education VARCHAR(500),
                professional_membership VARCHAR(500),
                research_fields VARCHAR(500),
                pabx_ext VARCHAR(20),
                phone VARCHAR(20),
                website VARCHAR(200),
                status VARCHAR(20) DEFAULT 'Active',
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_teachers_email ON teachers (email)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_teachers_user_id ON teachers (user_id)")

        # Backfill teachers into teachers table for any teacher in users table
        if {"name", "email", "role"}.issubset(col_names):
            conn.exec_driver_sql("""
                INSERT OR IGNORE INTO teachers (
                    user_id, name, email, department, designation, status, created_at, updated_at
                )
                SELECT
                    id, name, email, 'CSE', 'Professor',
                    CASE WHEN is_active = 1 THEN 'Active' ELSE 'Disabled' END,
                    created_at, created_at
                FROM users
                WHERE role = 'teacher' AND id NOT IN (SELECT user_id FROM teachers)
            """)

        # Ensure separate roles for both administrators
        if {"role", "email"}.issubset(col_names):
            conn.exec_driver_sql("UPDATE users SET role = 'system_admin' WHERE email = 'sysadmin@kuet.ac.bd'")
            conn.exec_driver_sql("UPDATE users SET role = 'admin', name = 'Student Administrator' WHERE email = 'admin@kuet.ac.bd'")
            from .security import hash_password
            admin_pwd = hash_password("admin123")
            sysadmin_pwd = hash_password("sysadmin123")
            conn.exec_driver_sql(f"UPDATE users SET password_hash = '{admin_pwd}' WHERE email = 'admin@kuet.ac.bd' AND (password_hash IS NULL OR password_hash = 'x')")
            conn.exec_driver_sql(f"UPDATE users SET password_hash = '{sysadmin_pwd}' WHERE email = 'sysadmin@kuet.ac.bd' AND (password_hash IS NULL OR password_hash = 'x')")

        # Drop legacy teacher columns from users table so users only holds account fields
        teacher_cols_to_drop = [
            "department", "designation", "education", "professional_membership",
            "research_fields", "pabx_ext", "phone", "website", "teacher_status"
        ]
        user_columns_now = {column[1] for column in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
        for col in teacher_cols_to_drop:
            if col in user_columns_now:
                conn.exec_driver_sql(f"ALTER TABLE users DROP COLUMN {col}")

        # Ensure class_routines table exists
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS class_routines (
                id INTEGER PRIMARY KEY,
                department VARCHAR(40),
                semester VARCHAR(20),
                section VARCHAR(10) DEFAULT 'A',
                day VARCHAR(20),
                start_time VARCHAR(20),
                end_time VARCHAR(20),
                course_code VARCHAR(30),
                course_title VARCHAR(120),
                course_type VARCHAR(20) DEFAULT 'Theory',
                teacher_name VARCHAR(120),
                room VARCHAR(50),
                session VARCHAR(20) DEFAULT '2025-2026',
                created_at TIMESTAMP
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_class_routines_dept ON class_routines (department)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_class_routines_sem ON class_routines (semester)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_class_routines_day ON class_routines (day)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_class_routines_code ON class_routines (course_code)")

        # Ensure course_teachers table exists
        conn.exec_driver_sql("""
            CREATE TABLE IF NOT EXISTS course_teachers (
                id INTEGER PRIMARY KEY,
                course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
                teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                section VARCHAR(10) DEFAULT 'Both',
                role VARCHAR(40) DEFAULT 'Instructor',
                created_at TIMESTAMP,
                UNIQUE(course_id, teacher_id, section)
            )
        """)
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_course_teachers_course ON course_teachers (course_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_course_teachers_teacher ON course_teachers (teacher_id)")

    migrate_course_code_uniqueness()
    sync_course_teachers_from_routine()


def sync_course_teachers_from_routine() -> None:
    """Sync teacher course assignments from ClassRoutine and Course into course_teachers."""
    from .database import SessionLocal
    from .models import ClassRoutine, Course, CourseTeacher, User
    from .routers.routine import _find_teacher_user
    from sqlalchemy import select

    try:
        with SessionLocal() as db:
            seen = set()
            for ct in db.scalars(select(CourseTeacher)).all():
                seen.add((ct.course_id, ct.teacher_id, ct.section))

            # 1. Existing Course.teacher_id
            for c in db.scalars(select(Course).where(Course.teacher_id.isnot(None))).all():
                key = (c.id, c.teacher_id, c.section or "Both")
                if key not in seen:
                    db.add(CourseTeacher(
                        course_id=c.id,
                        teacher_id=c.teacher_id,
                        section=c.section or "Both",
                        role="Primary Instructor"
                    ))
                    seen.add(key)

            # 2. Existing ClassRoutine slots
            for r in db.scalars(select(ClassRoutine)).all():
                if not r.teacher_name or not r.teacher_name.strip():
                    continue
                teacher_user = _find_teacher_user(r.teacher_name, db)
                if not teacher_user:
                    continue

                matched_c = db.scalar(select(Course).where(Course.code == r.course_code))
                c_type = r.course_type or "Theory"
                if not matched_c:
                    matched_c = Course(
                        code=r.course_code,
                        title=r.course_title or f"{r.course_code} ({c_type})",
                        credit=3.0 if c_type == "Theory" else 1.5,
                        department=r.department or "CSE",
                        semester=r.semester or "1-1",
                        course_type=c_type,
                        session=r.session or "Default",
                        section=r.section or "A",
                        teacher_id=teacher_user.id,
                        is_active=True,
                        status="Active",
                    )
                    db.add(matched_c)
                    db.flush()
                elif not matched_c.teacher_id:
                    matched_c.teacher_id = teacher_user.id

                sec = r.section or "Both"
                key = (matched_c.id, teacher_user.id, sec)
                if key not in seen:
                    db.add(CourseTeacher(
                        course_id=matched_c.id,
                        teacher_id=teacher_user.id,
                        section=sec,
                        role="Instructor"
                    ))
                    seen.add(key)

            db.commit()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(f"Error syncing course teachers: {e}")


def migrate_student_device_binding() -> None:
    """Add nullable device binding fields to existing student profile tables."""
    columns = {column["name"] for column in inspect(engine).get_columns("student_profiles")}
    with engine.begin() as conn:
        if "device_id" not in columns:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN device_id VARCHAR(64)")
        if "device_bound_at" not in columns:
            conn.exec_driver_sql("ALTER TABLE student_profiles ADD COLUMN device_bound_at TIMESTAMP")
    device_index = next(
        index for index in StudentProfile.__table__.indexes
        if index.name == "uq_student_profiles_device_id"
    )
    device_index.create(bind=engine, checkfirst=True)


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


def backfill_legacy_semester_face_enrollments() -> None:
    """Preserve completed face enrollment for semesters already present in legacy records."""
    with SessionLocal() as db:
        migration_name = "semester-face-enrollment-backfill-v1"
        if db.get(SystemMigration, migration_name):
            return

        profiles = db.scalars(
            select(StudentProfile)
            .join(StudentRoster, StudentProfile.roster_id == StudentRoster.id)
            .where(
                StudentRoster.face_enrollment_version > 0,
                StudentRoster.face_sample_paths.is_not(None),
                StudentRoster.face_sample_paths != "[]",
            )
        ).all()
        for profile in profiles:
            current_order = int(profile.current_semester[0]) * 2 + int(profile.current_semester[-1])
            semesters = {
                semester
                for semester in db.scalars(
                    select(Enrollment.semester).where(Enrollment.student_id == profile.user_id)
                ).all()
                if int(semester[0]) * 2 + int(semester[-1]) <= current_order
            }
            semesters.add(profile.current_semester)
            for semester in semesters:
                existing = db.scalar(
                    select(StudentSemesterFaceEnrollment.id).where(
                        StudentSemesterFaceEnrollment.user_id == profile.user_id,
                        StudentSemesterFaceEnrollment.semester == semester,
                    )
                )
                if existing is None:
                    db.add(
                        StudentSemesterFaceEnrollment(
                            user_id=profile.user_id,
                            semester=semester,
                            enrollment_version=1,
                        )
                    )
        db.add(SystemMigration(name=migration_name))
        db.commit()


def migrate_student_pictures_to_departments() -> None:
    """Organize picture/ into department folders (e.g. picture/CSE/) and standardize face sample names to roll_pose.jpg."""
    with SessionLocal() as db:
        picture_dir = settings.picture_dir
        picture_dir.mkdir(parents=True, exist_ok=True)

        # Pre-create folders for all known departments
        known_depts = set(db.scalars(select(StudentRoster.department)).all())
        known_depts.update(db.scalars(select(Course.department)).all())
        known_depts.update(["CSE", "EEE", "ME", "CE", "ECE"])
        for d in known_depts:
            if d:
                dept_dir = picture_dir / d.strip()
                dept_dir.mkdir(parents=True, exist_ok=True)
                gitkeep = dept_dir / ".gitkeep"
                if not gitkeep.exists():
                    gitkeep.touch()

        migration_name = "dept-folders-and-pose-naming-v1"
        if db.get(SystemMigration, migration_name):
            return

        pose_names = ["look_straight", "turn_left", "turn_right", "tilt_up", "tilt_down"]
        rosters = db.scalars(select(StudentRoster)).all()
        for roster in rosters:
            dept = (roster.department or "GENERAL").strip()
            dept_dir = picture_dir / dept
            dept_dir.mkdir(parents=True, exist_ok=True)

            if roster.face_sample_paths:
                try:
                    old_paths = json.loads(roster.face_sample_paths)
                except Exception:
                    old_paths = []
                new_paths = []
                for idx, old_p in enumerate(old_paths):
                    if not isinstance(old_p, str):
                        continue
                    suffix = Path(old_p).suffix or ".jpg"
                    pose = pose_names[idx] if idx < len(pose_names) else f"pose_{idx + 1}"
                    new_filename = f"{roster.roll}_{pose}{suffix}"
                    target_file = dept_dir / new_filename
                    src_candidates = [
                        settings.picture_dir.parent / old_p,
                        picture_dir / Path(old_p).name,
                        dept_dir / Path(old_p).name,
                        dept_dir / new_filename,
                    ]
                    found = False
                    for src in src_candidates:
                        if src.is_file():
                            if src.resolve() != target_file.resolve():
                                shutil.copy2(src, target_file)
                            found = True
                            break
                    if found or target_file.is_file():
                        new_paths.append(f"picture/{dept}/{new_filename}")
                    elif roster.photo_data and idx == 0:
                        target_file.write_bytes(roster.photo_data)
                        new_paths.append(f"picture/{dept}/{new_filename}")

                if new_paths:
                    roster.face_sample_paths = json.dumps(new_paths)

            # Official photo
            suffix = ".png" if roster.photo_mime_type == "image/png" else ".jpg"
            official_name = f"{roster.roll}{suffix}"
            official_file = dept_dir / official_name
            if not official_file.is_file() and roster.photo_data:
                official_file.write_bytes(roster.photo_data)
            elif not official_file.is_file() and roster.photo_path:
                old_official = settings.picture_dir.parent / roster.photo_path
                if old_official.is_file():
                    shutil.copy2(old_official, official_file)

            if official_file.is_file():
                roster.photo_path = f"picture/{dept}/{official_name}"

        db.add(SystemMigration(name=migration_name))
        db.commit()


# Creates the tables on first run (fine for this project; use Alembic for real migrations)
Base.metadata.create_all(bind=engine)
migrate_student_device_binding()
ensure_database_schema()
backfill_legacy_semester_face_enrollments()
migrate_student_pictures_to_departments()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
settings.picture_dir.mkdir(parents=True, exist_ok=True)
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


from fastapi import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def catch_all_errors(request: Request, exc: Exception):
    """Ensure every unhandled error returns a JSON body with a string 'detail' field."""
    import logging
    logging.getLogger(__name__).exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"An unexpected server error occurred: {str(exc)}"},
    )


app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(devices.router)
app.include_router(routine.router)
app.include_router(students.router)
app.include_router(face.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
