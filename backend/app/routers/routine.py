import io
from datetime import datetime
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ClassRoutine, Course, User
from ..security import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["routine"])
admin_or_sysadmin = require_role("admin", "system_admin")
system_admin_only = require_role("system_admin")

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
    _: User = Depends(system_admin_only),
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
    _: User = Depends(system_admin_only),
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
    return _routine_out(routine)


@router.patch("/admin/routine/{routine_id}")
def update_routine_slot(
    routine_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    slot = db.get(ClassRoutine, routine_id)
    if not slot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine slot not found.")

    if "department" in body:
        slot.department = (body["department"] or "").strip().upper()
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


@router.delete("/admin/routine/{routine_id}")
def delete_routine_slot(
    routine_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    slot = db.get(ClassRoutine, routine_id)
    if not slot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine slot not found.")
    db.delete(slot)
    db.commit()
    return {"detail": "Routine slot deleted successfully."}


@router.delete("/admin/routine/all")
def clear_routine_slots(
    department: str | None = None,
    semester: str | None = None,
    section: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    stmt = delete(ClassRoutine)
    if department and department != "All":
        stmt = stmt.where(ClassRoutine.department == department)
    if semester and semester != "All":
        stmt = stmt.where(ClassRoutine.semester == semester)
    if section and section != "All":
        stmt = stmt.where(ClassRoutine.section == section)

    db.execute(stmt)
    db.commit()
    return {"detail": "Selected routine slots cleared."}


@router.get("/admin/routine/template")
def download_routine_template(_: User = Depends(system_admin_only)):
    """Generate sample CSV template for routine excel upload."""
    sample_data = [
        {
            "Day": "Sunday",
            "Start Time": "08:00 AM",
            "End Time": "08:50 AM",
            "Course Code": "CSE 3101",
            "Course Title": "Theory of Computation",
            "Course Type": "Theory",
            "Teacher": "Dr. M. M. A. Hashem",
            "Room": "Room 301",
            "Department": "CSE",
            "Semester": "3-1",
            "Section": "A",
        },
        {
            "Day": "Sunday",
            "Start Time": "08:50 AM",
            "End Time": "09:40 AM",
            "Course Code": "CSE 3103",
            "Course Title": "Microprocessors and Microcontrollers",
            "Course Type": "Theory",
            "Teacher": "Dr. K. M. Azharul Hasan",
            "Room": "Room 301",
            "Department": "CSE",
            "Semester": "3-1",
            "Section": "A",
        },
        {
            "Day": "Monday",
            "Start Time": "09:40 AM",
            "End Time": "12:10 PM",
            "Course Code": "CSE 3104",
            "Course Title": "Microprocessors Lab",
            "Course Type": "Lab",
            "Teacher": "Dr. Kazi Md. Rokibul Alam",
            "Room": "Lab 2",
            "Department": "CSE",
            "Semester": "3-1",
            "Section": "A",
        },
    ]
    df = pd.DataFrame(sample_data)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=class_routine_template.csv"},
    )


@router.post("/admin/routine/bulk-upload")
async def bulk_upload_routine(
    file: UploadFile = File(...),
    default_department: str | None = None,
    default_semester: str | None = None,
    default_section: str | None = "A",
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
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

    # Standardize column headers
    cols_map = {}
    for col in df.columns:
        clean = str(col).strip().lower().replace("_", " ").replace("-", " ")
        if "day" in clean or "weekday" in clean:
            cols_map[col] = "day"
        elif "start" in clean or "from" in clean:
            cols_map[col] = "start_time"
        elif "end" in clean or "to" in clean:
            cols_map[col] = "end_time"
        elif "code" in clean or "course code" in clean:
            cols_map[col] = "course_code"
        elif "title" in clean or "course name" in clean:
            cols_map[col] = "course_title"
        elif "type" in clean:
            cols_map[col] = "course_type"
        elif "teacher" in clean or "faculty" in clean or "instructor" in clean:
            cols_map[col] = "teacher_name"
        elif "room" in clean or "lab" in clean:
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
    skipped = 0
    skipped_items = []

    for index, row in df.iterrows():
        row_dict = row.to_dict()
        day = _normalize_day(str(row_dict.get("day", "")))
        start_t = str(row_dict.get("start_time", "")).strip()
        end_t = str(row_dict.get("end_time", "")).strip()
        c_code = str(row_dict.get("course_code", "")).strip().upper()
        dept = str(row_dict.get("department", default_department or "")).strip().upper()
        sem = str(row_dict.get("semester", default_semester or "")).strip()
        sec = str(row_dict.get("section", default_section or "A")).strip().upper() or "A"
        c_title = str(row_dict.get("course_title", "")).strip()
        c_type = str(row_dict.get("course_type", "Theory")).strip() or "Theory"
        teacher = str(row_dict.get("teacher_name", "")).strip()
        room = str(row_dict.get("room", "")).strip()
        session_val = str(row_dict.get("session", "2025-2026")).strip() or "2025-2026"

        if not day or not start_t or not c_code:
            skipped += 1
            skipped_items.append({"row": index + 2, "reason": "Missing required fields (Day, Start Time, or Course Code)"})
            continue

        if not dept:
            dept = "CSE"
        if not sem:
            sem = "3-1"

        # Try to resolve title if missing
        if not c_title:
            matched_c = db.scalar(select(Course).where(Course.code == c_code))
            if matched_c:
                c_title = matched_c.title
                if not teacher and matched_c.teacher_id:
                    t_u = db.get(User, matched_c.teacher_id)
                    if t_u:
                        teacher = t_u.name

        routine = ClassRoutine(
            department=dept,
            semester=sem,
            section=sec,
            day=day,
            start_time=start_t,
            end_time=end_t or start_t,
            course_code=c_code,
            course_title=c_title or None,
            course_type=c_type,
            teacher_name=teacher or None,
            room=room or None,
            session=session_val,
        )
        db.add(routine)
        added += 1

    db.commit()
    return {
        "detail": "Bulk upload completed.",
        "added": added,
        "skipped": skipped,
        "total": len(df),
        "skipped_items": skipped_items,
    }
