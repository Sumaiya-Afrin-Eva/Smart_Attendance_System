import io
import re
from datetime import datetime
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ClassRoutine, Course, CourseTeacher, Enrollment, TeacherProfile, User
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["routine"])
admin_or_sysadmin = require_role("admin", "system_admin", "eee_system_admin", "eee_admin", "super_admin")
system_admin_only = require_role("system_admin", "eee_system_admin", "super_admin")


def _dept_for_role(user: User) -> str | None:
    """Return the department an admin is scoped to.
    super_admin -> None (unrestricted)
    system_admin / admin  -> CSE
    eee_system_admin / eee_admin -> EEE
    teacher -> None
    """
    if user.role == "super_admin":
        return None
    if user.role in {"eee_system_admin", "eee_admin"}:
        return "EEE"
    if user.role in {"system_admin", "admin"}:
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


def _format_time_str(val: str) -> str:
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none"):
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
    """Normalize course code and remove any single trailing letter suffix like 'c'
    (e.g. CSE 4121c -> CSE 4121, CSE 2122c (TE) -> CSE 2122 (TE)).
    Never treats the suffix as a section.
    """
    cleaned = raw_code.strip()
    m = re.match(r"^([A-Za-z]+\s*\d{3,4})[A-Za-z](\s*\(.*?\))?$", cleaned)
    if m:
        dept_num = m.group(1).strip().upper()
        suffix = f" {m.group(2).strip()}" if m.group(2) else ""
        base = dept_num + suffix
    else:
        base = cleaned
    base = re.sub(r"^([A-Za-z]+)(\d)", r"\1 \2", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base


def _find_teacher_user(teacher_name: str, db: Session) -> User | None:
    if not teacher_name or teacher_name.lower() in ("nan", "none", "tba"):
        return None
    name_clean = teacher_name.strip()
    t = db.scalar(
        select(User).where(
            User.role.in_(["teacher", "faculty"]),
            func.lower(User.name) == name_clean.lower()
        )
    )
    if t:
        return t
    prof = db.scalar(
        select(TeacherProfile).where(
            func.lower(TeacherProfile.name) == name_clean.lower()
        )
    )
    if prof and prof.user_id:
        t = db.get(User, prof.user_id)
        if t:
            return t
    clean_no_title = re.sub(r"^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s*", "", name_clean, flags=re.IGNORECASE).strip()
    if clean_no_title:
        t = db.scalar(
            select(User).where(
                User.role.in_(["teacher", "faculty"]),
                User.name.ilike(f"%{clean_no_title}%")
            )
        )
        if t:
            return t
    parts = [p for p in name_clean.replace(".", " ").split() if len(p) > 2 and p.lower() not in ("dr", "mr", "ms", "prof")]
    for part in parts:
        matches = db.scalars(
            select(User).where(
                User.role.in_(["teacher", "faculty"]),
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

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV file."
            )
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
    df.fillna("", inplace=True)

    added = 0
    updated = 0
    skipped = 0
    skipped_items = []
    seen_course_teachers = set()

    for index, row in df.iterrows():
        row_dict = row.to_dict()
        raw_course = str(row_dict.get("course_code", "")).strip()
        if not raw_course or raw_course.lower() in ("nan", "none"):
            skipped += 1
            skipped_items.append({"row": index + 2, "reason": "Missing Course Code"})
            continue

        day = _normalize_day(str(row_dict.get("day", "")))
        raw_start = str(row_dict.get("start_time", "")).strip()
        raw_end = str(row_dict.get("end_time", "")).strip()
        if not day or not raw_start or raw_start.lower() in ("nan", "none"):
            skipped += 1
            skipped_items.append({"row": index + 2, "reason": "Missing Day or Start Time"})
            continue

        start_t = _format_time_str(raw_start)
        end_t = _format_time_str(raw_end) if raw_end and raw_end.lower() not in ("nan", "none") else start_t

        base_code = _clean_course_code(raw_course)

        raw_type = str(row_dict.get("course_type", "")).strip()
        lower_type = raw_type.lower()
        if "sessional" in lower_type or "lab" in lower_type:
            c_type = "Lab"
        elif "theory" in lower_type:
            c_type = "Theory"
        else:
            c_type = "Theory"

        m_dept = re.match(r"^([A-Za-z]+)", base_code)
        derived_dept = m_dept.group(1).upper() if m_dept else (default_department or "CSE")
        dept = str(row_dict.get("department", "")).strip().upper() or derived_dept or (default_department or "CSE")

        # Enforce dept scoping: skip rows that don't belong to this admin's dept
        if scoped_dept and dept != scoped_dept:
            dept = scoped_dept  # override to admin's dept

        derived_sem = _derive_semester_from_code(base_code)
        sem = str(row_dict.get("semester", "")).strip() or derived_sem or (default_semester or "1-1")

        raw_sec = str(row_dict.get("section", "")).strip().upper()
        sec = raw_sec if raw_sec and raw_sec.lower() not in ("nan", "none") else (default_section or "A")
        room = str(row_dict.get("room", "")).strip()
        if not room or room.lower() in ("nan", "none"):
            room = "TBA"
        session_val = str(row_dict.get("session", "2025-2026")).strip() or "2025-2026"

        raw_teacher = str(row_dict.get("teacher_name", "")).strip()
        if raw_teacher.lower() in ("nan", "none"):
            raw_teacher = ""

        teacher_user = _find_teacher_user(raw_teacher, db) if raw_teacher else None
        teacher_display_name = teacher_user.name if teacher_user else (raw_teacher or None)

        matched_c = db.scalar(select(Course).where(Course.code == base_code))
        c_title = str(row_dict.get("course_title", "")).strip()
        if matched_c:
            if not c_title or c_title.lower() in ("nan", "none"):
                c_title = matched_c.title
            if teacher_user and not matched_c.teacher_id:
                matched_c.teacher_id = teacher_user.id
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
                teacher_id=teacher_user.id if teacher_user else None,
                is_active=True,
                status="Active",
            )
            db.add(matched_c)
            db.flush()

        if teacher_user and matched_c:
            ct_key = (matched_c.id, teacher_user.id, sec)
            if ct_key not in seen_course_teachers:
                ct = db.scalar(
                    select(CourseTeacher).where(
                        CourseTeacher.course_id == matched_c.id,
                        CourseTeacher.teacher_id == teacher_user.id,
                        CourseTeacher.section == sec
                    )
                )
                if not ct:
                    db.add(CourseTeacher(
                        course_id=matched_c.id,
                        teacher_id=teacher_user.id,
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
        "total": len(df),
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
        # Check course code match if student has enrolled courses
        if enrolled_codes and s.course_code and s.course_code.strip() not in enrolled_codes:
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


@router.get("/student/routine/download")
def download_student_routine_pdf(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("student")),
):
    """Directly download the student's complete weekly routine as a PDF file."""
    import os
    os.environ.setdefault("MPLCONFIGDIR", "/tmp")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    profile = user.profile
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student profile not found")

    student_dept = (profile.department or "").strip().upper()
    student_section = (profile.section or "A").strip().upper()
    current_semester = (profile.current_semester or "").strip()

    # Enrolled courses
    enrolled_courses = db.scalars(
        select(Course).join(Enrollment, Enrollment.course_id == Course.id).where(
            Enrollment.student_id == user.id
        )
    ).all()
    enrolled_codes = {c.code.strip() for c in enrolled_courses if c.code}

    query = select(ClassRoutine)
    if student_dept:
        query = query.where(func.upper(ClassRoutine.department) == student_dept)
    if current_semester:
        query = query.where(ClassRoutine.semester == current_semester)

    all_dept_sem_slots = db.scalars(query).all()

    student_slots = []
    seen = set()

    for s in all_dept_sem_slots:
        if enrolled_codes and s.course_code and s.course_code.strip() not in enrolled_codes:
            continue
        slot_sec = (s.section or "A").strip().upper()
        if student_section and slot_sec not in {"BOTH", "ALL", "", student_section}:
            continue
        key = (s.day, s.start_time, s.end_time, s.course_code, s.teacher_name)
        if key in seen:
            continue
        seen.add(key)
        student_slots.append(s)

    sorted_slots = sorted(
        student_slots,
        key=lambda r: (DAY_ORDER.get(r.day, 99), r.start_time or "")
    )

    by_day = {d: [] for d in DAYS_OF_WEEK[:5]}  # Sunday - Thursday
    for s in sorted_slots:
        if s.day in by_day:
            by_day[s.day].append(s)

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        for day in DAYS_OF_WEEK[:5]:
            slots = by_day[day]
            fig, ax = plt.subplots(figsize=(11.69, 8.27))  # A4 landscape
            ax.axis("off")

            # Page header
            fig.text(0.08, 0.93, f"Class Routine — {day}", fontsize=17, weight="bold", color="#0f3422")
            sub_meta = f"Student: {profile.full_name}   |   Roll: {profile.roll}   |   Dept: {student_dept}   |   Semester: {current_semester}   |   Section: {student_section}"
            fig.text(0.08, 0.89, sub_meta, fontsize=9.5, color="#555555")

            if not slots:
                fig.text(0.5, 0.5, f"No classes scheduled on {day}", ha="center", fontsize=13, style="italic", color="#888888")
            else:
                table_data = []
                for s in slots:
                    c_type = s.course_type or "Theory"
                    room_val = s.room if (s.room and s.room != "TBA") else "TBA"
                    table_data.append([
                        f"{s.start_time} – {s.end_time}",
                        s.course_code,
                        s.course_title or "Class Session",
                        c_type,
                        room_val,
                        s.teacher_name or "—",
                    ])

                col_labels = ["Time Slot", "Course Code", "Course Title", "Type", "Room", "Faculty"]
                table = ax.table(
                    cellText=table_data,
                    colLabels=col_labels,
                    loc="center",
                    cellLoc="left",
                    colWidths=[0.18, 0.14, 0.32, 0.10, 0.08, 0.18],
                )
                table.auto_set_font_size(False)
                table.set_fontsize(9)
                table.scale(1, 1.8)

                for (r, c), cell in table.get_celld().items():
                    if r == 0:
                        cell.set_facecolor("#0f3422")
                        cell.set_text_props(color="white", weight="bold")
                    else:
                        cell.set_facecolor("#f9fbf9" if r % 2 == 0 else "#ffffff")

            pdf.savefig(fig, bbox_inches="tight")
            plt.close()

    buf.seek(0)
    filename = f"class_routine_{profile.roll}_{current_semester.replace('-', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )



