"""Services package for Smart Attendance System."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Course, StudentProfile, User
from .face_service import (
    DEFAULT_SIMILARITY_THRESHOLD,
    EMBEDDING_DIM,
    FaceService,
    compute_similarity,
    extract_embedding,
    get_face_service,
    is_match,
)


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.profile.full_name if user.profile else user.name,
        "role": user.role,
        "picture": user.picture,
    }


def onboarding_status(db: Session, user: User) -> dict | None:
    """Which registration steps a student has finished. None for staff."""
    if user.role != "student":
        return None
    profile: StudentProfile | None = user.profile
    roster_verified = bool(
        profile
        and profile.roster
        and profile.roster.is_active
        and profile.roster.roll == profile.roll
        and profile.roster.session == profile.session
        and profile.roster.department == profile.department
    )
    return {"profile": roster_verified, "complete": roster_verified}


def course_out(course: Course) -> dict:
    return {
        "id": course.id,
        "code": course.code,
        "title": course.title,
        "credit": course.credit,
        "department": course.department,
        "semester": course.semester,
        "type": course.course_type,
        "session": course.session,
        "section": course.section,
        "is_active": course.is_active,
    }


__all__ = [
    "user_out",
    "onboarding_status",
    "course_out",
    "FaceService",
    "get_face_service",
    "extract_embedding",
    "compute_similarity",
    "is_match",
    "DEFAULT_SIMILARITY_THRESHOLD",
    "EMBEDDING_DIM",
]
