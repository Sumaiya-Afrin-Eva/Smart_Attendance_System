"""Face Recognition & Verification API Router.

Endpoints for:
- Live face matching against enrolled student database
- Two-image embedding cosine similarity comparison
- Face detection and 512-d ArcFace vector extraction
"""
from __future__ import annotations

import base64
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Optional
from uuid import uuid4

import jwt
import numpy as np
from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..database import get_db
from ..schedule_utils import approved_schedule_changes, effective_routine_times
from ..models import (
    Attendance,
    ClassRoutine,
    ClassScheduleChangeRequest,
    ClassSession,
    ConsumedAttendanceQr,
    ConsumedKioskQrFallback,
    Course,
    CourseRosterAssignment,
    CourseTeacher,
    Enrollment,
    StudentProfile,
    StudentRoster,
    User,
)
from ..config import settings
from ..services.face_service import (
    DEFAULT_SIMILARITY_THRESHOLD,
    compute_similarity,
    extract_embedding,
    get_face_service,
    is_match,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/face", tags=["face"])
ATTENDANCE_QR_ISSUER = "smart-attendance"
ATTENDANCE_QR_AUDIENCE = "attendance-kiosk"
KIOSK_QR_FALLBACK_AUDIENCE = "attendance-kiosk-qr-fallback"
KIOSK_QR_FALLBACK_VALID_SECONDS = 30
_kiosk_session_lock = Lock()


def _kiosk_tracking_key(kiosk_id: str | None, session_id: int | None = None) -> str:
    label = (kiosk_id or "").strip().lower()
    if label:
        return f"kiosk:{label}"
    return f"kiosk:{session_id}" if session_id else "kiosk:main"


def _registered_face_inputs(roster: StudentRoster) -> list[bytes | str]:
    """Return the official registration samples from the project photo store.

    The kiosk must match against the student's department folder under picture/, including
    the five roll-based registration samples such as 2107039_look_straight.jpg and the
    canonical roll.jpg admin photo.
    """
    project_root = Path(__file__).resolve().parents[2].parent
    dept = (roster.department or "").strip()
    inputs: list[bytes | str] = []
    seen: set[str] = set()

    if roster.photo_data:
        inputs.append(roster.photo_data)
        seen.add("__db_photo__")

    paths = json.loads(roster.face_sample_paths or "[]")
    for path in paths:
        if not isinstance(path, str):
            continue
        p = Path(path)
        candidates = [
            (project_root / p).resolve(),
            (project_root / "picture" / dept / p.name).resolve() if dept else None,
            (project_root / "picture" / p.name).resolve(),
        ]
        for cand in candidates:
            if cand is not None and cand.is_file():
                key = str(cand)
                if key not in seen:
                    inputs.append(str(cand))
                    seen.add(key)
                break

    if roster.photo_path:
        photo_p = Path(roster.photo_path)
        for cand in [
            (project_root / photo_p).resolve(),
            (project_root / "picture" / dept / photo_p.name).resolve() if dept else None,
            (project_root / "picture" / photo_p.name).resolve(),
        ]:
            if cand and cand.is_file():
                key = str(cand)
                if key not in seen:
                    inputs.append(str(cand))
                    seen.add(key)
                break

    if dept and roster.roll:
        dept_dir = (project_root / "picture" / dept).resolve()
        if dept_dir.is_dir():
            for path in sorted(dept_dir.iterdir()):
                if not path.is_file():
                    continue
                name = path.name.lower()
                prefix = (roster.roll or "").lower()
                if prefix and (name == f"{prefix}.jpg" or name == f"{prefix}.png" or name.startswith(f"{prefix}_")):
                    key = str(path)
                    if key not in seen:
                        inputs.append(str(path))
                        seen.add(key)

    if not inputs and roster.photo_data:
        return [roster.photo_data]
    return inputs


def _decode_image_payload(file: UploadFile | None, base64_str: str | None) -> bytes:
    """Helper to get raw image bytes from either an uploaded file or base64 string."""
    if file:
        return file.file.read()
    if base64_str:
        clean_b64 = base64_str
        if "," in clean_b64:
            clean_b64 = clean_b64.split(",", 1)[1]
        try:
            return base64.b64decode(clean_b64)
        except Exception as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid base64 image data: {exc}")
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "No image provided. Upload a file or provide a base64 string.")


_ROSTER_EMBEDDINGS: dict[int, list[np.ndarray]] = {}


def _get_roster_embeddings(face_svc, roster: StudentRoster) -> list[np.ndarray]:
    """Retrieve pre-computed embeddings for a student's photos from memory cache, or extract them."""
    if roster.id in _ROSTER_EMBEDDINGS and _ROSTER_EMBEDDINGS[roster.id]:
        return _ROSTER_EMBEDDINGS[roster.id]

    embs: list[np.ndarray] = []
    for face_input in _registered_face_inputs(roster):
        try:
            emb = face_svc.extract_embedding(face_input)
            if emb is not None:
                embs.append(emb)
        except Exception as exc:
            logger.warning("Could not extract embedding for roll %s: %s", roster.roll, exc)

    if embs:
        _ROSTER_EMBEDDINGS[roster.id] = embs
    return embs


def _prepare_kiosk_gallery(face_svc, students: list[tuple[StudentRoster, StudentProfile, User]]) -> None:
    """Warm recognition and cache registered faces after the kiosk is ready to use."""
    try:
        face_svc.warmup()
    except Exception as exc:
        logger.warning("Face service warmup failed: %s", exc)
    for roster, _, _ in students:
        try:
            _get_roster_embeddings(face_svc, roster)
        except Exception as exc:
            logger.warning("Failed preparing admin photo for roster roll %s: %s", roster.roll, exc)


class ComparePayload(BaseModel):
    image1_base64: Optional[str] = None
    image2_base64: Optional[str] = None
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD


class RecognizePayload(BaseModel):
    image_base64: str
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD


class KioskOpenRequest(BaseModel):
    course_code: str | None = Field(default=None, max_length=20)
    kiosk_id: str | None = Field(default=None, max_length=50)
    refresh_only: bool = False


class KioskQrScanRequest(BaseModel):
    session_id: int | None = None
    kiosk_id: str | None = "kiosk-main"
    token: str = Field(min_length=1, max_length=4096)
    fallback_token: str | None = Field(default=None, min_length=1, max_length=4096)


def _resolve_kiosk_department(kiosk_id: str | None) -> str | None:
    """Resolve department kiosks while leaving generic kiosk labels unscoped."""
    if kiosk_id is None:
        return None
    compact = re.sub(r"[^A-Za-z0-9]", "", str(kiosk_id).strip()).upper()
    if not compact:
        return None
    if compact.startswith("KIOSK"):
        compact = compact[5:]
    if compact.endswith("KIOSK"):
        compact = compact[:-5]
    return compact if compact and compact not in {"MAIN", "DEFAULT"} else None


def _eligible_students(db: Session, course_id: int | None = None, department: str | None = None):
    """Return candidates for face recognition.
    When a department kiosk is active, the pool is strictly limited to that department.
    There is no generic fallback for CSE/EEE kiosks; wrong-department students are rejected.
    """
    department_code = (department or "").strip().upper()

    base_query = (
        select(StudentRoster, StudentProfile, User)
        .join(StudentProfile, StudentProfile.roster_id == StudentRoster.id)
        .join(User, User.id == StudentProfile.user_id)
        .where(
            StudentRoster.is_active.is_(True),
            User.is_active.is_(True),
            User.role == "student",
        )
    )
    if department_code:
        base_query = base_query.where(func.upper(StudentRoster.department) == department_code)

    if course_id:
        course_candidates = db.execute(
            base_query.join(CourseRosterAssignment, CourseRosterAssignment.roster_id == StudentRoster.id)
            .where(CourseRosterAssignment.course_id == course_id)
        ).all()
        if course_candidates:
            return course_candidates
        return []

    candidates = db.execute(base_query).all()
    if department_code:
        return candidates
    return candidates or db.execute(
        select(StudentRoster, StudentProfile, User)
        .outerjoin(StudentProfile, StudentProfile.roster_id == StudentRoster.id)
        .outerjoin(User, User.id == StudentProfile.user_id)
        .where(StudentRoster.is_active.is_(True))
    ).all()


def _parse_time_minutes(value: str | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace(".", ":")
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p"):
        try:
            dt = datetime.strptime(normalized, fmt)
            return dt.hour * 60 + dt.minute
        except ValueError:
            pass
    return None


# Allow kiosk to open up to this many minutes before class starts or after it ends.
KIOSK_TIME_GRACE_MINUTES = 20


def _is_in_time_window(start_time: str | None, end_time: str | None, current_minutes: int, grace: int = 0) -> bool:
    """Return True if current_minutes falls inside [start-grace, end+grace]."""
    start_minutes = _parse_time_minutes(start_time)
    end_minutes = _parse_time_minutes(end_time)
    if start_minutes is None or end_minutes is None:
        return False
    lo = start_minutes - grace
    hi = end_minutes + grace
    if start_minutes <= end_minutes:
        return lo <= current_minutes <= hi
    # Overnight span
    return current_minutes >= lo or current_minutes <= hi


def _time_distance_to_window(start_time: str | None, end_time: str | None, current_minutes: int) -> int:
    """Minutes to the nearest edge of the window (0 if inside)."""
    start_minutes = _parse_time_minutes(start_time)
    end_minutes = _parse_time_minutes(end_time)
    if start_minutes is None or end_minutes is None:
        return 24 * 60
    if _is_in_time_window(start_time, end_time, current_minutes):
        return 0
    if start_minutes <= end_minutes:
        return min(abs(start_minutes - current_minutes), abs(end_minutes - current_minutes))
    if current_minutes >= start_minutes:
        return current_minutes - start_minutes
    return end_minutes - current_minutes


def _attendance_status_for_session(class_session: ClassSession, marked_at: datetime | None = None) -> str:
    """Both late and present count as attended; scanning more than 10 minutes after class start is marked as late."""
    if marked_at is None:
        marked_at = datetime.now()
    if class_session.start_at is None:
        return "present"
    if marked_at > class_session.start_at + timedelta(minutes=10):
        return "late"
    return "present"


def _resolve_teacher_for_routine(db: Session, routine: ClassRoutine, course: Course) -> int | None:
    teacher_name = (routine.teacher_name or "").strip()
    if teacher_name:
        from ..routers.routine import _find_teacher_user

        teacher_user = _find_teacher_user(teacher_name, db)
        if teacher_user:
            return teacher_user.id

    if course.teacher_id:
        return course.teacher_id

    candidates = db.scalars(
        select(User.id)
        .join(CourseTeacher, CourseTeacher.teacher_id == User.id)
        .where(
            CourseTeacher.course_id == course.id,
            User.role == "teacher",
            User.is_active.is_(True),
        )
        .order_by(User.id)
    ).all()
    if len(candidates) == 1:
        return candidates[0]
    return None


def _resolve_active_class_for_student(db: Session, student: User, now: datetime):
    profile = student.profile if student and student.role == "student" and student.is_active else None
    if profile is None:
        return None, None, None

    today = now.strftime("%A").strip().lower()
    current_minutes = now.hour * 60 + now.minute
    routines = db.scalars(
        select(ClassRoutine)
        .where(
            func.upper(func.trim(ClassRoutine.department)) == func.upper(func.trim(profile.department)),
            ClassRoutine.semester == profile.current_semester,
            func.lower(func.trim(ClassRoutine.day)) == today,
        )
    ).all()
    schedule_changes = approved_schedule_changes(db, now.date())

    matches: list[tuple[int, int, int, int, ClassRoutine, Course, int | None]] = []
    for routine in routines:
        start_time, end_time = effective_routine_times(routine, schedule_changes)
        grace = 0 if routine.id in schedule_changes else KIOSK_TIME_GRACE_MINUTES
        if not _is_in_time_window(start_time, end_time, current_minutes, grace=grace):
            continue

        course = db.scalar(
            select(Course)
            .where(
                func.upper(func.trim(Course.code)) == func.upper(func.trim(routine.course_code)),
                func.upper(func.trim(Course.department)) == func.upper(func.trim(profile.department)),
                Course.semester == profile.current_semester,
                Course.is_active.is_(True),
            )
            .order_by(Course.id)
        )
        if course is None:
            continue

        roster_match = profile.roster_id is not None and db.scalar(
            select(CourseRosterAssignment.id)
            .where(
                CourseRosterAssignment.course_id == course.id,
                CourseRosterAssignment.roster_id == profile.roster_id,
            )
        )
        enrollment_match = db.scalar(
            select(Enrollment.id)
            .where(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id,
                Enrollment.semester == course.semester,
            )
        )
        if not roster_match or not enrollment_match:
            continue

        section_match = 1 if (profile.section or "").upper() == (routine.section or "").upper() else 0
        session_match = 1 if (profile.session or "").strip() and (routine.session or "").strip() and (profile.session or "").strip() == (routine.session or "").strip() else 0
        teacher_id = _resolve_teacher_for_routine(db, routine, course)
        teacher_match = 1 if teacher_id is not None else 0
        time_score = _time_distance_to_window(start_time, end_time, current_minutes)
        matches.append((section_match, session_match, teacher_match, time_score, routine, course, teacher_id))

    if not matches:
        return None, None, None

    _, _, _, _, selected_routine, selected_course, teacher_id = sorted(
        matches,
        key=lambda item: (-item[0], -item[1], -item[2], item[3]),
    )[0]
    return selected_course, teacher_id, selected_routine


def _routine_start_at(
    routine: ClassRoutine | None,
    now: datetime,
    schedule_changes: dict[int, ClassScheduleChangeRequest] | None = None,
) -> datetime | None:
    if routine is None:
        return None
    start_time = (
        effective_routine_times(routine, schedule_changes)[0]
        if schedule_changes is not None
        else routine.start_time
    )
    if not start_time:
        return None
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p"):
        try:
            dt = datetime.strptime(str(start_time).strip().replace(".", ":"), fmt)
            return datetime.combine(now.date(), dt.time())
        except ValueError:
            pass
    return None


def _find_existing_session_for_routine(
    db: Session,
    course: Course,
    teacher_id: int | None,
    now: datetime,
    routine: ClassRoutine | None,
    schedule_changes: dict[int, ClassScheduleChangeRequest] | None = None,
) -> ClassSession | None:
    day_start = datetime.combine(now.date(), datetime.min.time())
    next_day = day_start + timedelta(days=1)
    sessions = db.scalars(
        select(ClassSession)
        .where(
            ClassSession.course_id == course.id,
            ClassSession.start_at >= day_start,
            ClassSession.start_at < next_day,
            ClassSession.status != "cancelled",
        )
        .order_by(ClassSession.start_at, ClassSession.id)
    ).all()
    if schedule_changes is None:
        schedule_changes = approved_schedule_changes(db, now.date())
    routine_start_at = _routine_start_at(routine, now, schedule_changes)
    if routine_start_at is not None:
        return next(
            (
                session
                for session in sessions
                if session.start_at.strftime("%H:%M") == routine_start_at.strftime("%H:%M")
            ),
            None,
        )
    return next(
        (session for session in sessions if session.teacher_id == teacher_id),
        sessions[0] if sessions else None,
    )


def _get_or_create_session_for_routine(
    db: Session,
    course: Course,
    teacher_id: int | None,
    now: datetime,
    student_count: int = 1,
    routine: ClassRoutine | None = None,
    schedule_changes: dict[int, ClassScheduleChangeRequest] | None = None,
) -> ClassSession:
    with _kiosk_session_lock:
        matched_routine = routine
        if matched_routine is None:
            today_name = now.strftime("%A").strip().lower()
            matched_routine = db.scalar(
                select(ClassRoutine).where(
                    func.upper(func.trim(ClassRoutine.course_code)) == func.upper(func.trim(course.code)),
                    func.lower(func.trim(ClassRoutine.day)) == today_name,
                )
            )

        if schedule_changes is None:
            schedule_changes = approved_schedule_changes(db, now.date())
        existing = _find_existing_session_for_routine(
            db, course, teacher_id, now, matched_routine, schedule_changes
        )
        if existing is not None:
            return existing

        session_start_at = _routine_start_at(matched_routine, now, schedule_changes) or now

        session = ClassSession(
            course_id=course.id,
            teacher_id=teacher_id,
            start_at=session_start_at,
            end_at=now,
            room=matched_routine.room if matched_routine else None,
            students=student_count,
            status="completed",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session


def _qr_error(detail: str = "This attendance QR is invalid or has expired.") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail)


def _create_kiosk_qr_fallback(session_id: int, db: Session) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    db.execute(delete(ConsumedKioskQrFallback).where(ConsumedKioskQrFallback.expires_at < now))
    db.commit()
    return jwt.encode(
        {
            "session_id": session_id,
            "jti": str(uuid4()),
            "iat": now,
            "exp": now + KIOSK_QR_FALLBACK_VALID_SECONDS,
            "iss": ATTENDANCE_QR_ISSUER,
            "aud": KIOSK_QR_FALLBACK_AUDIENCE,
            "scope": "attendance:qr-fallback",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


@router.post("/kiosk/qr-scan")
def scan_kiosk_qr(body: KioskQrScanRequest, db: Session = Depends(get_db)):
    """Verify and consume one student QR token, then record attendance for this class."""
    if body.fallback_token is not None:
        try:
            fallback_claims = jwt.decode(
                body.fallback_token,
                settings.jwt_secret,
                algorithms=["HS256"],
                audience=KIOSK_QR_FALLBACK_AUDIENCE,
                issuer=ATTENDANCE_QR_ISSUER,
                options={"require": ["session_id", "jti", "iat", "exp", "scope"]},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This kiosk QR fallback has expired. Please retry face verification.",
            ) from None
        except jwt.PyJWTError:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This kiosk QR fallback is invalid.",
            ) from None

        fallback_jti = fallback_claims.get("jti")
        if (
            fallback_claims.get("scope") != "attendance:qr-fallback"
            or fallback_claims.get("session_id") != body.session_id
            or not isinstance(fallback_jti, str)
            or not fallback_jti
        ):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This kiosk QR fallback is invalid.",
            )

        class_session = db.get(ClassSession, body.session_id)
        if (
            class_session is None
            or class_session.status != "completed"
            or class_session.start_at.date() != datetime.now().date()
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Today's kiosk class session was not found. Open the kiosk again.")
        course = db.get(Course, class_session.course_id)
        if course is None or not course.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "The selected course is no longer active.")

        fallback_used = ConsumedKioskQrFallback(
            jti=fallback_jti,
            session_id=body.session_id,
            expires_at=int(fallback_claims["exp"]),
        )
        db.add(fallback_used)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This QR fallback was already used. Verify the face again to retry.",
            ) from None

    class_session = db.get(ClassSession, body.session_id) if body.session_id else None
    course = db.get(Course, class_session.course_id) if class_session else None

    try:
        claims = jwt.decode(
            body.token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=ATTENDANCE_QR_AUDIENCE,
            issuer=ATTENDANCE_QR_ISSUER,
            options={"require": ["sub", "semester", "jti", "iat", "exp", "scope"]},
        )
    except jwt.ExpiredSignatureError:
        raise _qr_error("This attendance QR has expired. Ask the student to refresh it.") from None
    except jwt.PyJWTError:
        raise _qr_error() from None

    if claims.get("scope") != "attendance:mark":
        raise _qr_error()

    try:
        student_id = int(claims["sub"])
    except (TypeError, ValueError):
        raise _qr_error() from None

    student = db.get(User, student_id)
    profile = student.profile if student and student.role == "student" and student.is_active else None
    roster = db.get(StudentRoster, profile.roster_id) if profile and profile.roster_id else None
    if (
        not profile
        or not roster
        or not roster.is_active
        or profile.current_semester != claims.get("semester")
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This student is not active or eligible.")

    jti = claims.get("jti")
    if not isinstance(jti, str) or not jti:
        raise _qr_error()
    if db.scalar(select(ConsumedAttendanceQr.id).where(ConsumedAttendanceQr.jti == jti)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This attendance QR has already been used.")

    # Resolve the exact teacher and course for this student by time + routine
    resolved_course, resolved_teacher_id, resolved_routine = _resolve_active_class_for_student(db, student, datetime.now())
    if resolved_course is not None:
        class_session = _get_or_create_session_for_routine(
            db, resolved_course, resolved_teacher_id, datetime.now(), student_count=1, routine=resolved_routine
        )
        course = resolved_course
    elif class_session is None:
        course = db.scalar(
            select(Course)
            .where(
                Course.department == profile.department,
                Course.semester == profile.current_semester,
                Course.is_active.is_(True),
            )
            .order_by(Course.id)
        )
        if course is None:
            course = db.scalar(select(Course).where(Course.is_active.is_(True)).order_by(Course.id))
        if course:
            class_session = _get_or_create_session_for_routine(db, course, course.teacher_id, datetime.now(), student_count=1)

    if class_session is None or course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No class session could be resolved right now.")

    record = db.scalar(
        select(Attendance).where(
            Attendance.session_id == class_session.id,
            Attendance.student_id == student.id,
        )
    )
    already_marked = record is not None
    db.add(
        ConsumedAttendanceQr(
            jti=jti,
            user_id=student.id,
            session_id=class_session.id,
            expires_at=int(claims["exp"]),
        )
    )
    if record is None:
        marked_at = datetime.now()
        record = Attendance(
            session_id=class_session.id,
            student_id=student.id,
            status=_attendance_status_for_session(class_session, marked_at),
            marked_at=marked_at,
            method="qr",
        )
        db.add(record)

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        if db.scalar(select(ConsumedAttendanceQr.id).where(ConsumedAttendanceQr.jti == jti)):
            raise HTTPException(status.HTTP_409_CONFLICT, "This attendance QR has already been used.") from None
        record = db.scalar(
            select(Attendance).where(
                Attendance.session_id == class_session.id,
                Attendance.student_id == student.id,
            )
        )
        if record is None:
            raise
        already_marked = True

    return {
        "matched": True,
        "method": "qr",
        "student": {
            "id": student.id,
            "name": profile.full_name,
            "roll": profile.roll,
            "department": profile.department,
            "current_semester": profile.current_semester,
        },
        "attendance": {
            "status": record.status,
            "marked_at": record.marked_at.isoformat(),
            "already_marked": already_marked,
        },
        "course": {"code": course.code, "title": course.title},
        "message": "Attendance was already marked for this class." if already_marked else "QR verified and attendance recorded.",
    }


@router.post("/kiosk/open")
def open_kiosk(
    body: KioskOpenRequest | None = Body(default=None),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    """Open today's completed attendance session for one active course offering.

    If a course code is not provided, we default to the single active routine slot in the
    current time window. Once a student is recognized, the scan endpoint resolves the exact
    course and teacher by student's semester/department/time, which prevents attendance
    from being pushed to every teacher assigned to the same course.
    """
    payload = body or KioskOpenRequest()
    code = (payload.course_code or "").strip()
    kiosk_department = _resolve_kiosk_department(payload.kiosk_id)
    if code:
        courses = db.scalars(
            select(Course).where(
                func.upper(Course.code) == code.upper(),
                Course.is_active.is_(True),
            )
        ).all()
        if kiosk_department:
            courses = [course for course in courses if (course.department or "").upper() == kiosk_department]
        if not courses:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No active course was found for that course code.")
        if len(courses) > 1:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "That course code has multiple active offerings. Ask the department to make the intended offering unique.",
            )

        course = courses[0]
        students = (
            _eligible_students(db, department=kiosk_department)
            if kiosk_department
            else _eligible_students(db, course.id)
        )
        if not students:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This kiosk has no matching registered students in the selected department.",
            )
        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute
        schedule_changes = approved_schedule_changes(db, now.date())
        candidate_routines = db.scalars(
            select(ClassRoutine)
            .where(
                ClassRoutine.course_code == course.code,
                ClassRoutine.day == now.strftime("%A"),
                ClassRoutine.department == course.department,
                ClassRoutine.semester == course.semester,
            )
        ).all()
        if candidate_routines:
            scored = []
            for routine in candidate_routines:
                start_time, end_time = effective_routine_times(routine, schedule_changes)
                if _is_in_time_window(start_time, end_time, current_minutes):
                    scored.append((_time_distance_to_window(start_time, end_time, current_minutes), routine))
            if not scored:
                scored = []
                for routine in candidate_routines:
                    start_time, end_time = effective_routine_times(routine, schedule_changes)
                    scored.append((_time_distance_to_window(start_time, end_time, current_minutes), routine))
            _, selected_routine = min(scored, key=lambda item: item[0])
        else:
            selected_routine = None
        teacher_id = _resolve_teacher_for_routine(db, selected_routine, course) if selected_routine is not None else course.teacher_id
    else:
        now = datetime.now()
        current_day = now.strftime("%A").strip().lower()
        current_minutes = now.hour * 60 + now.minute
        schedule_changes = approved_schedule_changes(db, now.date())
        active_routines = db.scalars(
            select(ClassRoutine).where(func.lower(func.trim(ClassRoutine.day)) == current_day)
        ).all()
        if kiosk_department:
            active_routines = [
                routine for routine in active_routines
                if (routine.department or "").upper() == kiosk_department
            ]

        # First try: exact window; then expand to grace period so early/late arrivals work
        active_candidates = []
        for grace in (0, KIOSK_TIME_GRACE_MINUTES):
            for routine in active_routines:
                if routine.id in schedule_changes and grace:
                    continue
                start_time, end_time = effective_routine_times(routine, schedule_changes)
                if not _is_in_time_window(start_time, end_time, current_minutes, grace=grace):
                    continue
                course = db.scalar(
                    select(Course)
                    .where(
                        Course.code == routine.course_code,
                        Course.department == routine.department,
                        Course.semester == routine.semester,
                        Course.is_active.is_(True),
                    )
                )
                if course is None:
                    continue
                time_score = _time_distance_to_window(start_time, end_time, current_minutes)
                entry = (time_score, routine, course)
                if entry not in active_candidates:
                    active_candidates.append(entry)
            if active_candidates:
                break  # found matches at this grace level, no need to widen further

        if not active_candidates:
            # Last resort: use the nearest routine today (closest by time, any active course)
            nearest_candidates = []
            for routine in active_routines:
                course = db.scalar(
                    select(Course)
                    .where(
                        Course.code == routine.course_code,
                        Course.department == routine.department,
                        Course.semester == routine.semester,
                        Course.is_active.is_(True),
                    )
                )
                if course is None:
                    continue
                start_time, end_time = effective_routine_times(routine, schedule_changes)
                nearest_candidates.append(
                    (_time_distance_to_window(start_time, end_time, current_minutes), routine, course)
                )

            if nearest_candidates:
                _, selected_routine, course = min(nearest_candidates, key=lambda item: item[0])
            else:
                # Absolute last resort: first active course in the DB
                course = db.scalar(
                    select(Course)
                    .where(Course.is_active.is_(True))
                    .order_by(Course.id.asc())
                )
                if course is None:
                    course = db.scalar(select(Course).order_by(Course.id.asc()))
                if course is None:
                    course = Course(
                        code="KIOSK",
                        title="Smart Attendance Kiosk",
                        department="CSE",
                        semester="1-1",
                        is_active=True,
                    )
                    db.add(course)
                    db.commit()
                    db.refresh(course)
                selected_routine = None
        else:
            _, selected_routine, course = min(active_candidates, key=lambda item: item[0])

        students = (
            _eligible_students(db, department=kiosk_department)
            if kiosk_department
            else _eligible_students(db, course.id)
        )
        teacher_id = _resolve_teacher_for_routine(db, selected_routine, course) if selected_routine is not None else course.teacher_id

    face_svc = get_face_service()
    if background_tasks and students and not payload.refresh_only:
        background_tasks.add_task(_prepare_kiosk_gallery, face_svc, students)

    now = datetime.now()
    if payload.refresh_only:
        class_session = _find_existing_session_for_routine(
            db, course, teacher_id, now, selected_routine, schedule_changes
        )
    else:
        class_session = _get_or_create_session_for_routine(
            db,
            course,
            teacher_id,
            now,
            student_count=len(students),
            routine=selected_routine,
            schedule_changes=schedule_changes,
        )
        class_session.status = "completed"
        class_session.end_at = max(class_session.start_at, now)
        class_session.students = len(students)

    if not payload.refresh_only:
        db.commit()
        db.refresh(class_session)
    return {
        "session_id": class_session.id if class_session is not None else None,
        "course": {"id": course.id, "code": course.code, "title": course.title, "semester": course.semester},
        "date": class_session.start_at.date().isoformat() if class_session is not None else now.date().isoformat(),
        "student_count": len(students),
        "teacher_id": class_session.teacher_id if class_session is not None else teacher_id,
    }


@router.post("/kiosk/liveness")
async def check_kiosk_liveness(
    session_id: Optional[int] = Form(None),
    kiosk_id: Optional[str] = Form("kiosk-main"),
    image: Optional[UploadFile] = File(default=None),
    image_base64: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
):
    """Verify a blink and head movement challenge for live camera frame.
    Works immediately without requiring a pre-opened class routine.
    """
    if image is None and not image_base64:
        return {
            "human": False,
            "blink_detected": False,
            "movement_detected": False,
            "liveness": False,
            "message": "Look at the camera to verify attendance.",
        }

    frame = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()
    tracking_key = _kiosk_tracking_key(kiosk_id, session_id)
    try:
        return await run_in_threadpool(face_svc.check_liveness, frame, tracking_key)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.post("/kiosk/scan")
async def scan_kiosk(
    session_id: Optional[int] = Form(None),
    kiosk_id: Optional[str] = Form("kiosk-main"),
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    threshold: float = Form(DEFAULT_SIMILARITY_THRESHOLD),
    db: Session = Depends(get_db),
):
    """Match a kiosk camera frame against registered students, then resolve
    the student's active routine, course, and specific teacher at the current time.
    """
    tracking_key = _kiosk_tracking_key(kiosk_id, session_id)
    query_bytes = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()
    live_embedding = await run_in_threadpool(face_svc.consume_liveness, tracking_key)
    if live_embedding is None:
        return {
            "matched": False,
            "similarity": None,
            "similarity_percent": None,
            "threshold": threshold,
            "message": "Face Not Recognized. Please show your QR code",
        }

    query_embs: list[np.ndarray] = []
    if query_bytes:
        try:
            if hasattr(face_svc, "extract_all_embeddings"):
                raw_list = await run_in_threadpool(face_svc.extract_all_embeddings, query_bytes)
                for item in raw_list:
                    emb = item.get("embedding") if isinstance(item, dict) else item
                    if emb is not None and getattr(emb, "ndim", 0) == 1 and len(emb) >= 2:
                        query_embs.append(np.asarray(emb, dtype=np.float32))
            else:
                emb = await run_in_threadpool(face_svc.extract_embedding, query_bytes)
                if emb is not None:
                    query_embs = [np.asarray(emb, dtype=np.float32)]
        except RuntimeError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        except Exception as exc:
            logger.warning("Could not extract embeddings from query frame: %s", exc)

    if not query_embs and query_bytes:
        try:
            single = await run_in_threadpool(face_svc.extract_embedding, query_bytes)
            if single is not None:
                query_embs = [np.asarray(single, dtype=np.float32)]
        except Exception:
            pass

    if not query_embs and live_embedding is not None and getattr(live_embedding, "ndim", 0) == 1 and len(live_embedding) > 10:
        query_embs = [np.asarray(live_embedding, dtype=np.float32)]

    if not query_embs:
        return {
            "matched": False,
            "similarity": None,
            "similarity_percent": None,
            "threshold": threshold,
            "message": "Face Not Recognized. Please show your QR code",
        }

    if (
        live_embedding is not None
        and getattr(live_embedding, "ndim", 0) == 1
        and len(live_embedding) >= 2
    ):
        matched_live = any(
            compute_similarity(q, live_embedding) >= 0.35
            for q in query_embs
            if getattr(q, "ndim", 0) == 1 and len(q) == len(live_embedding)
        )
        if not matched_live:
            return {
                "matched": False,
                "similarity": None,
                "similarity_percent": None,
                "threshold": threshold,
                "message": "Face Not Recognized. Please show your QR code",
            }

    scan_threshold = min(threshold, 0.42)

    kiosk_department = _resolve_kiosk_department(kiosk_id)
    course = None
    if session_id is not None:
        class_session = db.get(ClassSession, session_id)
        if class_session is not None:
            course = db.get(Course, class_session.course_id)
    if course is None:
        course = db.scalar(select(Course).where(Course.is_active.is_(True)).order_by(Course.id))

    candidates = (
        _eligible_students(db, department=kiosk_department)
        if kiosk_department
        else (_eligible_students(db, course.id) if course is not None else _eligible_students(db))
    )

    candidate_embs: list[tuple[StudentRoster, StudentProfile, User, list[np.ndarray]]] = []
    for roster, profile, matched_user in candidates:
        try:
            stored_embs = _get_roster_embeddings(face_svc, roster)
            if stored_embs:
                candidate_embs.append((roster, profile, matched_user, stored_embs))
        except Exception as exc:
            if isinstance(exc, RuntimeError):
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
            logger.warning("Failed processing photo for roster roll %s: %s", roster.roll, exc)

    if not candidate_embs:
        return {
            "matched": False,
            "similarity": None,
            "similarity_percent": None,
            "threshold": scan_threshold,
            "message": "Face Not Recognized. Please show your QR code",
        }

    # Match each detected face in the frame against registered candidate gallery
    matched_students: dict[int, dict] = {}
    for q_emb in query_embs:
        best_sim = -1.0
        best_cand = None
        for roster, profile, matched_user, stored_embs in candidate_embs:
            for stored_emb in stored_embs:
                sim = compute_similarity(q_emb, stored_emb)
                if sim > best_sim:
                    best_sim = sim
                    best_cand = (profile, matched_user)

        if best_cand is not None and best_sim >= scan_threshold:
            profile, matched_user = best_cand
            if matched_user.id not in matched_students or best_sim > matched_students[matched_user.id]["similarity"]:
                matched_students[matched_user.id] = {
                    "user": matched_user,
                    "profile": profile,
                    "similarity": best_sim,
                }

    if not matched_students:
        return {
            "matched": False,
            "similarity": None,
            "similarity_percent": None,
            "threshold": scan_threshold,
            "message": "Face Not Recognized. Please show your QR code",
        }

    now_dt = datetime.now()
    students_output = []
    attendances_output = []
    primary_course = None
    primary_teacher_id = None
    primary_record = None
    any_new_marked = False

    for item in matched_students.values():
        profile: StudentProfile = item["profile"]
        matched_user: User = item["user"]
        similarity: float = item["similarity"]

        resolved_course, resolved_teacher_id, resolved_routine = _resolve_active_class_for_student(db, matched_user, now_dt)
        class_session = None
        current_course = None
        if resolved_course is not None:
            class_session = _get_or_create_session_for_routine(
                db, resolved_course, resolved_teacher_id, now_dt, student_count=1, routine=resolved_routine
            )
            current_course = resolved_course
        else:
            current_course = db.scalar(
                select(Course)
                .where(
                    Course.department == profile.department,
                    Course.semester == profile.current_semester,
                    Course.is_active.is_(True),
                )
                .order_by(Course.id)
            )
            if current_course is None:
                current_course = db.scalar(select(Course).where(Course.is_active.is_(True)).order_by(Course.id))
            if current_course:
                resolved_teacher_id = current_course.teacher_id
                class_session = _get_or_create_session_for_routine(db, current_course, resolved_teacher_id, now_dt, student_count=1)

        if primary_course is None and current_course is not None:
            primary_course = current_course
            primary_teacher_id = resolved_teacher_id

        record = None
        already_marked = False
        if class_session:
            record = db.scalar(
                select(Attendance).where(
                    Attendance.session_id == class_session.id,
                    Attendance.student_id == matched_user.id,
                )
            )
            already_marked = record is not None
            if record is None:
                marked_at = datetime.now()
                record = Attendance(
                    session_id=class_session.id,
                    student_id=matched_user.id,
                    status=_attendance_status_for_session(class_session, marked_at),
                    marked_at=marked_at,
                    method="face",
                    confidence=similarity,
                )
                db.add(record)
                try:
                    db.commit()
                    db.refresh(record)
                    any_new_marked = True
                except IntegrityError:
                    db.rollback()
                    record = db.scalar(
                        select(Attendance).where(
                            Attendance.session_id == class_session.id,
                            Attendance.student_id == matched_user.id,
                        )
                    )
                    already_marked = True

        if primary_record is None:
            primary_record = record

        student_info = {
            "id": matched_user.id,
            "name": profile.full_name,
            "roll": profile.roll,
            "department": profile.department,
            "current_semester": profile.current_semester,
            "similarity": round(similarity, 4),
            "similarity_percent": round(max(0.0, similarity) * 100, 2),
            "already_marked": already_marked,
        }
        students_output.append(student_info)

        attendance_info = {
            "student_id": matched_user.id,
            "roll": profile.roll,
            "status": record.status if record else "present",
            "marked_at": record.marked_at.isoformat() if record else now_dt.isoformat(),
            "already_marked": already_marked,
        }
        attendances_output.append(attendance_info)

    primary_student = students_output[0]
    total_count = len(students_output)

    if total_count > 1:
        names_str = ", ".join(s["name"] for s in students_output)
        msg = f"Attendance recorded for {total_count} students: {names_str}" if any_new_marked else f"{total_count} faces recognized (attendance already marked)."
    else:
        msg = "Attendance was already marked for this class." if primary_student["already_marked"] else "Face Recognized"

    return {
        "matched": True,
        "similarity": primary_student["similarity"],
        "similarity_percent": primary_student["similarity_percent"],
        "threshold": threshold,
        "student": {
            "id": primary_student["id"],
            "name": primary_student["name"],
            "roll": primary_student["roll"],
            "department": primary_student["department"],
            "current_semester": primary_student["current_semester"],
        },
        "students": students_output,
        "attendance": {
            "status": primary_record.status if primary_record else "present",
            "marked_at": primary_record.marked_at.isoformat() if primary_record else now_dt.isoformat(),
            "already_marked": primary_student["already_marked"],
        },
        "attendances": attendances_output,
        "course": {"code": primary_course.code, "title": primary_course.title} if primary_course else None,
        "teacher_id": primary_teacher_id,
        "message": msg,
    }


@router.post("/compare")
async def compare_faces(
    image1: Optional[UploadFile] = File(None),
    image2: Optional[UploadFile] = File(None),
    image1_base64: Optional[str] = Form(None),
    image2_base64: Optional[str] = Form(None),
    threshold: float = Form(DEFAULT_SIMILARITY_THRESHOLD),
):
    """Extract ArcFace 512-d embeddings from two images and compute cosine similarity."""
    bytes1 = _decode_image_payload(image1, image1_base64)
    bytes2 = _decode_image_payload(image2, image2_base64)

    face_svc = get_face_service()

    emb1 = face_svc.extract_embedding(bytes1)
    if emb1 is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No human face detected in Image 1.")

    emb2 = face_svc.extract_embedding(bytes2)
    if emb2 is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No human face detected in Image 2.")

    matched, similarity = is_match(emb1, emb2, threshold=threshold)

    return {
        "is_match": matched,
        "similarity": round(similarity, 4),
        "similarity_percent": round(max(0.0, similarity) * 100, 2),
        "threshold": threshold,
        "embedding_dim": len(emb1),
        "message": "Faces match successfully!" if matched else "Faces do not match.",
    }


@router.post("/recognize")
async def recognize_face(
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    threshold: float = Form(DEFAULT_SIMILARITY_THRESHOLD),
    department: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Identify a student by matching against their registered face photos.
    
    If department is provided, candidate matching is restricted to that department's
    student images, reducing the face recognition search space.
    """
    query_bytes = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()

    query_emb = face_svc.extract_embedding(query_bytes)
    if query_emb is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No clear face detected in the query camera feed.")

    stmt = (
        select(StudentRoster, StudentProfile, User)
        .join(StudentProfile, StudentProfile.roster_id == StudentRoster.id)
        .join(User, User.id == StudentProfile.user_id)
        .where(
            StudentRoster.is_active.is_(True),
            StudentRoster.photo_data.is_not(None),
            User.is_active.is_(True),
            User.role == "student",
        )
    )
    if department and department.strip():
        stmt = stmt.where(func.upper(StudentRoster.department) == department.strip().upper())

    roster_records = db.execute(stmt).all()
    if not roster_records:
        dept_msg = f" for department {department.strip().upper()}" if department and department.strip() else ""
        return {
            "matched": False,
            "similarity": 0.0,
            "message": f"No active registered students with admin-approved photos were found{dept_msg}.",
            "top_match": None,
        }

    student_scores: list[tuple[float, StudentProfile, User]] = []
    for roster, profile, matched_user in roster_records:
        try:
            for registered_face in _registered_face_inputs(roster):
                stored_emb = face_svc.extract_embedding(registered_face)
                if stored_emb is not None:
                    sim = compute_similarity(query_emb, stored_emb)
                    student_scores.append((sim, profile, matched_user))
        except Exception as exc:
            logger.warning("Failed processing admin photo for roster roll %s: %s", roster.roll, exc)

    if not student_scores:
        return {
            "matched": False,
            "similarity": 0.0,
            "message": "Could not read any active student's admin-approved photo.",
            "top_match": None,
        }

    best_score, profile, matched_user = max(student_scores, key=lambda item: item[0])

    matched = best_score >= threshold

    student_data = None
    if matched_user and profile:
        student_data = {
            "id": matched_user.id,
            "name": profile.full_name,
            "roll": profile.roll,
            "department": profile.department,
            "series": profile.series,
            "section": profile.section,
            "current_semester": profile.current_semester,
            "email": matched_user.email,
            "picture": matched_user.picture,
        }

    return {
        "matched": matched,
        "similarity": round(best_score, 4),
        "similarity_percent": round(max(0.0, best_score) * 100, 2),
        "threshold": threshold,
        "student": student_data if matched else None,
        "top_match": student_data,
        "message": f"Identified as {student_data['name']} (Roll: {student_data['roll']})" if matched and student_data else "No match found above threshold.",
    }


@router.post("/recognize-department")
async def recognize_face_by_department(
    department: str = Form(...),
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    threshold: float = Form(DEFAULT_SIMILARITY_THRESHOLD),
    db: Session = Depends(get_db),
):
    """Identify a student by matching only against images in picture/{department}/ (reduced search space)."""
    return await recognize_face(
        image=image,
        image_base64=image_base64,
        threshold=threshold,
        department=department,
        db=db,
    )


def scan_department_folder_embeddings(
    face_svc,
    department: str,
    picture_root: Path | None = None,
) -> list[tuple[str, str, np.ndarray, Path]]:
    """Scan and extract embeddings for all student images in picture/{department}/."""
    if picture_root is None:
        picture_root = settings.picture_dir
    dept_dir = picture_root / department.strip()
    if not dept_dir.is_dir():
        return []

    results = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        for img_path in dept_dir.glob(ext):
            stem = img_path.stem
            parts = stem.split("_", 1)
            roll = parts[0]
            pose = parts[1] if len(parts) > 1 else "official"
            try:
                emb = face_svc.extract_embedding(str(img_path))
                if emb is not None:
                    results.append((roll, pose, emb, img_path))
            except Exception as exc:
                logger.warning("Failed extracting embedding from %s: %s", img_path, exc)
    return results
