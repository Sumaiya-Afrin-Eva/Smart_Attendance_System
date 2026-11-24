from datetime import date, datetime
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ClassRoutine, ClassScheduleChangeRequest, Course, CourseTeacher, User


def time_to_minutes(value: str | None) -> int | None:
    if not value:
        return None

    text = " ".join(str(value).strip().upper().split())
    for time_format in ("%I:%M %p", "%I:%M%p", "%H:%M", "%H:%M:%S"):
        try:
            parsed = datetime.strptime(text, time_format)
            return parsed.hour * 60 + parsed.minute
        except ValueError:
            continue
    return None


def normalize_schedule_time(value: str) -> str:
    minutes = time_to_minutes(value)
    if minutes is None:
        raise ValueError("Enter a valid time, such as 02:30 PM.")
    return datetime.strptime(f"{minutes // 60:02d}:{minutes % 60:02d}", "%H:%M").strftime("%I:%M %p")


def approved_schedule_changes(db: Session, target_date: date) -> dict[int, ClassScheduleChangeRequest]:
    requests = db.scalars(
        select(ClassScheduleChangeRequest)
        .where(
            ClassScheduleChangeRequest.target_date == target_date,
            ClassScheduleChangeRequest.status == "approved",
        )
        .order_by(ClassScheduleChangeRequest.id)
    ).all()
    return {request.routine_id: request for request in requests}


def effective_routine_times(
    routine: ClassRoutine,
    changes: dict[int, ClassScheduleChangeRequest],
) -> tuple[str, str]:
    change = changes.get(routine.id)
    if change is not None:
        return change.requested_start_time, change.requested_end_time
    return routine.start_time, routine.end_time


def teacher_routine_slots(db: Session, user: User) -> list[ClassRoutine]:
    ct_courses = db.scalars(
        select(Course.code).join(CourseTeacher, CourseTeacher.course_id == Course.id).where(
            CourseTeacher.teacher_id == user.id
        )
    ).all()
    direct_courses = db.scalars(select(Course.code).where(Course.teacher_id == user.id)).all()
    assigned_codes = set(ct_courses) | set(direct_courses)

    slots = db.scalars(select(ClassRoutine)).all()
    teacher_slots = []
    user_name_lower = (user.name or "").lower().strip()
    clean_user = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*", "", user_name_lower, flags=re.I).strip()

    for slot in slots:
        slot_name = (slot.teacher_name or "").lower().strip()
        clean_slot_name = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*", "", slot_name, flags=re.I).strip()
        name_match = bool(
            slot_name
            and user_name_lower
            and (
                slot_name == user_name_lower
                or clean_user == clean_slot_name
                or (len(clean_user) > 4 and (clean_user in clean_slot_name or clean_slot_name in clean_user))
            )
        )

        if name_match or (not slot_name and slot.course_code in assigned_codes):
            teacher_slots.append(slot)

    return teacher_slots
