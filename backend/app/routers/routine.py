import io
import re
from datetime import date, datetime, time, timedelta
import openpyxl
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings, BASE_DIR
from ..database import get_db
from ..models import (
    AdminSetting,
    ClassRoutine,
    ClassScheduleChangeRequest,
    ClassSession,
    Course,
    CourseTeacher,
    Enrollment,
    TeacherProfile,
    User,
)
from ..schedule_utils import (
    approved_schedule_changes,
    effective_routine_times,
    normalize_schedule_time,
    teacher_routine_slots,
    time_to_minutes,
)
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["routine"])
admin_or_sysadmin = require_role("admin", "system_admin", "eee_system_admin", "eee_admin", "super_admin")
system_admin_only = require_role("system_admin", "eee_system_admin", "super_admin")


def _dept_for_role(user: User) -> str | None:
    """Return the department an admin is scoped to.
    super_admin -> None (unrestricted)
    system_admin / admin -> CSE
    {dept}_system_admin / {dept}_admin -> {DEPT}
    teacher -> None
    """
    if user.role == "super_admin":
        return None
    if user.role.endswith("_system_admin"):
        prefix = user.role[:-13].upper()
        return prefix if prefix else "CSE"
    if user.role == "system_admin":
        return "CSE"
    if user.role.endswith("_admin") and user.role != "super_admin":
        prefix = user.role[:-6].upper()
        return prefix if prefix else "CSE"
    if user.role == "admin":
        return "CSE"
    return None

DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
DAY_ORDER = {day: idx for idx, day in enumerate(DAYS_OF_WEEK)}


class RoutineSlotIn(BaseModel):
    department: str
    semester: str
    section: str = "A"
    day: str
    start_time: str
    end_time: str
    course_code: str
    course_title: str | None = None
    course_type: str | None = "Theory"
    teacher_name: str | None = None
    room: str | None = None
    session: str | None = "2025-2026"


class ScheduleChangeRequestIn(BaseModel):
    routine_id: int
    target_date: date
    requested_start_time: str
    requested_end_time: str

    @field_validator("requested_start_time", "requested_end_time")
    @classmethod
    def normalize_time(cls, value: str) -> str:
        try:
            return normalize_schedule_time(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class ScheduleChangeDecisionIn(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in {"approved", "rejected"}:
            raise ValueError("Status must be approved or rejected.")
        return value


def _routine_out(r: ClassRoutine) -> dict:
    return {
        "id": r.id,
        "department": r.department,
        "semester": r.semester,
        "section": r.section,
        "day": r.day,
        "startTime": r.start_time,
        "endTime": r.end_time,
        "courseCode": r.course_code,
        "courseTitle": r.course_title,
        "courseType": r.course_type,
        "teacherName": r.teacher_name,
        "room": r.room,
        "session": r.session,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


def _normalize_day(raw: str) -> str:
    cleaned = (raw or "").strip().capitalize()
    mapping = {
        "Sun": "Sunday", "Sunday": "Sunday",
        "Mon": "Monday", "Monday": "Monday",
        "Tue": "Tuesday", "Tues": "Tuesday", "Tuesday": "Tuesday",
        "Wed": "Wednesday", "Wednesday": "Wednesday",
        "Thu": "Thursday", "Thurs": "Thursday", "Thursday": "Thursday",
        "Fri": "Friday", "Friday": "Friday",
        "Sat": "Saturday", "Saturday": "Saturday",
    }
    return mapping.get(cleaned, cleaned)


@router.get("/admin/routine")
def list_admin_routine(
    department: str | None = None,
    semester: str | None = None,
    section: str | None = None,
    day: str | None = None,
    session_val: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    query = select(ClassRoutine)
    # Enforce department scope: each system admin only sees their own dept
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept:
        query = query.where(ClassRoutine.department == scoped_dept)
    elif department and department != "All":
        query = query.where(ClassRoutine.department == department)
    if semester and semester != "All":
        query = query.where(ClassRoutine.semester == semester)
    if section and section != "All":
        query = query.where(ClassRoutine.section == section)
    if day and day != "All":
        query = query.where(ClassRoutine.day == day)
    if session_val and session_val != "All":
        query = query.where(ClassRoutine.session == session_val)

    rows = db.scalars(query).all()
    # Sort by day order then start_time
    sorted_rows = sorted(
        rows,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or "")
    )
    return [_routine_out(r) for r in sorted_rows]


@router.get("/routine")
def list_public_routine(
    department: str | None = None,
    semester: str | None = None,
    section: str | None = None,
    day: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(ClassRoutine)
    if department and department != "All":
        query = query.where(ClassRoutine.department == department)
    if semester and semester != "All":
        query = query.where(ClassRoutine.semester == semester)
    if section and section != "All":
        query = query.where(ClassRoutine.section == section)
    if day and day != "All":
        query = query.where(ClassRoutine.day == day)

    rows = db.scalars(query).all()
    sorted_rows = sorted(
        rows,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or "")
    )
    return [_routine_out(r) for r in sorted_rows]


@router.post("/admin/routine")
def create_routine_slot(
    body: RoutineSlotIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    dept = (body.department or "").strip().upper()
    sem = (body.semester or "").strip()
    sec = (body.section or "A").strip().upper()
    day = _normalize_day(body.day)
    start_t = (body.start_time or "").strip()
    end_t = (body.end_time or "").strip()
    c_code = (body.course_code or "").strip().upper()

    if not dept or not sem or not day or not start_t or not end_t or not c_code:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Department, semester, day, start time, end time, and course code are required."
        )

    # Enforce: each system admin can only create routines for their own dept
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept and dept != scoped_dept:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"You can only manage routines for the {scoped_dept} department."
        )

    # Auto-resolve course title if blank
    c_title = (body.course_title or "").strip()
    c_type = (body.course_type or "Theory").strip()
    teacher = (body.teacher_name or "").strip()

    if not c_title or not teacher:
        existing_c = db.scalar(select(Course).where(Course.code == c_code))
        if existing_c:
            if not c_title:
                c_title = existing_c.title
            if not c_type and existing_c.course_type:
                c_type = existing_c.course_type
            if not teacher and existing_c.teacher_id:
                t_user = db.get(User, existing_c.teacher_id)
                if t_user:
                    teacher = t_user.name

    routine = ClassRoutine(
        department=dept,
        semester=sem,
        section=sec or "A",
        day=day,
        start_time=start_t,
        end_time=end_t,
        course_code=c_code,
        course_title=c_title or None,
        course_type=c_type or "Theory",
        teacher_name=teacher or None,
        room=(body.room or "").strip() or None,
        session=(body.session or "2025-2026").strip(),
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)

    if teacher:
        t_user = _find_teacher_user(teacher, db)
        c_obj = db.scalar(select(Course).where(Course.code == c_code))
        if t_user and c_obj:
            if not c_obj.teacher_id:
                c_obj.teacher_id = t_user.id
            ct = db.scalar(select(CourseTeacher).where(
                CourseTeacher.course_id == c_obj.id,
                CourseTeacher.teacher_id == t_user.id,
                CourseTeacher.section == (sec or "Both")
            ))
            if not ct:
                db.add(CourseTeacher(
                    course_id=c_obj.id,
                    teacher_id=t_user.id,
                    section=sec or "Both",
                    role="Instructor"
                ))
                db.commit()

    return _routine_out(routine)


@router.patch("/admin/routine/{routine_id}")
def update_routine_slot(
    routine_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    slot = db.get(ClassRoutine, routine_id)
    if not slot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine slot not found.")

    # Enforce dept scoping on read
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept and slot.department != scoped_dept:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only manage routines for the {scoped_dept} department.")

    if "department" in body:
        new_dept = (body["department"] or "").strip().upper()
        if scoped_dept and new_dept != scoped_dept:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only manage routines for the {scoped_dept} department.")
        slot.department = new_dept
    if "semester" in body:
        slot.semester = (body["semester"] or "").strip()
    if "section" in body:
        slot.section = (body["section"] or "A").strip().upper()
    if "day" in body:
        slot.day = _normalize_day(body["day"])
    if "startTime" in body or "start_time" in body:
        slot.start_time = (body.get("startTime") or body.get("start_time") or "").strip()
    if "endTime" in body or "end_time" in body:
        slot.end_time = (body.get("endTime") or body.get("end_time") or "").strip()
    if "courseCode" in body or "course_code" in body:
        slot.course_code = (body.get("courseCode") or body.get("course_code") or "").strip().upper()
    if "courseTitle" in body or "course_title" in body:
        slot.course_title = (body.get("courseTitle") or body.get("course_title") or "").strip() or None
    if "courseType" in body or "course_type" in body:
        slot.course_type = (body.get("courseType") or body.get("course_type") or "Theory").strip()
    if "teacherName" in body or "teacher_name" in body:
        slot.teacher_name = (body.get("teacherName") or body.get("teacher_name") or "").strip() or None
    if "room" in body:
        slot.room = (body.get("room") or "").strip() or None
    if "session" in body:
        slot.session = (body.get("session") or "2025-2026").strip()

    db.commit()
    db.refresh(slot)
    return _routine_out(slot)


@router.delete("/admin/routine/all")
def clear_routine_slots(
    department: str | None = None,
    semester: str | None = None,
    section: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    stmt = delete(ClassRoutine)
    # Enforce dept scoping: admins can only clear their own dept
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept:
        stmt = stmt.where(ClassRoutine.department == scoped_dept)
    elif department and department != "All":
        stmt = stmt.where(ClassRoutine.department == department)
    if semester and semester != "All":
        stmt = stmt.where(ClassRoutine.semester == semester)
    if section and section != "All":
        stmt = stmt.where(ClassRoutine.section == section)

    db.execute(stmt)
    db.commit()
    return {"detail": "Selected routine slots cleared."}


@router.delete("/admin/routine/{routine_id}")
def delete_routine_slot(
    routine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    slot = db.get(ClassRoutine, routine_id)
    if not slot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine slot not found.")
    # Enforce dept scoping
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept and slot.department != scoped_dept:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only manage routines for the {scoped_dept} department.")
    db.delete(slot)
    db.commit()
    return {"detail": "Routine slot deleted successfully."}


def _format_time_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%I:%M %p")
    if hasattr(val, "strftime"):
        return val.strftime("%I:%M %p")
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "nat"):
        return ""
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p", "%I:%M:%S %p", "%H.%M"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%I:%M %p")
        except ValueError:
            pass
    return s


def _derive_semester_from_code(code: str) -> str | None:
    m = re.search(r"(\d)(\d)\d{2}", code)
    if m:
        year_d, term_d = m.group(1), m.group(2)
        if year_d in "1234" and term_d in "12":
            return f"{year_d}-{term_d}"
    return None


def _clean_course_code(raw_code: str) -> str:
    """Normalize course code and remove any single trailing letter or star suffix like 'c', '*', 'c*'
    (e.g. CSE 4121c -> CSE 4121, CSE 3209* -> CSE 3209, CSE 3217c* -> CSE 3217, CSE 2122c (TE) -> CSE 2122 (TE)).
    Never treats the suffix as a section.
    """
    cleaned = raw_code.strip()
    m = re.match(r"^([A-Za-z]+)\s*(\d{3,4})([A-Za-z*]*)(?:\s*\((.*?)\))?$", cleaned)
    if m:
        dept = m.group(1).upper()
        num = m.group(2)
        paren = m.group(4)
        if paren and paren.upper() in ("TE", "ECE", "BME", "ARCH", "CE", "ME", "EEE"):
            return f"{dept} {num} ({paren.upper()})"
        return f"{dept} {num}"
    base = re.sub(r"[*]", "", cleaned)
    base = re.sub(r"^([A-Za-z]+)(\d)", r"\1 \2", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base


def _derive_course_type(code: str) -> str:
    m = re.search(r"(\d{3,4})", code)
    if m:
        num = int(m.group(1))
        if num % 2 == 0:
            return "Lab"
        return "Theory"
    return "Theory"


def _find_teacher_user(teacher_name: str, db: Session) -> User | None:
    if not teacher_name or teacher_name.lower() in ("nan", "none", "tba"):
        return None
    name_clean = teacher_name.strip()
    norm_variants = [name_clean]
    if "ashar" in name_clean.lower():
        norm_variants.append(re.sub(r"ashar", "azhar", name_clean, flags=re.IGNORECASE))
    if "azhar" in name_clean.lower():
        norm_variants.append(re.sub(r"azhar", "ashar", name_clean, flags=re.IGNORECASE))

    for target_name in norm_variants:
        t = db.scalar(
            select(User).where(
                User.role.in_(["teacher", "faculty", "system_admin", "admin"]),
                func.lower(User.name) == target_name.lower()
            )
        )
        if t:
            return t
        prof = db.scalar(
            select(TeacherProfile).where(
                func.lower(TeacherProfile.name) == target_name.lower()
            )
        )
        if prof and prof.user_id:
            t = db.get(User, prof.user_id)
            if t:
                return t
        clean_no_title = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*", "", target_name, flags=re.IGNORECASE).strip()
        if clean_no_title:
            t = db.scalar(
                select(User).where(
                    User.role.in_(["teacher", "faculty", "system_admin", "admin"]),
                    User.name.ilike(f"%{clean_no_title}%")
                )
            )
            if t:
                return t
        parts = [p for p in target_name.replace(".", " ").split() if len(p) > 2 and p.lower() not in ("dr", "mr", "ms", "prof")]
        for part in parts:
            matches = db.scalars(
                select(User).where(
                    User.role.in_(["teacher", "faculty", "system_admin", "admin"]),
                    User.name.ilike(f"%{part}%")
                )
            ).all()
            if len(matches) == 1:
                return matches[0]
    return None


@router.get("/admin/routine/template")
def download_routine_template(_: User = Depends(system_admin_only)):
    """Generate sample CSV template for routine excel upload matching KUET CSE Department format."""
    sample_data = [
        {
            "Teacher / Lab / Class": "Dr. M. M. A. Hashem",
            "Day": "Sunday",
            "Start Time": "10:40",
            "End Time": "11:30",
            "Course": "CSE 1107",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. M. M. A. Hashem",
            "Day": "Sunday",
            "Start Time": "12:20",
            "End Time": "13:10",
            "Course": "CSE 1107",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. M. M. A. Hashem",
            "Day": "Monday",
            "Start Time": "08:50",
            "End Time": "09:40",
            "Course": "CSE 1107",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. K. M. Azharul Hasan",
            "Day": "Sunday",
            "Start Time": "10:40",
            "End Time": "13:10",
            "Course": "CSE 4122",
            "Slot Type": "Sessional / Lab (3 periods)",
        },
        {
            "Teacher / Lab / Class": "Dr. K. M. Azharul Hasan",
            "Day": "Tuesday",
            "Start Time": "08:50",
            "End Time": "09:40",
            "Course": "CSE 4121c",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. Kazi Md. Rokibul Alam",
            "Day": "Sunday",
            "Start Time": "10:40",
            "End Time": "13:10",
            "Course": "CSE 4116",
            "Slot Type": "Sessional / Lab (3 periods)",
        },
        {
            "Teacher / Lab / Class": "Dr. Muhammad Sheikh Sadi",
            "Day": "Monday",
            "Start Time": "09:40",
            "End Time": "10:30",
            "Course": "CSE 2103c",
            "Slot Type": "Theory (1 period)",
        },
    ]
    df = pd.DataFrame(sample_data)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=kuet_cse_routine_template.csv"},
    )


def _parse_matrix_routine(
    content: bytes,
    scoped_dept: str | None = None,
    default_department: str | None = None,
    default_session: str | None = "2025-2026",
) -> list[dict] | None:
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception:
        return None

    target_sheet = None
    for sname in wb.sheetnames:
        if any(k in sname.lower() for k in ["routine", "schedule", "master", "class", "cse"]):
            target_sheet = wb[sname]
            break
    if not target_sheet:
        target_sheet = wb.active

    days_set = {"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"}
    day_row_idx = None
    for r in range(1, min(target_sheet.max_row + 1, 15)):
        row_vals = [str(target_sheet.cell(row=r, column=c).value or "").strip().upper() for c in range(1, min(target_sheet.max_column + 1, 50))]
        if sum(1 for v in row_vals if v in days_set) >= 3:
            day_row_idx = r
            break

    if not day_row_idx:
        return None

    time_row_idx = None
    for r in range(day_row_idx + 1, min(day_row_idx + 4, target_sheet.max_row + 1)):
        row_str = " ".join([str(target_sheet.cell(row=r, column=c).value or "") for c in range(1, target_sheet.max_column + 1)])
        if re.search(r"\d{1,2}[:\.]\d{2}\s*(?:to|-)\s*\d{1,2}[:\.]\d{2}", row_str):
            time_row_idx = r
            break
    if not time_row_idx:
        time_row_idx = day_row_idx + 2

    merged_map = {}
    for mr in target_sheet.merged_cells.ranges:
        for r in range(mr.min_row, mr.max_row + 1):
            for c in range(mr.min_col, mr.max_col + 1):
                merged_map[(r, c)] = (mr.min_row, mr.min_col, mr.max_row, mr.max_col)

    def norm_time(t_str: str) -> str:
        if not t_str:
            return ""
        t_str = str(t_str).strip()
        m = re.match(r"(\d{1,2})[:\.](\d{2})", t_str)
        if not m:
            return t_str
        h, mn = int(m.group(1)), int(m.group(2))
        ampm = "AM" if (8 <= h <= 11) else ("PM" if (h == 12 or 1 <= h <= 6) else "AM")
        return f"{h:02d}:{mn:02d} {ampm}"

    col_day = {}
    curr_day = ""
    col_time = {}
    first_col = None
    for c in range(1, target_sheet.max_column + 1):
        d_val = target_sheet.cell(row=day_row_idx, column=c).value
        if d_val and str(d_val).strip().upper() in days_set:
            curr_day = str(d_val).strip().capitalize()
            if first_col is None:
                first_col = c
        if curr_day:
            col_day[c] = curr_day
            t_val = str(target_sheet.cell(row=time_row_idx, column=c).value or "").strip()
            m = re.search(r"(\d{1,2}[:\.]\d{2})\s*(?:to|-)\s*(\d{1,2}[:\.]\d{2})", t_val)
            if m:
                col_time[c] = (norm_time(m.group(1)), norm_time(m.group(2)))
            else:
                col_time[c] = ("", "")

    if not first_col:
        return None

    teacher_rows = []
    lab_rows = []
    class_rows = []
    current_section = None
    for r in range(time_row_idx + 1, target_sheet.max_row + 1):
        c1 = str(target_sheet.cell(row=r, column=1).value or "").strip().upper()
        c2 = str(target_sheet.cell(row=r, column=2).value or "").strip().upper()
        c3 = str(target_sheet.cell(row=r, column=3).value or "").strip()

        if "TEACHER" in c1 or c1 == "CSE" or "TEACHER" in c2:
            current_section = "TEACHERS"
        elif "LAB" in c1 or "LAB" in c2:
            current_section = "LABS"
        elif "CLASS" in c1 or "CLASS" in c2:
            current_section = "CLASSES"
        elif "NOTE" in c1 or "NOTE" in c2:
            current_section = "NOTES"

        if re.search(r"(\d)\s*(?:st|nd|rd|th)\s*year\s*(\d)\s*(?:st|nd|rd|th)\s*term", c3, re.IGNORECASE):
            current_section = "CLASSES"
        elif "lab" in c3.lower() and current_section != "CLASSES":
            current_section = "LABS"

        if current_section == "TEACHERS" and c3:
            teacher_rows.append((r, c3))
        elif current_section == "LABS" and c3:
            lab_rows.append((r, c3))
        elif current_section == "CLASSES" and c3:
            class_rows.append((r, c3))

    teachers_by_col = {}
    for r, t_name in teacher_rows:
        for c in range(first_col, target_sheet.max_column + 1):
            if (r, c) in merged_map:
                min_r, min_c, max_r, max_c = merged_map[(r, c)]
                if c != min_c:
                    continue
                val = target_sheet.cell(row=min_r, column=min_c).value
            else:
                min_c = c
                max_c = c
                val = target_sheet.cell(row=r, column=c).value
            if not val:
                continue
            for line in str(val).strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                clean_c = re.sub(r"c|\*|\s*\(.*?\)", "", line).strip()
                m_code = re.search(r"[A-Za-z]{2,5}\s*\d{4}", line)
                code_base = m_code.group(0) if m_code else clean_c
                for sc in range(min_c, max_c + 1):
                    for k in (line, clean_c, code_base):
                        if t_name not in teachers_by_col.setdefault((sc, k), []):
                            teachers_by_col[(sc, k)].append(t_name)

    labs_by_col = {}
    for r, lab_name in lab_rows:
        m_lab_room = re.search(r"\((\d{3})\)", lab_name)
        lab_room_str = f"Lab {m_lab_room.group(1)}" if m_lab_room else lab_name
        for c in range(first_col, target_sheet.max_column + 1):
            if (r, c) in merged_map:
                min_r, min_c, max_r, max_c = merged_map[(r, c)]
                if c != min_c:
                    continue
                val = target_sheet.cell(row=min_r, column=min_c).value
            else:
                min_c = c
                max_c = c
                val = target_sheet.cell(row=r, column=c).value
            if not val:
                continue
            for line in str(val).strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                clean_c = re.sub(r"c|\*|\s*\(.*?\)", "", line).strip()
                m_code = re.search(r"[A-Za-z]{2,5}\s*\d{4}", line)
                code_base = m_code.group(0) if m_code else clean_c
                for sc in range(min_c, max_c + 1):
                    for k in (line, clean_c, code_base):
                        labs_by_col[(sc, k)] = lab_room_str

    dept_target = scoped_dept or default_department or "CSE"
    session_target = default_session or "2025-2026"
    slots = []
    seen_slots = set()

    for r, class_label in class_rows:
        sem = "1-1"
        m_sem = re.search(r"(\d)\s*(?:st|nd|rd|th)\s*year\s*(\d)\s*(?:st|nd|rd|th)\s*term", class_label, re.IGNORECASE)
        if m_sem:
            sem = f"{m_sem.group(1)}-{m_sem.group(2)}"

        sec = "A"
        m_sec = re.search(r"Sec-([A-Z])", class_label, re.IGNORECASE)
        if m_sec:
            sec = m_sec.group(1).upper()

        theory_room = ""
        if "–" in class_label:
            theory_room = class_label.split("–")[-1].strip()
        elif "-" in class_label:
            theory_room = class_label.split("-")[-1].strip()

        for c in range(first_col, target_sheet.max_column + 1):
            if (r, c) in merged_map:
                min_r, min_c, max_r, max_c = merged_map[(r, c)]
                if c != min_c:
                    continue
                val = target_sheet.cell(row=min_r, column=min_c).value
            else:
                min_c = c
                max_c = c
                val = target_sheet.cell(row=r, column=c).value
            if not val:
                continue
            for line in str(val).strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                clean_c = re.sub(r"c|\*|\s*\(.*?\)", "", line).strip()
                m_code = re.search(r"[A-Za-z]{2,5}\s*\d{4}", line)
                code_base = m_code.group(0) if m_code else clean_c
                if not code_base:
                    continue

                t_names = (
                    teachers_by_col.get((min_c, line)) or
                    teachers_by_col.get((min_c, clean_c)) or
                    teachers_by_col.get((min_c, code_base)) or
                    []
                )
                t_names = list(dict.fromkeys(t_names))

                lab_rm = (
                    labs_by_col.get((min_c, line)) or
                    labs_by_col.get((min_c, clean_c)) or
                    labs_by_col.get((min_c, code_base))
                )
                room = lab_rm if lab_rm else (f"Room {theory_room}" if theory_room and not theory_room.lower().startswith("room") else theory_room)

                m_num = re.search(r"\d{3,4}", code_base)
                is_lab = (lab_rm is not None) or (m_num and int(m_num.group(0)) % 2 == 0)
                c_type = "Lab" if is_lab else "Theory"

                day = col_day.get(min_c, "")
                st = col_time.get(min_c, ("", ""))[0]
                et = col_time.get(max_c, ("", ""))[1]
                if not day or not st:
                    continue

                slot_key = (day, st, code_base, sec, sem)
                if slot_key in seen_slots:
                    continue
                seen_slots.add(slot_key)

                slots.append({
                    "row_num": r,
                    "course_code": code_base,
                    "course_title": "",
                    "course_type": c_type,
                    "department": dept_target,
                    "semester": sem,
                    "section": sec,
                    "day": day,
                    "start_time": st,
                    "end_time": et or st,
                    "teacher_name": " + ".join(t_names) if t_names else "",
                    "teachers_list": t_names,
                    "room": room or "TBA",
                    "session": session_target,
                })

    for r, t_name in teacher_rows:
        for c in range(first_col, target_sheet.max_column + 1):
            if (r, c) in merged_map:
                min_r, min_c, max_r, max_c = merged_map[(r, c)]
                if c != min_c:
                    continue
                val = target_sheet.cell(row=min_r, column=min_c).value
            else:
                min_c = c
                max_c = c
                val = target_sheet.cell(row=r, column=c).value
            if not val:
                continue
            for line in str(val).strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                clean_c = re.sub(r"c|\*|\s*\(.*?\)", "", line).strip()
                m_code = re.search(r"([A-Za-z]{2,5})\s*(\d{4})", line)
                if not m_code:
                    continue
                dept_code = m_code.group(1).upper()
                num_code = m_code.group(2)
                code_base = f"{dept_code} {num_code}"

                day = col_day.get(min_c, "")
                st = col_time.get(min_c, ("", ""))[0]
                et = col_time.get(max_c, ("", ""))[1]
                if not day or not st:
                    continue

                if any(s["day"] == day and s["start_time"] == st and s["course_code"] == code_base for s in slots):
                    continue

                m_dept_in_line = re.search(r"\(([A-Za-z]+)\)", line)
                target_dept = m_dept_in_line.group(1).upper() if m_dept_in_line else dept_code
                if scoped_dept and target_dept != scoped_dept:
                    target_dept = scoped_dept
                sem = f"{num_code[0]}-{num_code[1]}" if num_code[0] in "1234" and num_code[1] in "12" else "1-1"
                c_type = "Lab" if int(num_code) % 2 == 0 else "Theory"

                slot_key = (day, st, code_base, "A", sem)
                if slot_key in seen_slots:
                    continue
                seen_slots.add(slot_key)

                slots.append({
                    "row_num": r,
                    "course_code": code_base,
                    "course_title": "",
                    "course_type": c_type,
                    "department": target_dept,
                    "semester": sem,
                    "section": "A",
                    "day": day,
                    "start_time": st,
                    "end_time": et or st,
                    "teacher_name": t_name,
                    "teachers_list": [t_name],
                    "room": "TBA",
                    "session": session_target,
                })

    return slots


@router.post("/admin/routine/bulk-upload")
async def bulk_upload_routine(
    file: UploadFile = File(...),
    default_department: str | None = None,
    default_semester: str | None = None,
    default_section: str | None = "A",
    db: Session = Depends(get_db),
    current_user: User = Depends(system_admin_only),
):
    # Enforce dept scoping on bulk upload
    scoped_dept = _dept_for_role(current_user)
    if scoped_dept:
        default_department = scoped_dept
    content = await file.read()
    filename = (file.filename or "").lower()

    is_matrix = False
    slots_to_process = []
    if filename.endswith(".xlsx"):
        try:
            matrix_slots = _parse_matrix_routine(content, scoped_dept, default_department, "2025-2026")
            if matrix_slots is not None and len(matrix_slots) > 0:
                is_matrix = True
                slots_to_process = matrix_slots
                # Cache official master routine matrix file for direct PDF export
                try:
                    target_dept = scoped_dept or default_department or "CSE"
                    routines_dir = settings.storage_dir / "routines"
                    routines_dir.mkdir(parents=True, exist_ok=True)
                    save_path = routines_dir / f"master_routine_{target_dept.lower()}.xlsx"
                    with open(save_path, "wb") as f_out:
                        f_out.write(content)
                except Exception:
                    pass
        except Exception:
            pass

    if not is_matrix:
        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif filename.endswith((".xlsx", ".xls")):
                xl = pd.ExcelFile(io.BytesIO(content))
                target_sheet = xl.sheet_names[0]
                for s in xl.sheet_names:
                    if any(k in s.lower() for k in ["routine", "schedule", "class", "master"]):
                        target_sheet = s
                        break
                df = pd.read_excel(xl, sheet_name=target_sheet)
            else:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file."
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Error parsing file: {str(e)}"
            )

        # Standardize column headers to map to standard routine fields
        cols_map = {}
        for col in df.columns:
            raw_str = str(col).strip()
            clean = raw_str.lower().replace("_", " ").replace("-", " ")
            if "teacher" in clean or "instructor" in clean or "faculty" in clean:
                cols_map[col] = "teacher_name"
            elif "day" in clean or "weekday" in clean:
                cols_map[col] = "day"
            elif "start" in clean or "from" in clean:
                cols_map[col] = "start_time"
            elif "end" in clean or "to" in clean:
                cols_map[col] = "end_time"
            elif "type" in clean or "slot" in clean:
                cols_map[col] = "course_type"
            elif clean in ("course", "code", "subject", "course no", "course num", "course id") or "course code" in clean or "course" in clean:
                if "title" in clean or "name" in clean:
                    cols_map[col] = "course_title"
                else:
                    cols_map[col] = "course_code"
            elif "title" in clean or "name" in clean:
                cols_map[col] = "course_title"
            elif "room" in clean or "hall" in clean or "building" in clean:
                cols_map[col] = "room"
            elif "dept" in clean or "department" in clean:
                cols_map[col] = "department"
            elif "sem" in clean or "semester" in clean:
                cols_map[col] = "semester"
            elif "sec" in clean or "section" in clean:
                cols_map[col] = "section"
            elif "session" in clean:
                cols_map[col] = "session"

        df.rename(columns=cols_map, inplace=True)
        df.dropna(how="all", inplace=True)
        df = df.astype(object).fillna("")

        for index, row in df.iterrows():
            row_dict = {}
            for k, v in row.to_dict().items():
                if pd.isna(v):
                    row_dict[k] = ""
                else:
                    s = str(v).strip()
                    if s.lower() in ("nan", "none", "nat"):
                        row_dict[k] = ""
                    elif s.endswith(".0") and s[:-2].replace("-", "").isdigit():
                        row_dict[k] = s[:-2]
                    else:
                        row_dict[k] = s

            if not any(row_dict.values()):
                continue

            slots_to_process.append({
                "row_num": index + 2,
                "course_code": row_dict.get("course_code", ""),
                "course_title": row_dict.get("course_title", ""),
                "course_type": row_dict.get("course_type", ""),
                "department": row_dict.get("department", ""),
                "semester": row_dict.get("semester", ""),
                "section": row_dict.get("section", ""),
                "day": row_dict.get("day", ""),
                "start_time": row_dict.get("start_time", ""),
                "end_time": row_dict.get("end_time", ""),
                "teacher_name": row_dict.get("teacher_name", ""),
                "teachers_list": [],
                "room": row_dict.get("room", ""),
                "session": row_dict.get("session", "2025-2026"),
            })

    added = 0
    updated = 0
    skipped = 0
    skipped_items = []
    seen_course_teachers = set()

    for idx, slot in enumerate(slots_to_process):
        row_id = slot.get("row_num", idx + 1)
        raw_course = str(slot.get("course_code", "")).strip()
        if not raw_course:
            skipped += 1
            skipped_items.append({"row": row_id, "reason": "Missing Course Code"})
            continue

        day = _normalize_day(str(slot.get("day", "")))
        raw_start = str(slot.get("start_time", "")).strip()
        raw_end = str(slot.get("end_time", "")).strip()
        if not day or not raw_start or raw_start.lower() in ("nan", "none"):
            skipped += 1
            skipped_items.append({"row": row_id, "reason": "Missing Day or Start Time"})
            continue

        start_t = _format_time_str(raw_start)
        end_t = _format_time_str(raw_end) if raw_end and raw_end.lower() not in ("nan", "none") else start_t
        base_code = _clean_course_code(raw_course)

        raw_type = str(slot.get("course_type", "")).strip()
        lower_type = raw_type.lower()
        if "sessional" in lower_type or "lab" in lower_type:
            c_type = "Lab"
        elif "theory" in lower_type:
            c_type = "Theory"
        else:
            c_type = _derive_course_type(base_code)

        m_dept = re.match(r"^([A-Za-z]+)", base_code)
        derived_dept = m_dept.group(1).upper() if m_dept else (default_department or "CSE")
        dept = str(slot.get("department", "")).strip().upper() or derived_dept or (default_department or "CSE")
        if scoped_dept and dept != scoped_dept:
            dept = scoped_dept

        derived_sem = _derive_semester_from_code(base_code)
        sem = str(slot.get("semester", "")).strip() or derived_sem or (default_semester or "1-1")

        raw_sec = str(slot.get("section", "")).strip().upper()
        sec = raw_sec if raw_sec and raw_sec.lower() not in ("nan", "none") else (default_section or "A")
        room = str(slot.get("room", "")).strip()
        if not room or room.lower() in ("nan", "none"):
            room = "TBA"
        session_val = str(slot.get("session", "2025-2026")).strip() or "2025-2026"

        teachers_list = slot.get("teachers_list") or []
        raw_teacher = str(slot.get("teacher_name", "")).strip()
        if raw_teacher.lower() in ("nan", "none"):
            raw_teacher = ""
        if not teachers_list and raw_teacher:
            teachers_list = [t.strip() for t in raw_teacher.split("+") if t.strip()]

        teacher_users = []
        for t_name in teachers_list:
            u = _find_teacher_user(t_name, db)
            if u and u not in teacher_users:
                teacher_users.append(u)

        primary_teacher = teacher_users[0] if teacher_users else None
        if teacher_users:
            teacher_display_name = " + ".join([u.name for u in teacher_users])
        elif raw_teacher:
            teacher_display_name = raw_teacher
        else:
            teacher_display_name = None

        matched_c = db.scalar(select(Course).where(Course.code == base_code))
        c_title = str(slot.get("course_title", "")).strip()
        if matched_c:
            if not c_title or c_title.lower() in ("nan", "none"):
                c_title = matched_c.title
            if primary_teacher and not matched_c.teacher_id:
                matched_c.teacher_id = primary_teacher.id
            if sem and matched_c.semester != sem:
                matched_c.semester = sem
        else:
            if not c_title or c_title.lower() in ("nan", "none"):
                c_title = f"{base_code} ({c_type})"
            matched_c = Course(
                code=base_code,
                title=c_title,
                credit=3.0 if c_type == "Theory" else 1.5,
                department=dept,
                semester=sem,
                course_type=c_type,
                session=session_val,
                section=sec,
                teacher_id=primary_teacher.id if primary_teacher else None,
                is_active=True,
                status="Active",
            )
            db.add(matched_c)
            db.flush()

        for u in teacher_users:
            ct_key = (matched_c.id, u.id, sec)
            if ct_key not in seen_course_teachers:
                ct = db.scalar(
                    select(CourseTeacher).where(
                        CourseTeacher.course_id == matched_c.id,
                        CourseTeacher.teacher_id == u.id,
                        CourseTeacher.section == sec
                    )
                )
                if not ct:
                    db.add(CourseTeacher(
                        course_id=matched_c.id,
                        teacher_id=u.id,
                        section=sec,
                        role="Instructor"
                    ))
                    db.flush()
                seen_course_teachers.add(ct_key)

        existing_query = select(ClassRoutine).where(
            ClassRoutine.day == day,
            ClassRoutine.start_time == start_t,
            ClassRoutine.course_code == base_code,
            ClassRoutine.section == sec,
        )
        if teacher_display_name:
            existing_query = existing_query.where(ClassRoutine.teacher_name == teacher_display_name)
        else:
            existing_query = existing_query.where(
                (ClassRoutine.teacher_name.is_(None)) | (ClassRoutine.teacher_name == "")
            )
        existing_slot = db.scalar(existing_query)
        if existing_slot:
            existing_slot.end_time = end_t
            existing_slot.teacher_name = teacher_display_name
            existing_slot.course_title = c_title
            existing_slot.course_type = c_type
            existing_slot.semester = sem
            existing_slot.department = dept
            if room and room != "TBA":
                existing_slot.room = room
            updated += 1
        else:
            routine = ClassRoutine(
                department=dept,
                semester=sem,
                section=sec,
                day=day,
                start_time=start_t,
                end_time=end_t,
                course_code=base_code,
                course_title=c_title,
                course_type=c_type,
                teacher_name=teacher_display_name,
                room=room,
                session=session_val,
            )
            db.add(routine)
            added += 1

    db.commit()
    return {
        "detail": "Bulk routine upload and teacher assignment completed successfully.",
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "total": len(slots_to_process),
        "skipped_items": skipped_items,
    }


@router.get("/teacher/routine")
def get_teacher_routine(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("teacher", "admin", "system_admin", "eee_system_admin", "eee_admin", "super_admin")),
):
    """Retrieve the logged-in teacher's personalized weekly routine schedule."""
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

    for s in slots:
        slot_t_name = (s.teacher_name or "").lower().strip()
        clean_slot_t = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*", "", slot_t_name, flags=re.I).strip()

        name_match = False
        if slot_t_name and user_name_lower:
            if slot_t_name == user_name_lower or (clean_user and clean_user == clean_slot_t):
                name_match = True
            elif clean_user and len(clean_user) > 4 and (clean_user in clean_slot_t or clean_slot_t in clean_user):
                name_match = True

        course_match = s.course_code in assigned_codes

        if name_match:
            teacher_slots.append(s)
        elif not slot_t_name and course_match:
            teacher_slots.append(s)

    sorted_slots = sorted(
        teacher_slots,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or "")
    )
    return [_routine_out(r) for r in sorted_slots]


def _teacher_routine_slots(db: Session, user: User) -> list[ClassRoutine]:
    return teacher_routine_slots(db, user)


def _schedule_change_out(
    request: ClassScheduleChangeRequest,
    routine: ClassRoutine,
    teacher: User,
) -> dict:
    return {
        "id": request.id,
        "routineId": routine.id,
        "targetDate": request.target_date.isoformat(),
        "day": routine.day,
        "courseCode": routine.course_code,
        "courseTitle": routine.course_title,
        "department": routine.department,
        "semester": routine.semester,
        "section": routine.section,
        "room": routine.room,
        "teacherName": teacher.name,
        "originalStartTime": routine.start_time,
        "originalEndTime": routine.end_time,
        "requestedStartTime": request.requested_start_time,
        "requestedEndTime": request.requested_end_time,
        "status": request.status,
        "createdAt": request.created_at.isoformat() if request.created_at else None,
        "reviewedAt": request.reviewed_at.isoformat() if request.reviewed_at else None,
    }


@router.post("/teacher/schedule-change-requests")
def create_schedule_change_request(
    body: ScheduleChangeRequestIn,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role("teacher")),
):
    routine = db.get(ClassRoutine, body.routine_id)
    if routine is None or routine not in _teacher_routine_slots(db, teacher):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Your routine slot was not found.")

    if body.target_date < date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose today or a future class date.")
    if _normalize_day(body.target_date.strftime("%A")) != _normalize_day(routine.day):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The selected date must match this class's routine day.")

    start_minutes = time_to_minutes(body.requested_start_time)
    end_minutes = time_to_minutes(body.requested_end_time)
    if start_minutes is None or end_minutes is None or start_minutes >= end_minutes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The new end time must be after the new start time.")
    now = datetime.now()
    if body.target_date == now.date() and end_minutes <= now.hour * 60 + now.minute:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The requested class time has already passed.")

    existing = db.scalar(
        select(ClassScheduleChangeRequest).where(
            ClassScheduleChangeRequest.routine_id == routine.id,
            ClassScheduleChangeRequest.target_date == body.target_date,
            ClassScheduleChangeRequest.status.in_(("pending", "approved")),
        )
    )
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A pending or approved schedule change already exists for this class date.",
        )

    request = ClassScheduleChangeRequest(
        routine_id=routine.id,
        teacher_id=teacher.id,
        target_date=body.target_date,
        requested_start_time=body.requested_start_time,
        requested_end_time=body.requested_end_time,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return _schedule_change_out(request, routine, teacher)


@router.get("/teacher/schedule-change-requests")
def list_teacher_schedule_change_requests(
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role("teacher")),
):
    rows = db.execute(
        select(ClassScheduleChangeRequest, ClassRoutine, User)
        .join(ClassRoutine, ClassRoutine.id == ClassScheduleChangeRequest.routine_id)
        .join(User, User.id == ClassScheduleChangeRequest.teacher_id)
        .where(ClassScheduleChangeRequest.teacher_id == teacher.id)
        .order_by(ClassScheduleChangeRequest.target_date.desc(), ClassScheduleChangeRequest.id.desc())
    ).all()
    return [_schedule_change_out(request, routine, row_teacher) for request, routine, row_teacher in rows]


@router.get("/admin/schedule-change-requests")
def list_admin_schedule_change_requests(
    request_status: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_or_sysadmin),
):
    query = (
        select(ClassScheduleChangeRequest, ClassRoutine, User)
        .join(ClassRoutine, ClassRoutine.id == ClassScheduleChangeRequest.routine_id)
        .join(User, User.id == ClassScheduleChangeRequest.teacher_id)
    )
    scoped_dept = _dept_for_role(admin)
    if scoped_dept:
        query = query.where(ClassRoutine.department == scoped_dept)
    if request_status:
        if request_status not in {"pending", "approved", "rejected"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown schedule change status.")
        query = query.where(ClassScheduleChangeRequest.status == request_status)

    rows = db.execute(
        query.order_by(ClassScheduleChangeRequest.target_date.asc(), ClassScheduleChangeRequest.id.asc())
    ).all()
    return [_schedule_change_out(request, routine, teacher) for request, routine, teacher in rows]


def _has_schedule_conflict(
    db: Session,
    request: ClassScheduleChangeRequest,
    routine: ClassRoutine,
) -> bool:
    proposed_start = time_to_minutes(request.requested_start_time)
    proposed_end = time_to_minutes(request.requested_end_time)
    if proposed_start is None or proposed_end is None:
        return True

    routines = db.scalars(
        select(ClassRoutine).where(
            ClassRoutine.department == routine.department,
            func.lower(func.trim(ClassRoutine.day)) == request.target_date.strftime("%A").lower(),
            ClassRoutine.id != routine.id,
        )
    ).all()
    changes = approved_schedule_changes(db, request.target_date)
    teacher_name = (routine.teacher_name or "").strip().casefold()
    room = (routine.room or "").strip().casefold()
    section = (routine.section or "").strip().casefold()

    for other in routines:
        other_section = (other.section or "").strip().casefold()
        same_section = other.semester == routine.semester and (
            section == "both" or other_section == "both" or section == other_section
        )
        same_teacher = bool(teacher_name and teacher_name == (other.teacher_name or "").strip().casefold())
        same_room = bool(room and room == (other.room or "").strip().casefold())
        if not (same_section or same_teacher or same_room):
            continue

        other_start, other_end = effective_routine_times(other, changes)
        other_start_minutes = time_to_minutes(other_start)
        other_end_minutes = time_to_minutes(other_end)
        if (
            other_start_minutes is not None
            and other_end_minutes is not None
            and proposed_start < other_end_minutes
            and other_start_minutes < proposed_end
        ):
            return True
    return False


@router.patch("/admin/schedule-change-requests/{request_id}")
def decide_schedule_change_request(
    request_id: int,
    body: ScheduleChangeDecisionIn,
    db: Session = Depends(get_db),
    admin: User = Depends(admin_or_sysadmin),
):
    request = db.get(ClassScheduleChangeRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule change request not found.")
    routine = db.get(ClassRoutine, request.routine_id)
    if routine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The requested routine slot no longer exists.")

    scoped_dept = _dept_for_role(admin)
    if scoped_dept and routine.department != scoped_dept:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only review {scoped_dept} schedule requests.")
    if request.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This schedule change request has already been reviewed.")

    if body.status == "approved":
        if request.target_date < date.today():
            raise HTTPException(status.HTTP_409_CONFLICT, "Past schedule changes cannot be approved.")
        existing = db.scalar(
            select(ClassScheduleChangeRequest).where(
                ClassScheduleChangeRequest.routine_id == routine.id,
                ClassScheduleChangeRequest.target_date == request.target_date,
                ClassScheduleChangeRequest.status == "approved",
                ClassScheduleChangeRequest.id != request.id,
            )
        )
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Another schedule change is already approved for this class date.")
        if _has_schedule_conflict(db, request, routine):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "The requested time conflicts with another class, teacher, or room schedule.",
            )

    request.status = body.status
    request.reviewed_by = admin.id
    request.reviewed_at = datetime.now()

    if body.status == "approved":
        start_min = time_to_minutes(request.requested_start_time)
        end_min = time_to_minutes(request.requested_end_time)
        course = db.scalar(
            select(Course).where(
                func.upper(func.trim(Course.code)) == func.upper(func.trim(routine.course_code)),
                func.upper(func.trim(Course.department)) == func.upper(func.trim(routine.department)),
                Course.semester == routine.semester,
                Course.is_active.is_(True),
            )
        )
        if course is not None and start_min is not None and end_min is not None:
            day_start = datetime.combine(request.target_date, time.min)
            next_day = day_start + timedelta(days=1)
            new_start = datetime.combine(request.target_date, time(start_min // 60, start_min % 60))
            new_end = datetime.combine(request.target_date, time(end_min // 60, end_min % 60))
            sessions = db.scalars(
                select(ClassSession).where(
                    ClassSession.course_id == course.id,
                    ClassSession.start_at >= day_start,
                    ClassSession.start_at < next_day,
                    ClassSession.status != "cancelled",
                    (ClassSession.teacher_id == request.teacher_id) | (ClassSession.teacher_id.is_(None)),
                )
            ).all()
            for sess in sessions:
                sess.start_at = new_start
                sess.end_at = max(new_end, new_start)

    db.commit()
    db.refresh(request)
    teacher = db.get(User, request.teacher_id)
    return _schedule_change_out(request, routine, teacher)


@router.get("/student/routine")
def get_student_routine(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("student")),
):
    """Retrieve the logged-in student's weekly routine schedule for assigned/enrolled courses."""
    profile = user.profile
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student profile not found")

    student_dept = (profile.department or "").strip().upper()
    student_section = (profile.section or "A").strip().upper()
    current_semester = (profile.current_semester or "").strip()

    # Get student enrolled courses
    enrolled_courses = db.scalars(
        select(Course).join(Enrollment, Enrollment.course_id == Course.id).where(
            Enrollment.student_id == user.id
        )
    ).all()
    enrolled_codes = {c.code.strip() for c in enrolled_courses if c.code}
    clean_enrolled = {_clean_course_code(c) for c in enrolled_codes}

    # Query master routine slots
    # Matches:
    # 1. Course code is in enrolled_codes
    # 2. Or department + semester match
    query = select(ClassRoutine)
    if student_dept:
        query = query.where(func.upper(ClassRoutine.department) == student_dept)
    if current_semester:
        query = query.where(ClassRoutine.semester == current_semester)

    all_dept_sem_slots = db.scalars(query).all()

    student_slots = []
    seen = set()

    for s in all_dept_sem_slots:
        clean_slot_code = _clean_course_code(s.course_code)
        is_enrolled_match = (clean_slot_code in clean_enrolled) or (s.course_code and s.course_code.strip() in enrolled_codes)
        is_active_term_match = bool(current_semester and s.semester == current_semester and student_dept and s.department and s.department.upper() == student_dept)

        if not (is_enrolled_match or is_active_term_match):
            continue

        # Check section match: slot section matches student's section or is universal/both
        slot_sec = (s.section or "A").strip().upper()
        if student_section and slot_sec not in {"BOTH", "ALL", "", student_section}:
            continue

        # Deduplicate identical day+time+course+teacher
        key = (s.day, s.start_time, s.end_time, s.course_code, s.teacher_name)
        if key in seen:
            continue
        seen.add(key)
        student_slots.append(s)

    sorted_slots = sorted(
        student_slots,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or "")
    )
    return [_routine_out(r) for r in sorted_slots]


DEPT_FULL_NAMES = {
    "CSE": "Department of Computer Science and Engineering",
    "EEE": "Department of Electrical and Electronic Engineering",
    "ECE": "Department of Electronics and Communication Engineering",
    "ME": "Department of Mechanical Engineering",
    "CE": "Department of Civil Engineering",
    "BME": "Department of Biomedical Engineering",
    "IEM": "Department of Industrial Engineering and Management",
    "MSE": "Department of Materials Science and Engineering",
    "URP": "Department of Urban and Regional Planning",
    "ARCH": "Department of Architecture",
    "BECM": "Department of Building Engineering and Construction Management",
    "LE": "Department of Leather Engineering",
    "TE": "Department of Textile Engineering",
    "ChE": "Department of Chemical Engineering",
    "MTE": "Department of Mechatronics Engineering",
    "ESE": "Department of Energy Science and Engineering",
    "PHY": "Department of Physics",
    "CHEM": "Department of Chemistry",
    "MATH": "Department of Mathematics",
    "HUM": "Department of Humanities",
}

TEACHER_INITIALS_MAP = {
    "Dr. M. M. A. Hashem": "MMA",
    "Dr. K. M. Azharul Hasan": "AH",
    "Dr. Md. Abdul Awal": "AAW",
    "Ms. Dola Das": "DD",
    "Mr. Kazi Saeed Alam": "KSA",
    "Mr. Repon Islam": "MRI",
    "Mr. Md. Repon Islam": "MRI",
    "Mr. Md. Nazirulhasan Shawon": "NHS",
    "Md. Badiuzzaman Shuvo": "BS",
    "Mr. Md. Badiuzzaman Shuvo": "BS",
    "Mr. Safin Ahmmed": "SA",
    "Ms. Most. Kaniz Fatema Isha": "KFI",
    "Mr. Md Tajmilur Rahman": "TR",
    "Mr. Nabil Faiyaz Sadi": "NFS",
    "Mr. Waliul Islam Sumon": "WIS",
    "Mst. Sadia Islam": "SI",
    "Mr. Ehsanul Karim": "EK",
    "Dr. Al-Mahmud": "AM",
    "Dr. Sk. Md. Masudul Ahsan": "MMAh",
    "Sk Md Masudul Ahsan": "MMAh",
    "Dr. Muhammad Sheikh Sadi": "MSS",
    "Dr. Muhammad Aminul Haque": "MAH",
    "Dr. Kazi Md. Rokibul Alam": "KMRA",
    "Dr. Md. Milon Hossain": "MMH",
    "Md. Mubtashim Abrar Nihal": "MMAN",
}


def _get_teacher_initial(name: str) -> str:
    clean = name.strip()
    if clean in TEACHER_INITIALS_MAP:
        return TEACHER_INITIALS_MAP[clean]
    no_title = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.|Prof\. Dr\.|Mst\.|Most\.)\s*", "", clean, flags=re.IGNORECASE).strip()
    words = [w for w in re.split(r"[\s\.]+", no_title) if w]
    if len(words) >= 3:
        return "".join([w[0].upper() for w in words[:3]])
    elif len(words) == 2:
        return "".join([w[0].upper() for w in words])
    elif len(words) == 1:
        return words[0][:2].upper()
    return clean[:3].upper()


def _parse_teacher_initials(teacher_field: str) -> str:
    if not teacher_field:
        return ""
    parts = re.split(r"\s*[\+/]\s*|\s+and\s+", teacher_field)
    inits = [_get_teacher_initial(p) for p in parts if p.strip()]
    delim = "+" if "+" in teacher_field else ("/" if "/" in teacher_field else "+")
    return delim.join(inits)


def _format_semester_term(sem: str) -> str:
    ordinals = {"1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th"}
    if "-" in sem:
        parts = sem.split("-")
        y = ordinals.get(parts[0].strip(), f"{parts[0].strip()}th")
        t = ordinals.get(parts[1].strip(), f"{parts[1].strip()}th")
        return f"{y} Year {t} Term"
    return sem


def _time_to_mins(t_str: str) -> int:
    s = str(t_str).strip().upper()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M", "%H:%M:%S"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.hour * 60 + dt.minute
        except ValueError:
            pass
    return 0


def _map_slot_periods(start_t: str, end_t: str) -> tuple[int, int]:
    sm = _time_to_mins(start_t)
    em = _time_to_mins(end_t)

    # Morning lab block: 08:00 - 10:30 (480 - 630)
    if sm <= 490 and em >= 620:
        return (1, 3)
    # Midday lab block: 10:40 - 13:10 (640 - 790)
    if 630 <= sm <= 650 and em >= 780:
        return (4, 6)
    # Afternoon lab block: 14:30 - 17:00 (870 - 1020)
    if 860 <= sm <= 880 and em >= 1010:
        return (7, 9)
    # Afternoon 2-period: 15:20 - 17:00 (920 - 1020)
    if 910 <= sm <= 930 and em >= 1010:
        return (8, 9)

    # Single periods
    if sm < 520:
        return (1, 1)
    if sm < 570:
        return (2, 2)
    if sm < 630:
        return (3, 3)
    if sm < 680:
        return (4, 4)
    if sm < 730:
        return (5, 5)
    if sm < 850:
        return (6, 6)
    if sm < 910:
        return (7, 7)
    if sm < 960:
        return (8, 8)
    return (9, 9)


@router.get("/student/routine/download")
def download_student_routine_pdf(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("student")),
):
    """Directly download the official department master routine PDF in official KUET format."""
    import os
    os.environ.setdefault("MPLCONFIGDIR", "/tmp")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

    profile = user.profile
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student profile not found")

    student_dept = (profile.department or "CSE").strip().upper()
    current_semester = (profile.current_semester or "3-2").strip()

    # 1. University Name from Super Admin Customization Settings
    inst_setting = db.scalar(select(AdminSetting).where(AdminSetting.key == "instName"))
    univ_name = (inst_setting.value.strip() if inst_setting and inst_setting.value else "Khulna University of Engineering & Technology")

    # 2. Department Name from Student Department
    dept_full = DEPT_FULL_NAMES.get(student_dept, f"Department of {student_dept}")

    # 3. Formatted Semester Term
    term_title = _format_semester_term(current_semester)

    # 4. Fetch Master Routine Slots
    query = select(ClassRoutine).where(
        func.upper(ClassRoutine.department) == student_dept,
        ClassRoutine.semester == current_semester,
    ).order_by(ClassRoutine.day, ClassRoutine.start_time)
    slots = db.scalars(query).all()

    session_val = (profile.session or "").strip()
    if not session_val:
        roster = db.scalar(select(StudentRoster).where(StudentRoster.roll == profile.roll))
        if roster and roster.session:
            session_val = roster.session.strip()
    if not session_val and slots and slots[0].session:
        session_val = slots[0].session
    if not session_val:
        session_val = "2023-2024"

    # Partition by section
    slots_a_by_day = {d: [] for d in ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]}
    slots_b_by_day = {d: [] for d in ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]}

    theory_rooms_a, lab_rooms_a = set(), {}
    theory_rooms_b, lab_rooms_b = set(), {}
    unique_teachers = {}
    unique_courses = {}

    course_catalog = {c.code.strip(): (c.title or "").strip() for c in db.scalars(select(Course)).all() if c.code}

    for s in slots:
        day = (s.day or "").strip()
        sec_clean = (s.section or "A").strip().upper()
        p_start, p_end = _map_slot_periods(s.start_time or "", s.end_time or "")

        # Teacher initials
        inits = _parse_teacher_initials(s.teacher_name or "")

        # Course number & normalized base code
        ccode = s.course_code or ""
        base_code = _clean_course_code(ccode)
        if base_code and base_code not in unique_courses:
            unique_courses[base_code] = course_catalog.get(base_code) or s.course_title or base_code

        c_num_match = re.search(r"\d{3,4}", ccode)
        c_num = c_num_match.group(0) if c_num_match else ""

        # Batch tag detection
        batch_tag = ""
        if "A1/A2" in ccode or "A1/A2" in sec_clean or "(A1/A2)" in (s.teacher_name or ""):
            batch_tag = "(A1/A2)"
        elif "A2/A1" in ccode or "A2/A1" in sec_clean:
            batch_tag = "(A2/A1)"
        elif "A1" in ccode or sec_clean == "A1" or "A1" in (s.room or ""):
            batch_tag = "(A1)"
        elif "A2" in ccode or sec_clean == "A2" or "A2" in (s.room or ""):
            batch_tag = "(A2)"
        elif "B1/B2" in ccode or "B1/B2" in sec_clean:
            batch_tag = "(B1/B2)"
        elif "B2/B1" in ccode or "B2/B1" in sec_clean:
            batch_tag = "(B2/B1)"
        elif "B1" in ccode or sec_clean == "B1":
            batch_tag = "(B1)"
        elif "B2" in ccode or sec_clean == "B2":
            batch_tag = "(B2)"
        elif "A/B" in ccode or "A/B" in (s.teacher_name or ""):
            batch_tag = "(A/B)"
        elif "B/A" in ccode or "B/A" in (s.teacher_name or ""):
            batch_tag = "(B/A)"

        # Text inside cell
        is_multi = (p_end > p_start)
        if is_multi:
            parts = [ccode]
            if batch_tag and batch_tag not in ccode:
                parts.append(batch_tag)
            if inits:
                parts.append(f"({inits})")
            cell_text = " ".join(parts)
            f_size = 6.6 if len(cell_text) <= 24 else 6.0
        else:
            if inits:
                cell_text = f"{ccode}\n({inits})"
            else:
                cell_text = ccode
            max_line_len = max(len(l) for l in cell_text.split("\n"))
            if max_line_len >= 10:
                f_size = 4.6
            elif max_line_len >= 8:
                f_size = 4.9
            else:
                f_size = 5.3

        slot_obj = {
            "start_period": p_start,
            "end_period": p_end,
            "text": cell_text,
            "f_size": f_size,
            "course_code": ccode,
            "course_type": s.course_type or "Theory",
            "room": s.room,
            "teacher": s.teacher_name,
        }

        # Route to Section A
        if sec_clean in ("A", "A1", "A2", "BOTH", "ALL", "A/B", "B/A", ""):
            if day in slots_a_by_day:
                slots_a_by_day[day].append(slot_obj)
            if s.room and s.room != "TBA":
                if (s.course_type or "").lower() == "theory":
                    theory_rooms_a.add(s.room.split("(")[0].strip())
                else:
                    r_clean = s.room.split("(")[0].strip()
                    lab_rooms_a.setdefault(r_clean, set()).add(c_num)

        # Route to Section B
        if sec_clean in ("B", "B1", "B2", "BOTH", "ALL", "A/B", "B/A", ""):
            if day in slots_b_by_day:
                slots_b_by_day[day].append(slot_obj)
            if s.room and s.room != "TBA":
                if (s.course_type or "").lower() == "theory":
                    theory_rooms_b.add(s.room.split("(")[0].strip())
                else:
                    r_clean = s.room.split("(")[0].strip()
                    lab_rooms_b.setdefault(r_clean, set()).add(c_num)

        # Collect teachers
        if s.teacher_name and s.teacher_name != "TBA":
            for t_item in re.split(r"\s*[\+/]\s*|\s+and\s+", s.teacher_name):
                t_item = t_item.strip()
                if t_item and t_item not in unique_teachers:
                    unique_teachers[t_item] = _get_teacher_initial(t_item)

    # Teacher DB official names
    db_teachers = db.scalars(
        select(TeacherProfile).where(func.upper(TeacherProfile.department) == student_dept)
    ).all()
    teacher_db_names = {t.name.strip().lower(): t.name.strip() for t in db_teachers if t.name}

    # Format Room lines
    def format_room_line(theory_set, lab_map):
        th_str = ", ".join(sorted(theory_set)) if theory_set else "B-306, B-102*"
        lab_parts = []
        for rm, c_set in sorted(lab_map.items()):
            c_list = ", ".join(sorted(c_set))
            lab_parts.append(f"{rm} ({c_list})" if c_list else rm)
        lab_str = ", ".join(lab_parts) if lab_parts else "CSE-103 (3212, 3218, 3220), CSE-305 (3210), CSE-306/501 (3230)"
        return f"Room No.: Theory: {th_str}, Lab: {lab_str}"

    room_text_a = format_room_line(theory_rooms_a, lab_rooms_a)
    room_text_b = format_room_line(theory_rooms_b, lab_rooms_b)

    # Format Teachers list
    def teacher_sort_key(t_name):
        init = unique_teachers.get(t_name, "")
        preferred_order = ["MMA", "AH", "AAW", "DD", "KSA", "MRI", "NHS", "BS", "SA", "KFI", "TR", "NFS", "WIS", "SI", "EK"]
        if init in preferred_order:
            return (0, preferred_order.index(init))
        return (1, t_name)

    teacher_items = []
    sorted_teachers = sorted(unique_teachers.keys(), key=teacher_sort_key)
    for idx, t_name in enumerate(sorted_teachers, start=1):
        official_name = teacher_db_names.get(t_name.lower(), t_name)
        init = unique_teachers[t_name]
        teacher_items.append((f"{idx}.", f"{official_name} ({init})"))

    # Format Courses list
    course_items = []
    for c_code in sorted(unique_courses.keys()):
        course_items.append((c_code, unique_courses[c_code]))

    # --- Render Figure (A4 Landscape) ---
    fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
    ax.set_xlim(0, 11.69)
    ax.set_ylim(0, 8.27)
    ax.axis("off")

    font_family = "sans-serif"

    # Header block (NO Khulna 9203, clean spacing)
    ax.text(5.845, 8.12, dept_full, ha="center", va="top", fontsize=12.5, weight="bold", fontfamily=font_family)
    ax.text(5.845, 7.90, univ_name, ha="center", va="top", fontsize=11, weight="bold", fontfamily=font_family)
    ax.text(5.845, 7.68, "CLASS ROUTINE", ha="center", va="top", fontsize=10.5, weight="bold", fontfamily=font_family)

    t_sem = f"Class Routine – {term_title}"
    ax.text(5.845, 7.46, t_sem, ha="center", va="top", fontsize=10, weight="bold", fontfamily=font_family)
    ax.plot([4.35, 7.34], [7.30, 7.30], color="black", lw=1.0)

    # Subheaders (Session is student session, NO starting date)
    ax.text(0.40, 6.95, f"Session: {session_val}", ha="left", va="bottom", fontsize=9.0, weight="bold", fontfamily=font_family)

    # Columns
    col_widths = [0.88, 0.64, 0.64, 0.64, 0.22, 0.64, 0.64, 0.64, 0.22, 0.64, 0.64, 0.64]
    total_w = sum(col_widths)
    x_start = 0.40

    col_xs = [x_start]
    for w in col_widths:
        col_xs.append(col_xs[-1] + w)

    per_to_col = {
        1: 1, 2: 2, 3: 3,
        4: 5, 5: 6, 6: 7,
        7: 9, 8: 10, 9: 11
    }
    days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]

    def draw_section_table(y_top, sec_title, slots_data, room_text):
        ax.text(x_start + total_w / 2.0, y_top + 0.12, sec_title, ha="center", va="bottom", fontsize=10, weight="bold", fontfamily=font_family)

        h_r0 = 0.18
        h_r1 = 0.14
        h_r2 = 0.32
        h_day = 0.32
        total_h = h_r0 + h_r1 + h_r2 + 5 * h_day
        y_bottom = y_top - total_h

        ax.add_patch(patches.Rectangle((x_start, y_bottom), total_w, total_h, fill=False, edgecolor="black", lw=1.0))

        y_lines = [
            y_top,
            y_top - h_r0,
            y_top - h_r0 - h_r1,
            y_top - h_r0 - h_r1 - h_r2
        ]
        for i in range(1, 6):
            y_lines.append(y_top - h_r0 - h_r1 - h_r2 - i * h_day)

        # Header cells
        ax.plot([col_xs[0], col_xs[1]], [y_lines[1], y_lines[1]], color="black", lw=0.6)
        ax.text((col_xs[0] + col_xs[1])/2, (y_lines[0] + y_lines[1])/2, "Period", ha="center", va="center", fontsize=7.5, weight="bold")
        ax.plot([col_xs[0], col_xs[1]], [y_lines[3], y_lines[3]], color="black", lw=0.6)
        ax.text((col_xs[0] + col_xs[1])/2, (y_lines[1] + y_lines[3])/2, "Day", ha="center", va="center", fontsize=8, weight="bold")

        p_nums = {1: "1", 2: "2", 3: "3", 5: "4", 6: "5", 7: "6", 9: "7", 10: "8", 11: "9"}
        for c_idx, num_str in p_nums.items():
            ax.plot([col_xs[c_idx], col_xs[c_idx+1]], [y_lines[1], y_lines[1]], color="black", lw=0.6)
            ax.text((col_xs[c_idx] + col_xs[c_idx+1])/2, (y_lines[0] + y_lines[1])/2, num_str, ha="center", va="center", fontsize=8, weight="bold")

        for (c_s, c_e) in [(1, 4), (5, 8), (9, 12)]:
            ax.plot([col_xs[c_s], col_xs[c_e]], [y_lines[2], y_lines[2]], color="black", lw=0.6)
            ax.text((col_xs[c_s] + col_xs[c_e])/2, (y_lines[1] + y_lines[2])/2, "Time", ha="center", va="center", fontsize=7, fontfamily=font_family)

        times_map = {
            1: "08:00\nto\n08:50",
            2: "08:50\nto\n09:40",
            3: "09:40\nto\n10:30",
            5: "10:40\nto\n11:30",
            6: "11:30\nto\n12:20",
            7: "12:20\nto\n01:10",
            9: "02:30\nto\n03:20",
            10: "03:20\nto\n04:10",
            11: "04:10\nto\n05:00"
        }
        for c_idx, t_str in times_map.items():
            ax.text((col_xs[c_idx] + col_xs[c_idx+1])/2, (y_lines[2] + y_lines[3])/2, t_str, ha="center", va="center", fontsize=6.0, weight="bold", linespacing=0.82)

        ax.plot([x_start, x_start + total_w], [y_lines[3], y_lines[3]], color="black", lw=0.8)

        # Break columns
        break_letters = ["B", "R", "E", "A", "K"]
        for b_col in [4, 8]:
            ax.plot([col_xs[b_col], col_xs[b_col]], [y_lines[0], y_bottom], color="black", lw=0.6)
            ax.plot([col_xs[b_col+1], col_xs[b_col+1]], [y_lines[0], y_bottom], color="black", lw=0.6)
            b_cx = (col_xs[b_col] + col_xs[b_col+1]) / 2.0
            for d_idx, ch in enumerate(break_letters):
                d_yt = y_lines[3 + d_idx]
                d_yb = y_lines[3 + d_idx + 1]
                ax.text(b_cx, (d_yt + d_yb)/2.0, ch, ha="center", va="center", fontsize=7.5, weight="bold")

        ax.plot([col_xs[1], col_xs[1]], [y_lines[0], y_bottom], color="black", lw=0.8)

        for c_idx in [2, 3, 6, 7, 10, 11]:
            ax.plot([col_xs[c_idx], col_xs[c_idx]], [y_lines[0], y_lines[1]], color="black", lw=0.6)
            ax.plot([col_xs[c_idx], col_xs[c_idx]], [y_lines[2], y_lines[3]], color="black", lw=0.6)

        # Day rows
        for d_idx, day_name in enumerate(days):
            d_yt = y_lines[3 + d_idx]
            d_yb = y_lines[3 + d_idx + 1]

            ax.plot([x_start, x_start + total_w], [d_yb, d_yb], color="black", lw=0.6)
            ax.text((col_xs[0] + col_xs[1])/2, (d_yt + d_yb)/2, day_name, ha="center", va="center", fontsize=7.0, weight="bold")

            day_slots = slots_data.get(day_name, [])
            occupied = [False] * 12

            for s in day_slots:
                p_start = s["start_period"]
                p_end = s["end_period"]
                c_s = per_to_col.get(p_start, 1)
                c_e = per_to_col.get(p_end, c_s) + 1
                for ci in range(c_s, c_e):
                    if ci < 12:
                        occupied[ci] = True

                x1 = col_xs[c_s]
                x2 = col_xs[c_e]
                ax.plot([x1, x1], [d_yt, d_yb], color="black", lw=0.6)
                ax.plot([x2, x2], [d_yt, d_yb], color="black", lw=0.6)

                cx = (x1 + x2) / 2.0
                cy = (d_yt + d_yb) / 2.0
                text = s["text"]
                f_size = s.get("f_size", 5.0)
                ax.text(cx, cy, text, ha="center", va="center", fontsize=f_size, weight="bold", linespacing=0.88)

            for group in [(1, 2, 3), (5, 6, 7), (9, 10, 11)]:
                for ci in group:
                    if not occupied[ci]:
                        ax.plot([col_xs[ci], col_xs[ci]], [d_yt, d_yb], color="black", lw=0.4)
                ax.plot([col_xs[group[-1]+1], col_xs[group[-1]+1]], [d_yt, d_yb], color="black", lw=0.6)

        ax.text(x_start, y_bottom - 0.08, room_text, ha="left", va="top", fontsize=7.0, weight="bold", fontfamily=font_family)

    # Draw SEC - A and SEC - B
    draw_section_table(6.55, "SEC - A", slots_a_by_day, room_text_a)
    draw_section_table(3.65, "SEC - B", slots_b_by_day, room_text_b)

    # --- Right Side Tables: List of Teachers & List of Courses ---
    x_r = 7.68
    w_r = 3.61

    def draw_list_table(y_top, title, col1_title, col2_title, items, w_col1, row_h=0.13):
        total_rows = len(items)
        h_title = 0.16
        h_header = 0.14
        table_h = h_title + h_header + total_rows * row_h
        y_bot = y_top - table_h

        ax.add_patch(patches.Rectangle((x_r, y_bot), w_r, table_h, fill=False, edgecolor="black", lw=1.0))

        y_t1 = y_top - h_title
        ax.plot([x_r, x_r + w_r], [y_t1, y_t1], color="black", lw=0.8)
        ax.text(x_r + w_r/2.0, (y_top + y_t1)/2.0, title, ha="center", va="center", fontsize=8.0, weight="bold")

        y_t2 = y_t1 - h_header
        ax.plot([x_r, x_r + w_r], [y_t2, y_t2], color="black", lw=0.8)
        ax.plot([x_r + w_col1, x_r + w_col1], [y_t1, y_bot], color="black", lw=0.6)

        ax.text(x_r + w_col1/2.0, (y_t1 + y_t2)/2.0, col1_title, ha="center", va="center", fontsize=7.0, weight="bold")
        ax.text(x_r + w_col1 + (w_r - w_col1)/2.0, (y_t1 + y_t2)/2.0, col2_title, ha="center", va="center", fontsize=7.0, weight="bold")

        curr_y = y_t2
        for c1, c2 in items:
            next_y = curr_y - row_h
            ax.plot([x_r, x_r + w_r], [next_y, next_y], color="black", lw=0.4)
            ax.text(x_r + 0.04, (curr_y + next_y)/2.0, c1, ha="left", va="center", fontsize=6.5)
            c2_display = c2 if len(c2) <= 52 else c2[:50] + "..."
            f_title_sz = 5.6 if len(c2_display) > 36 else 6.3
            ax.text(x_r + w_col1 + 0.05, (curr_y + next_y)/2.0, c2_display, ha="left", va="center", fontsize=f_title_sz)
            curr_y = next_y

        return y_bot

    t_row_h = min(0.13, 2.2 / max(len(teacher_items), 1)) if teacher_items else 0.13
    y_after_teachers = draw_list_table(6.55, "List of Teachers", "Sl. No.", "Teacher Name", teacher_items, w_col1=0.45, row_h=t_row_h)

    c_row_h = 0.14
    draw_list_table(y_after_teachers - 0.18, "List of Courses", "Course No.", "Course Title", course_items, w_col1=0.85, row_h=c_row_h)

    buf = io.BytesIO()
    fig.savefig(buf, format="pdf", bbox_inches="tight")
    plt.close(fig)

    buf.seek(0)
    filename = f"class_routine_{profile.roll}_{current_semester.replace('-', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def _format_matrix_cell_text(val, is_span: bool) -> tuple[str, float]:
    if not val:
        return "", 5.0
    text = str(val).strip()
    if is_span:
        lines = text.split("\n")
        if len(lines) >= 2:
            return text, 4.3
        return text, 5.5
    else:
        if "\n" in text:
            return text, 3.8
        parts = text.split()
        if len(parts) == 2:
            return f"{parts[0]}\n{parts[1]}", 4.8
        elif len(parts) == 3 and parts[2].startswith("(") and parts[2].endswith(")"):
            return f"{parts[0]}\n{parts[1]}\n{parts[2]}", 3.8
        elif len(parts) > 2:
            return text.replace(" ", "\n"), 3.8
        return text, 4.8


def _generate_master_routine_matrix_pdf(
    dept_code: str,
    dept_full_name: str,
    univ_name: str,
    db_slots: list = None,
) -> io.BytesIO:
    import os
    os.environ.setdefault("MPLCONFIGDIR", "/tmp")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    routines_dir = settings.storage_dir / "routines"
    file_path = routines_dir / f"master_routine_{dept_code.lower()}.xlsx"

    sheet = None
    if file_path.exists():
        try:
            wb = openpyxl.load_workbook(file_path, data_only=True)
            sheet = wb.active
        except Exception:
            sheet = None

    fig_w, fig_h = 17.0, 11.0
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    ax.set_xlim(0, fig_w)
    ax.set_ylim(0, fig_h)
    ax.axis("off")

    # Header text (centered at top, NO updated date)
    y_header = 10.65
    ax.text(fig_w / 2.0, y_header, dept_full_name, ha="center", va="top", fontsize=13, weight="bold", fontfamily="sans-serif")
    ax.text(fig_w / 2.0, y_header - 0.22, univ_name, ha="center", va="top", fontsize=11, weight="bold", fontfamily="sans-serif")
    ax.text(fig_w / 2.0, y_header - 0.42, "Master Routine", ha="center", va="top", fontsize=11, weight="bold", fontfamily="sans-serif")

    x_start = 0.35
    y_top = y_header - 0.65

    w_col1 = 0.28   # Section label ('CSE', 'LABS', 'CLASSES')
    w_col2 = 0.32   # Sl. No.
    w_col3 = 2.10   # Teacher / Lab / Class name
    w_per = (fig_w - x_start - 0.35 - (w_col1 + w_col2 + w_col3)) / 45.0

    col_xs = [x_start, x_start + w_col1, x_start + w_col1 + w_col2, x_start + w_col1 + w_col2 + w_col3]
    for p in range(45):
        col_xs.append(col_xs[-1] + w_per)

    h_head1 = 0.24  # Day row
    h_head2 = 0.20  # Period row
    h_head3 = 0.24  # Time row

    if sheet:
        days_set = {"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"}
        day_row_idx = None
        for r in range(1, min(sheet.max_row + 1, 15)):
            row_vals = [str(sheet.cell(row=r, column=c).value or "").strip().upper() for c in range(1, min(sheet.max_column + 1, 50))]
            if sum(1 for v in row_vals if v in days_set) >= 3:
                day_row_idx = r
                break
        if not day_row_idx:
            day_row_idx = 4

        time_row_idx = day_row_idx + 2

        teacher_rows = []
        lab_rows = []
        class_rows = []
        current_section = None
        for r in range(time_row_idx + 1, sheet.max_row + 1):
            c1 = str(sheet.cell(row=r, column=1).value or "").strip().upper()
            c2 = str(sheet.cell(row=r, column=2).value or "").strip().upper()
            c3 = str(sheet.cell(row=r, column=3).value or "").strip()

            if "TEACHER" in c1 or c1 == dept_code.upper() or "TEACHER" in c2:
                current_section = "TEACHERS"
            elif "LAB" in c1 or "LAB" in c2:
                current_section = "LABS"
            elif "CLASS" in c1 or "CLASS" in c2:
                current_section = "CLASSES"
            elif "NOTE" in c1 or "NOTE" in c2:
                current_section = "NOTES"

            if re.search(r"(\d)\s*(?:st|nd|rd|th)\s*year\s*(\d)\s*(?:st|nd|rd|th)\s*term", c3, re.IGNORECASE):
                current_section = "CLASSES"
            elif "lab" in c3.lower() and current_section != "CLASSES":
                current_section = "LABS"

            if current_section == "TEACHERS" and c3:
                teacher_rows.append((r, c3))
            elif current_section == "LABS" and c3:
                lab_rows.append((r, c3))
            elif current_section == "CLASSES" and c3:
                class_rows.append((r, c3))

        content_rows = teacher_rows + lab_rows + class_rows
        n_content_rows = len(content_rows)
        row_h = (y_top - (h_head1 + h_head2 + h_head3) - 0.28) / max(float(n_content_rows), 1.0)

        row_ys = [y_top, y_top - h_head1, y_top - h_head1 - h_head2, y_top - h_head1 - h_head2 - h_head3]
        for r in range(n_content_rows):
            row_ys.append(row_ys[-1] - row_h)

        y_bottom = row_ys[-1]

        merged_map = {}
        for mr in sheet.merged_cells.ranges:
            for r in range(mr.min_row, mr.max_row + 1):
                for c in range(mr.min_col, mr.max_col + 1):
                    merged_map[(r, c)] = (mr.min_row, mr.min_col, mr.max_row, mr.max_col)

        # Outer border
        ax.plot([col_xs[0], col_xs[-1]], [row_ys[0], row_ys[0]], color="black", lw=1.2)
        ax.plot([col_xs[0], col_xs[-1]], [y_bottom, y_bottom], color="black", lw=1.2)
        ax.plot([col_xs[0], col_xs[0]], [row_ys[0], y_bottom], color="black", lw=1.2)
        ax.plot([col_xs[-1], col_xs[-1]], [row_ys[0], y_bottom], color="black", lw=1.2)

        # Header: Day
        ax.plot([col_xs[0], col_xs[-1]], [row_ys[1], row_ys[1]], color="black", lw=0.8)
        ax.text((col_xs[0] + col_xs[3]) / 2.0, (row_ys[0] + row_ys[1]) / 2.0, "Day", ha="center", va="center", fontsize=7.5, weight="bold")

        days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"]
        for d_idx, day_str in enumerate(days):
            c_start = 3 + d_idx * 9
            c_end = c_start + 9
            x_d1 = col_xs[c_start]
            x_d2 = col_xs[c_end]
            ax.text((x_d1 + x_d2) / 2.0, (row_ys[0] + row_ys[1]) / 2.0, day_str, ha="center", va="center", fontsize=8.0, weight="bold")
            ax.plot([x_d1, x_d1], [row_ys[0], y_bottom], color="black", lw=1.0)

        # Header: Period
        ax.plot([col_xs[0], col_xs[-1]], [row_ys[2], row_ys[2]], color="black", lw=0.8)
        ax.text((col_xs[0] + col_xs[3]) / 2.0, (row_ys[1] + row_ys[2]) / 2.0, "Period and Time", ha="center", va="center", fontsize=7.0, weight="bold")
        for p_idx in range(45):
            per_num = (p_idx % 9) + 1
            x1, x2 = col_xs[3 + p_idx], col_xs[4 + p_idx]
            ax.text((x1 + x2) / 2.0, (row_ys[1] + row_ys[2]) / 2.0, str(per_num), ha="center", va="center", fontsize=7.0, weight="bold")
            ax.plot([x1, x1], [row_ys[1], row_ys[3]], color="black", lw=0.4)

        # Header: Time
        ax.plot([col_xs[0], col_xs[-1]], [row_ys[3], row_ys[3]], color="black", lw=1.0)
        ax.text((col_xs[0] + col_xs[1]) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, "Sl.\nNo.", ha="center", va="center", fontsize=6.0, weight="bold", linespacing=0.85)
        ax.text((col_xs[1] + col_xs[3]) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, "Teacher / Lab / Class", ha="center", va="center", fontsize=7.0, weight="bold")

        times = ["08:00 to 08:50", "08:50 to 09:40", "09:40 to 10:30", "10:40 to 11:30", "11:30 to 12:20", "12:20 to 01:10", "02:30 to 03:20", "03:20 to 04:10", "04:10 to 5:00"]
        for p_idx in range(45):
            t_str = times[p_idx % 9].replace(" to ", "\nto\n")
            x1, x2 = col_xs[3 + p_idx], col_xs[4 + p_idx]
            ax.text((x1 + x2) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, t_str, ha="center", va="center", fontsize=4.2, weight="bold", linespacing=0.8)

        # Vertical divider lines
        ax.plot([col_xs[1], col_xs[1]], [row_ys[2], y_bottom], color="black", lw=0.6)
        n_teachers = len(teacher_rows)
        ax.plot([col_xs[2], col_xs[2]], [row_ys[2], row_ys[3 + n_teachers]], color="black", lw=0.6)
        ax.plot([col_xs[3], col_xs[3]], [row_ys[0], y_bottom], color="black", lw=1.0)

        # Draw Section Sidebars
        sections_bounds = []
        curr_g = 0
        if teacher_rows:
            sections_bounds.append(("TEACHERS", curr_g, curr_g + len(teacher_rows), "\n".join(list(dept_code))))
            curr_g += len(teacher_rows)
        if lab_rows:
            sections_bounds.append(("LABS", curr_g, curr_g + len(lab_rows), "L\nA\nB\nS"))
            curr_g += len(lab_rows)
        if class_rows:
            sections_bounds.append(("CLASSES", curr_g, curr_g + len(class_rows), "C\nL\nA\nS\nS\nE\nS"))
            curr_g += len(class_rows)

        for sec_name, g_s, g_e, v_label in sections_bounds:
            y_sec_t = row_ys[3 + g_s]
            y_sec_b = row_ys[3 + g_e]
            ax.text((col_xs[0] + col_xs[1]) / 2.0, (y_sec_t + y_sec_b) / 2.0, v_label, ha="center", va="center", fontsize=7.5, weight="bold", linespacing=1.2)
            ax.plot([col_xs[0], col_xs[-1]], [y_sec_b, y_sec_b], color="black", lw=1.0)

        # Render rows
        for g_idx, (s_r, name_val) in enumerate(content_rows):
            y_t = row_ys[3 + g_idx]
            y_b = row_ys[3 + g_idx + 1]

            ax.plot([col_xs[1], col_xs[-1]], [y_b, y_b], color="black", lw=0.4)

            # Sl No for teachers
            if g_idx < len(teacher_rows):
                sl_val = sheet.cell(s_r, 2).value or (g_idx + 1)
                ax.text((col_xs[1] + col_xs[2]) / 2.0, (y_t + y_b) / 2.0, str(sl_val), ha="center", va="center", fontsize=6.2)

            name_str = str(name_val).strip()
            x_name_start = col_xs[2] if g_idx < len(teacher_rows) else col_xs[1]
            f_sz = 5.8 if len(name_str) > 28 else 6.3
            ax.text(x_name_start + 0.04, (y_t + y_b) / 2.0, name_str, ha="left", va="center", fontsize=f_sz)

            for s_c in range(4, 49):
                if (s_r, s_c) in merged_map:
                    min_r, min_c, max_r, max_c = merged_map[(s_r, s_c)]
                    if s_c != min_c:
                        continue
                    val = sheet.cell(min_r, min_c).value
                    c_start_idx = min_c - 1
                    c_end_idx = max_c
                else:
                    val = sheet.cell(s_r, s_c).value
                    c_start_idx = s_c - 1
                    c_end_idx = s_c

                x1 = col_xs[c_start_idx]
                x2 = col_xs[c_end_idx]

                ax.plot([x1, x1], [y_t, y_b], color="black", lw=0.4)
                ax.plot([x2, x2], [y_t, y_b], color="black", lw=0.4)

                if val:
                    is_span = (c_end_idx - c_start_idx > 1)
                    fmt_text, f_size = _format_matrix_cell_text(val, is_span)
                    ax.text((x1 + x2) / 2.0, (y_t + y_b) / 2.0, fmt_text, ha="center", va="center", fontsize=f_size, weight="bold", linespacing=0.82)

    else:
        # Fallback dynamic rendering from db_slots
        db_slots = db_slots or []
        teachers = []
        for s in db_slots:
            tname = getattr(s, "teacher_name", None) or (s.get("teacher_name") if isinstance(s, dict) else "")
            if tname:
                for t in tname.split("+"):
                    t_clean = t.strip()
                    if t_clean and t_clean not in teachers:
                        teachers.append(t_clean)

        labs = []
        for s in db_slots:
            rm = getattr(s, "room", None) or (s.get("room") if isinstance(s, dict) else "")
            if rm and "lab" in rm.lower() and rm not in labs:
                labs.append(rm)

        classes_map = {}
        for s in db_slots:
            sem = getattr(s, "semester", None) or (s.get("semester") if isinstance(s, dict) else "")
            sec = getattr(s, "section", None) or (s.get("section", "A") if isinstance(s, dict) else "A")
            if sem:
                key = (sem, sec)
                rm = getattr(s, "room", None) or (s.get("room") if isinstance(s, dict) else "")
                th_rm = rm if (rm and not rm.lower().startswith("lab") and rm != "TBA") else ""
                if key not in classes_map:
                    classes_map[key] = th_rm
                elif th_rm and not classes_map[key]:
                    classes_map[key] = th_rm

        class_rows = []
        for (sem, sec), th_rm in sorted(classes_map.items()):
            lbl = f"{sem} (Sec-{sec})"
            if th_rm:
                lbl += f" – {th_rm}"
            class_rows.append(lbl)

        teacher_items = [(t, "TEACHER") for t in teachers]
        lab_items = [(l, "LAB") for l in labs]
        class_items = [(c, "CLASS") for c in class_rows]
        content_rows = teacher_items + lab_items + class_items
        n_content_rows = max(len(content_rows), 10)
        row_h = (y_top - (h_head1 + h_head2 + h_head3) - 0.28) / float(n_content_rows)

        row_ys = [y_top, y_top - h_head1, y_top - h_head1 - h_head2, y_top - h_head1 - h_head2 - h_head3]
        for r in range(n_content_rows):
            row_ys.append(row_ys[-1] - row_h)

        y_bottom = row_ys[-1]

        ax.plot([col_xs[0], col_xs[-1]], [row_ys[0], row_ys[0]], color="black", lw=1.2)
        ax.plot([col_xs[0], col_xs[-1]], [y_bottom, y_bottom], color="black", lw=1.2)
        ax.plot([col_xs[0], col_xs[0]], [row_ys[0], y_bottom], color="black", lw=1.2)
        ax.plot([col_xs[-1], col_xs[-1]], [row_ys[0], y_bottom], color="black", lw=1.2)

        ax.plot([col_xs[0], col_xs[-1]], [row_ys[1], row_ys[1]], color="black", lw=0.8)
        ax.text((col_xs[0] + col_xs[3]) / 2.0, (row_ys[0] + row_ys[1]) / 2.0, "Day", ha="center", va="center", fontsize=7.5, weight="bold")

        days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"]
        for d_idx, day_str in enumerate(days):
            c_start = 3 + d_idx * 9
            c_end = c_start + 9
            x_d1 = col_xs[c_start]
            x_d2 = col_xs[c_end]
            ax.text((x_d1 + x_d2) / 2.0, (row_ys[0] + row_ys[1]) / 2.0, day_str, ha="center", va="center", fontsize=8.0, weight="bold")
            ax.plot([x_d1, x_d1], [row_ys[0], y_bottom], color="black", lw=1.0)

        ax.plot([col_xs[0], col_xs[-1]], [row_ys[2], row_ys[2]], color="black", lw=0.8)
        ax.text((col_xs[0] + col_xs[3]) / 2.0, (row_ys[1] + row_ys[2]) / 2.0, "Period and Time", ha="center", va="center", fontsize=7.0, weight="bold")
        for p_idx in range(45):
            per_num = (p_idx % 9) + 1
            x1, x2 = col_xs[3 + p_idx], col_xs[4 + p_idx]
            ax.text((x1 + x2) / 2.0, (row_ys[1] + row_ys[2]) / 2.0, str(per_num), ha="center", va="center", fontsize=7.0, weight="bold")
            ax.plot([x1, x1], [row_ys[1], row_ys[3]], color="black", lw=0.4)

        ax.plot([col_xs[0], col_xs[-1]], [row_ys[3], row_ys[3]], color="black", lw=1.0)
        ax.text((col_xs[0] + col_xs[1]) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, "Sl.\nNo.", ha="center", va="center", fontsize=6.0, weight="bold", linespacing=0.85)
        ax.text((col_xs[1] + col_xs[3]) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, "Teacher / Lab / Class", ha="center", va="center", fontsize=7.0, weight="bold")

        times = ["08:00 to 08:50", "08:50 to 09:40", "09:40 to 10:30", "10:40 to 11:30", "11:30 to 12:20", "12:20 to 01:10", "02:30 to 03:20", "03:20 to 04:10", "04:10 to 5:00"]
        for p_idx in range(45):
            t_str = times[p_idx % 9].replace(" to ", "\nto\n")
            x1, x2 = col_xs[3 + p_idx], col_xs[4 + p_idx]
            ax.text((x1 + x2) / 2.0, (row_ys[2] + row_ys[3]) / 2.0, t_str, ha="center", va="center", fontsize=4.2, weight="bold", linespacing=0.8)

        ax.plot([col_xs[1], col_xs[1]], [row_ys[2], y_bottom], color="black", lw=0.6)
        n_teachers = len(teacher_items)
        ax.plot([col_xs[2], col_xs[2]], [row_ys[2], row_ys[3 + n_teachers]], color="black", lw=0.6)
        ax.plot([col_xs[3], col_xs[3]], [row_ys[0], y_bottom], color="black", lw=1.0)

        curr_g = 0
        if teacher_items:
            y_sec_t, y_sec_b = row_ys[3 + curr_g], row_ys[3 + curr_g + len(teacher_items)]
            ax.text((col_xs[0] + col_xs[1]) / 2.0, (y_sec_t + y_sec_b) / 2.0, "\n".join(list(dept_code)), ha="center", va="center", fontsize=7.5, weight="bold", linespacing=1.2)
            ax.plot([col_xs[0], col_xs[-1]], [y_sec_b, y_sec_b], color="black", lw=1.0)
            curr_g += len(teacher_items)
        if lab_items:
            y_sec_t, y_sec_b = row_ys[3 + curr_g], row_ys[3 + curr_g + len(lab_items)]
            ax.text((col_xs[0] + col_xs[1]) / 2.0, (y_sec_t + y_sec_b) / 2.0, "L\nA\nB\nS", ha="center", va="center", fontsize=7.5, weight="bold", linespacing=1.2)
            ax.plot([col_xs[0], col_xs[-1]], [y_sec_b, y_sec_b], color="black", lw=1.0)
            curr_g += len(lab_items)
        if class_items:
            y_sec_t, y_sec_b = row_ys[3 + curr_g], row_ys[3 + curr_g + len(class_items)]
            ax.text((col_xs[0] + col_xs[1]) / 2.0, (y_sec_t + y_sec_b) / 2.0, "C\nL\nA\nS\nS\nE\nS", ha="center", va="center", fontsize=7.5, weight="bold", linespacing=1.2)
            ax.plot([col_xs[0], col_xs[-1]], [y_sec_b, y_sec_b], color="black", lw=1.0)
            curr_g += len(class_items)

        # Map db_slots to cell assignments in content_rows for dynamic fallback
        slot_map = {}
        day_indices = {"SUNDAY": 0, "MONDAY": 1, "TUESDAY": 2, "WEDNESDAY": 3, "THURSDAY": 4}
        time_slot_starts = ["08:00", "08:50", "09:40", "10:40", "11:30", "12:20", "02:30", "03:20", "04:10"]

        def _find_period_idx(day_name: str, start_t: str):
            d_idx = day_indices.get(str(day_name).strip().upper())
            if d_idx is None:
                return None
            clean_s = re.sub(r"[^0-9:]", "", str(start_t))
            for p, tp in enumerate(time_slot_starts):
                if tp in clean_s or clean_s in tp:
                    return d_idx * 9 + p
            return None

        teacher_row_map = {t: idx for idx, (t, _) in enumerate(teacher_items)}
        lab_row_map = {l: len(teacher_items) + idx for idx, (l, _) in enumerate(lab_items)}
        class_row_map = {c: len(teacher_items) + len(lab_items) + idx for idx, (c, _) in enumerate(class_items)}

        for s in db_slots:
            day_val = getattr(s, "day", "") or (s.get("day") if isinstance(s, dict) else "")
            start_val = getattr(s, "start_time", "") or (s.get("start_time") if isinstance(s, dict) else "")
            p_idx = _find_period_idx(day_val, start_val)
            if p_idx is None:
                continue

            c_code = getattr(s, "course_code", "") or (s.get("course_code") if isinstance(s, dict) else "")
            t_name = getattr(s, "teacher_name", "") or (s.get("teacher_name") if isinstance(s, dict) else "")
            rm = getattr(s, "room", "") or (s.get("room") if isinstance(s, dict) else "")
            sem = getattr(s, "semester", "") or (s.get("semester") if isinstance(s, dict) else "")
            sec = getattr(s, "section", "A") or (s.get("section", "A") if isinstance(s, dict) else "A")

            if t_name:
                for tn in t_name.split("+"):
                    t_idx = teacher_row_map.get(tn.strip())
                    if t_idx is not None and (t_idx, p_idx) not in slot_map:
                        slot_map[(t_idx, p_idx)] = c_code

            if rm and rm in lab_row_map:
                l_idx = lab_row_map[rm]
                if (l_idx, p_idx) not in slot_map:
                    slot_map[(l_idx, p_idx)] = c_code

            for c_lbl, c_idx in class_row_map.items():
                if sem in c_lbl and f"Sec-{sec}" in c_lbl:
                    if (c_idx, p_idx) not in slot_map:
                        slot_map[(c_idx, p_idx)] = c_code

        for g_idx, (name_str, r_type) in enumerate(content_rows):
            y_t = row_ys[3 + g_idx]
            y_b = row_ys[3 + g_idx + 1]
            ax.plot([col_xs[1], col_xs[-1]], [y_b, y_b], color="black", lw=0.4)

            if r_type == "TEACHER":
                ax.text((col_xs[1] + col_xs[2]) / 2.0, (y_t + y_b) / 2.0, str(g_idx + 1), ha="center", va="center", fontsize=6.2)
                x_start_nm = col_xs[2]
            else:
                x_start_nm = col_xs[1]

            f_sz = 5.8 if len(name_str) > 28 else 6.3
            ax.text(x_start_nm + 0.04, (y_t + y_b) / 2.0, name_str, ha="left", va="center", fontsize=f_sz)

            for p in range(45):
                x1, x2 = col_xs[3 + p], col_xs[4 + p]
                ax.plot([x1, x1], [y_t, y_b], color="black", lw=0.4)
                ax.plot([x2, x2], [y_t, y_b], color="black", lw=0.4)

                val = slot_map.get((g_idx, p))
                if val:
                    fmt_text, f_size = _format_matrix_cell_text(val, False)
                    ax.text((x1 + x2) / 2.0, (y_t + y_b) / 2.0, fmt_text, ha="center", va="center", fontsize=f_size, weight="bold", linespacing=0.82)

    buf = io.BytesIO()
    fig.savefig(buf, format="pdf", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


@router.get("/admin/routine/download-pdf")
def download_master_routine_pdf(
    department: str | None = None,
    day: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(admin_or_sysadmin),
):
    """Directly download the complete department master routine matrix matching KUET official layout."""
    scoped = _dept_for_role(user)
    dept_target = scoped if scoped else (department if (department and department != "All") else "CSE")
    dept_code = dept_target.upper()
    dept_full_name = DEPT_FULL_NAMES.get(dept_code, f"Department of {dept_code}")

    inst_setting = db.scalar(select(AdminSetting).where(AdminSetting.key == "instName"))
    univ_name = inst_setting.value.strip() if (inst_setting and inst_setting.value and inst_setting.value.strip()) else "Khulna University of Engineering & Technology (KUET)"

    db_slots = db.scalars(
        select(ClassRoutine).where(func.upper(ClassRoutine.department) == dept_code)
    ).all()

    buf = _generate_master_routine_matrix_pdf(
        dept_code=dept_code,
        dept_full_name=dept_full_name,
        univ_name=univ_name,
        db_slots=db_slots,
    )

    dept_slug = dept_code.lower()
    filename = f"master_routine_{dept_slug}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )





