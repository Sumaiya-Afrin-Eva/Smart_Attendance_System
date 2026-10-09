"""Shared helpers used by several routers."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Course, Enrollment, StudentProfile, User


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
    has_courses = False
    if profile:
        has_courses = bool(
            db.scalar(
                select(func.count(Enrollment.id)).where(
                    Enrollment.student_id == user.id,
                    Enrollment.semester == profile.current_semester,
                )
            )
        )
    steps = {
        "profile": profile is not None,
        "face": bool(profile and profile.face_status != "none"),
        "courses": has_courses,
    }
    steps["complete"] = all(steps.values())
    return steps


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
        "status": getattr(course, "status", "Active"),
    }
