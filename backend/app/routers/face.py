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
from datetime import datetime, time, timedelta
from pathlib import Path
from typing import Optional

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..database import get_db
from ..models import (
    Attendance,
    ClassSession,
    ConsumedAttendanceQr,
    Course,
    CourseRosterAssignment,
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


def _registered_face_inputs(roster: StudentRoster) -> list[bytes | str]:
    """Return all registration samples, falling back to the legacy database photo."""
    paths = json.loads(roster.face_sample_paths or "[]")
    project_root = Path(__file__).resolve().parents[2].parent
    inputs: list[bytes | str] = [
        str((project_root / path).resolve())
        for path in paths
        if isinstance(path, str)
    ]
    return inputs or ([roster.photo_data] if roster.photo_data else [])


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


def _prepare_kiosk_gallery(face_svc, students: list[tuple[StudentRoster, StudentProfile, User]]) -> None:
    """Warm recognition and cache registered faces after the kiosk is ready to use."""
    face_svc.warmup()
    for roster, _, _ in students:
        try:
            for registered_face in _registered_face_inputs(roster):
                face_svc.extract_embedding(registered_face)
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
    course_code: str = Field(min_length=1, max_length=20)


class KioskQrScanRequest(BaseModel):
    session_id: int
    token: str = Field(min_length=1, max_length=4096)


def _eligible_students(db: Session, course_id: int):
    return db.execute(
        select(StudentRoster, StudentProfile, User)
        .join(StudentProfile, StudentProfile.roster_id == StudentRoster.id)
        .join(User, User.id == StudentProfile.user_id)
        .join(CourseRosterAssignment, CourseRosterAssignment.roster_id == StudentRoster.id)
        .join(Enrollment, Enrollment.student_id == User.id)
        .where(
            CourseRosterAssignment.course_id == course_id,
            Enrollment.course_id == course_id,
            StudentRoster.is_active.is_(True),
            StudentRoster.photo_data.is_not(None),
            User.is_active.is_(True),
            User.role == "student",
        )
    ).all()


def _qr_error(detail: str = "This attendance QR is invalid or has expired.") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail)


@router.post("/kiosk/qr-scan")
def scan_kiosk_qr(body: KioskQrScanRequest, db: Session = Depends(get_db)):
    """Verify and consume one student QR token, then record attendance for this class."""
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
        or course.semester != profile.current_semester
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This student is not eligible for the selected course semester.")

    eligible = db.scalar(
        select(Enrollment.id)
        .join(CourseRosterAssignment, CourseRosterAssignment.course_id == Enrollment.course_id)
        .where(
            Enrollment.student_id == student.id,
            Enrollment.course_id == course.id,
            Enrollment.semester == course.semester,
            CourseRosterAssignment.roster_id == roster.id,
        )
    )
    if eligible is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This student is not assigned to the selected course.")

    jti = claims.get("jti")
    if not isinstance(jti, str) or not jti:
        raise _qr_error()
    if db.scalar(select(ConsumedAttendanceQr.id).where(ConsumedAttendanceQr.jti == jti)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This attendance QR has already been used.")

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
        record = Attendance(
            session_id=class_session.id,
            student_id=student.id,
            status="present",
            marked_at=datetime.now(),
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
    body: KioskOpenRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Open today's completed attendance session for one active course offering."""
    code = body.course_code.strip()
    courses = db.scalars(
        select(Course).where(
            func.upper(Course.code) == code.upper(),
            Course.is_active.is_(True),
        )
    ).all()
    if not courses:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active course was found for that course code.")
    if len(courses) > 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That course code has multiple active offerings. Ask the department to make the intended offering unique.",
        )

    course = courses[0]
    students = _eligible_students(db, course.id)
    if not students:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This course has no registered students with an active course assignment.",
        )

    face_svc = get_face_service()
    background_tasks.add_task(_prepare_kiosk_gallery, face_svc, students)

    now = datetime.now()
    day_start = datetime.combine(now.date(), time.min)
    next_day = day_start + timedelta(days=1)
    class_session = db.scalar(
        select(ClassSession)
        .where(
            ClassSession.course_id == course.id,
            ClassSession.start_at >= day_start,
            ClassSession.start_at < next_day,
            ClassSession.status != "cancelled",
        )
        .order_by(ClassSession.start_at)
    )
    if class_session is None:
        class_session = ClassSession(
            course_id=course.id,
            start_at=now,
            end_at=now,
            room=None,
            students=len(students),
            status="completed",
        )
        db.add(class_session)
    else:
        class_session.status = "completed"
        class_session.end_at = max(class_session.start_at, now)
        class_session.students = len(students)

    db.commit()
    db.refresh(class_session)
    return {
        "session_id": class_session.id,
        "course": {"id": course.id, "code": course.code, "title": course.title, "semester": course.semester},
        "date": class_session.start_at.date().isoformat(),
        "student_count": len(students),
    }


@router.post("/kiosk/liveness")
async def check_kiosk_liveness(
    session_id: int = Form(...),
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Verify a blink and head movement challenge for the active kiosk session."""
    class_session = db.get(ClassSession, session_id)
    if (
        class_session is None
        or class_session.status != "completed"
        or class_session.start_at.date() != datetime.now().date()
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Today's kiosk class session was not found. Open the kiosk again.")
    course = db.get(Course, class_session.course_id)
    if course is None or not course.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The selected course is no longer active.")

    frame = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()
    try:
        return await run_in_threadpool(face_svc.check_liveness, frame, f"kiosk:{session_id}")
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.post("/kiosk/scan")
async def scan_kiosk(
    session_id: int = Form(...),
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    threshold: float = Form(DEFAULT_SIMILARITY_THRESHOLD),
    db: Session = Depends(get_db),
):
    """Match a kiosk camera frame and persist attendance for the active class."""
    class_session = db.get(ClassSession, session_id)
    if (
        class_session is None
        or class_session.status != "completed"
        or class_session.start_at.date() != datetime.now().date()
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Today's kiosk class session was not found. Open the kiosk again.")
    course = db.get(Course, class_session.course_id)
    if course is None or not course.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The selected course is no longer active.")

    query_bytes = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()
    live_embedding = await run_in_threadpool(face_svc.consume_liveness, f"kiosk:{session_id}")
    if live_embedding is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Live verification is required. Blink and move your head in front of the camera; a still photo is not accepted.",
        )

    try:
        query_emb = await run_in_threadpool(face_svc.extract_embedding, query_bytes)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    if query_emb is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No clear face detected. Look at the camera and try again.")
    live_similarity = compute_similarity(query_emb, live_embedding)
    if live_similarity < 0.45:
        return {
            "matched": False,
            "similarity": round(live_similarity, 4),
            "similarity_percent": round(max(0.0, live_similarity) * 100, 2),
            "threshold": threshold,
            "message": "The face changed after live verification. Please verify again using the camera.",
        }

    student_scores: list[tuple[float, StudentProfile, User]] = []
    for roster, profile, matched_user in _eligible_students(db, course.id):
        try:
            for registered_face in _registered_face_inputs(roster):
                stored_emb = await run_in_threadpool(face_svc.extract_embedding, registered_face)
                if stored_emb is not None:
                    student_scores.append((compute_similarity(query_emb, stored_emb), profile, matched_user))
        except Exception as exc:
            if isinstance(exc, RuntimeError):
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
            logger.warning("Failed processing admin photo for roster roll %s: %s", roster.roll, exc)

    if not student_scores:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No active assigned student photos could be read for this course.",
        )

    similarity, profile, matched_user = max(student_scores, key=lambda item: item[0])
    if similarity < threshold:
        return {
            "matched": False,
            "similarity": round(similarity, 4),
            "similarity_percent": round(max(0.0, similarity) * 100, 2),
            "threshold": threshold,
            "message": "Face not verified. No attendance was recorded; please try again.",
        }

    record = db.scalar(
        select(Attendance).where(
            Attendance.session_id == class_session.id,
            Attendance.student_id == matched_user.id,
        )
    )
    already_marked = record is not None
    if record is None:
        record = Attendance(
            session_id=class_session.id,
            student_id=matched_user.id,
            status="present",
            marked_at=datetime.now(),
            method="face",
            confidence=similarity,
        )
        db.add(record)
        try:
            db.commit()
            db.refresh(record)
        except IntegrityError:
            db.rollback()
            record = db.scalar(
                select(Attendance).where(
                    Attendance.session_id == class_session.id,
                    Attendance.student_id == matched_user.id,
                )
            )
            if record is None:
                raise
            already_marked = True

    return {
        "matched": True,
        "similarity": round(similarity, 4),
        "similarity_percent": round(max(0.0, similarity) * 100, 2),
        "threshold": threshold,
        "student": {
            "id": matched_user.id,
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
        "message": "Attendance was already marked for this class." if already_marked else "Face verified and attendance recorded.",
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
    db: Session = Depends(get_db),
):
    """Identify a student by matching against their admin-approved roster photo."""
    query_bytes = _decode_image_payload(image, image_base64)
    face_svc = get_face_service()

    query_emb = face_svc.extract_embedding(query_bytes)
    if query_emb is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No clear face detected in the query camera feed.")

    roster_records = db.execute(
        select(StudentRoster, StudentProfile, User)
        .join(StudentProfile, StudentProfile.roster_id == StudentRoster.id)
        .join(User, User.id == StudentProfile.user_id)
        .where(
            StudentRoster.is_active.is_(True),
            StudentRoster.photo_data.is_not(None),
            User.is_active.is_(True),
            User.role == "student",
        )
    ).all()
    if not roster_records:
        return {
            "matched": False,
            "similarity": 0.0,
            "message": "No active registered students with admin-approved photos were found.",
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
