from datetime import date, datetime
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ClassRoutine, ClassScheduleChangeRequest, Course, CourseTeacher, TeacherProfile, User


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


DAY_ORDER = {
    "Sunday": 0,
    "Monday": 1,
    "Tuesday": 2,
    "Wednesday": 3,
    "Thursday": 4,
    "Friday": 5,
    "Saturday": 6,
}


def clean_teacher_title(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(
        r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.|Engr\.|Md\.|Most\.|Mst\.)\s*",
        "",
        str(name).strip(),
        flags=re.IGNORECASE,
    ).strip()


def get_teacher_initials(name: str | None) -> set[str]:
    if not name:
        return set()
    clean = clean_teacher_title(name)
    words = [w for w in re.split(r"[\s\.]+", clean) if w]
    initials_set: set[str] = set()
    if words:
        initials_set.add("".join([w[0].upper() for w in words]))
    full_words = [
        w
        for w in re.split(
            r"[\s\.]+",
            re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.|Engr\.)\s*", "", str(name).strip(), flags=re.I).strip(),
        )
        if w
    ]
    if full_words:
        initials_set.add("".join([w[0].upper() for w in full_words]))

    # KUET-specific common faculty initials
    lower_name = str(name).lower()
    if "masudul ahsan" in lower_name:
        initials_set.update(["SMAH", "SMMA", "SMA"])
    if "azharul hasan" in lower_name:
        initials_set.update(["KMAH", "AZH", "AZ"])
    if "mubtashim abrar nihal" in lower_name or "nihal" in lower_name:
        initials_set.update(["MAN", "MMAN"])
    if "al-mahmud" in lower_name or "mahmud" in lower_name:
        initials_set.update(["AM", "ALM"])
    if "sheikh sadi" in lower_name:
        initials_set.update(["MSS"])
    if "rokibul alam" in lower_name:
        initials_set.update(["KMRA"])
    if "hashem" in lower_name:
        initials_set.update(["MMAH"])
    if "aminul haque" in lower_name:
        initials_set.update(["MAH"])
    if "milon hossain" in lower_name:
        initials_set.update(["MMH"])
    if "saeed alam" in lower_name:
        initials_set.update(["KSA"])
    if "sakhawat hossain" in lower_name:
        initials_set.update(["MSH"])
    if "nazirulhasan" in lower_name or "shawon" in lower_name:
        initials_set.update(["MNS"])
    if "tajmilur" in lower_name:
        initials_set.update(["MTR"])
    if "subah nawar" in lower_name:
        initials_set.update(["SN"])
    if "ehsanul karim" in lower_name:
        initials_set.update(["EK"])
    return initials_set


def teacher_matches_routine_slot(
    teacher_user: User,
    slot: ClassRoutine,
    assigned_course_codes: set[str] | None = None,
) -> bool:
    if not teacher_user:
        return False

    raw_teacher_name = (slot.teacher_name or "").strip()
    user_name = (teacher_user.name or "").strip()
    course_code = (slot.course_code or "").strip().upper()
    is_course_assigned = bool(assigned_course_codes and course_code in assigned_course_codes)

    if not raw_teacher_name:
        return is_course_assigned

    clean_user = clean_teacher_title(user_name).lower()
    user_name_lower = user_name.lower()

    tokens = [t.strip() for t in re.split(r"[\+/,&;\n]|\band\b", raw_teacher_name, flags=re.I) if t.strip()]

    teacher_initials = get_teacher_initials(user_name)
    distinctive_tokens = {
        w
        for w in re.split(r"[\s\.]+", clean_user)
        if len(w) >= 4 and w not in ("dr", "mr", "ms", "prof", "md", "most", "mst")
    }
    email_user = (teacher_user.email or "").split("@")[0].lower() if teacher_user.email else ""

    for tok in tokens:
        tok_clean = clean_teacher_title(tok).lower()
        tok_lower = tok.lower()

        if tok_lower == user_name_lower or (tok_clean and tok_clean == clean_user):
            return True

        tok_upper = tok.strip().upper()
        if len(tok_upper) >= 2 and tok_upper in teacher_initials:
            return True

        if email_user and (tok_lower == email_user or tok_clean == email_user):
            return True

        if len(tok_clean) >= 4 and len(clean_user) >= 4:
            if tok_clean in clean_user or clean_user in tok_clean:
                return True

        for dt in distinctive_tokens:
            if dt in tok_clean.split():
                return True

    return False


def teacher_routine_slots(db: Session, user: User) -> list[ClassRoutine]:
    teacher_prof = db.scalar(select(TeacherProfile).where(TeacherProfile.user_id == user.id))
    teacher_dept = (teacher_prof.department if teacher_prof else "").strip().upper()

    ct_courses = db.scalars(
        select(Course.code).join(CourseTeacher, CourseTeacher.course_id == Course.id).where(
            CourseTeacher.teacher_id == user.id
        )
    ).all()
    direct_courses = db.scalars(select(Course.code).where(Course.teacher_id == user.id)).all()
    assigned_codes = {c.strip().upper() for c in (set(ct_courses) | set(direct_courses)) if c}

    query = select(ClassRoutine)
    if teacher_dept:
        query = query.where(ClassRoutine.department == teacher_dept)
    slots = db.scalars(query).all()
    seen_keys: set[tuple] = set()
    teacher_slots: list[ClassRoutine] = []

    for slot in slots:
        if teacher_matches_routine_slot(user, slot, assigned_codes):
            key = (slot.day, slot.start_time, slot.course_code, slot.section)
            if key not in seen_keys:
                seen_keys.add(key)
                teacher_slots.append(slot)

    return sorted(
        teacher_slots,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or ""),
    )
