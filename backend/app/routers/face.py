"""Face Recognition & Verification API Router.

Endpoints for:
- Live face matching against enrolled student database
- Two-image embedding cosine similarity comparison
- Face detection and 512-d ArcFace vector extraction
"""
from __future__ import annotations

import base64
import logging
from datetime import datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Attendance,
    ClassSession,
    Course,
    CourseRosterAssignment,
    Enrollment,
    StudentProfile,
    StudentRoster,
    User,
)
from ..services.face_service import (
    DEFAULT_SIMILARITY_THRESHOLD,
    compute_similarity,
    extract_embedding,
    get_face_service,
    is_match,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/face", tags=["face"])


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


class ComparePayload(BaseModel):
    image1_base64: Optional[str] = None
    image2_base64: Optional[str] = None
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD


class RecognizePayload(BaseModel):
    image_base64: str
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD


class KioskOpenRequest(BaseModel):
    course_code: str = Field(min_length=1, max_length=20)


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


@router.post("/kiosk/open")
def open_kiosk(body: KioskOpenRequest, db: Session = Depends(get_db)):
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
    query_emb = face_svc.extract_embedding(query_bytes)
    if query_emb is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No clear face detected. Look at the camera and try again.")

    student_scores: list[tuple[float, StudentProfile, User]] = []
    for roster, profile, matched_user in _eligible_students(db, course.id):
        try:
            stored_emb = face_svc.extract_embedding(roster.photo_data)
            if stored_emb is not None:
                student_scores.append((compute_similarity(query_emb, stored_emb), profile, matched_user))
        except Exception as exc:
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
            stored_emb = face_svc.extract_embedding(roster.photo_data)
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
