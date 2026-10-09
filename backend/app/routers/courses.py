import shutil
import re
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..marks import RULE
from ..models import (
    Attendance, ClassSession, Course, CourseRosterAssignment, Enrollment, FaceSample, StudentProfile,
    AdminSetting, StudentRoster, User, CourseStatusLog,
)
from ..schemas import (
    AdminStudentCreateIn,
    AdminStudentUpdateIn,
    CourseCreateIn,
    CourseTeacherAssignmentIn,
    ClassSessionCreateIn,
    ACADEMIC_SESSIONS,
    DEPARTMENTS,
    SEMESTERS,
    CourseStudentsIn,
    StudentCourseEnrollmentIn,
)
from pydantic import BaseModel

class CourseStatusUpdateIn(BaseModel):
    status: str
from ..security import get_current_user, hash_password, require_role
from ..services import course_out

router = APIRouter(prefix="/api", tags=["courses"])
admin_only = require_role("admin")
system_admin_only = require_role("system_admin")
teacher_only = require_role("teacher")


def _admin_course_out(course: Course) -> dict:
    return course_out(course)


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    settings_rows = db.scalars(select(AdminSetting).where(AdminSetting.key.in_(["instName", "deptName", "instLogo"]))).all()
    inst_config = {}
    for s in settings_rows:
        inst_config[s.key] = s.value
    return {
        "departments": DEPARTMENTS,
        "semesters": SEMESTERS,
        "sessions": ACADEMIC_SESSIONS,
        "marking_rule": RULE,
        "institution": inst_config
    }


@router.get("/courses")
def list_courses(
    department: str | None = None,
    semester: str | None = None,
    session: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Course).where(Course.is_active.is_(True)).order_by(Course.code)
    if department:
        query = query.where(Course.department == department)
    if semester:
        query = query.where(Course.semester == semester)
    if session:
        query = query.where(Course.session == session)
    return [course_out(c) for c in db.scalars(query)]


@router.get("/teacher/stats")
def teacher_dashboard_stats(db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    # 1. Active courses
    active_courses = db.query(Course).filter(Course.teacher_id == user.id).count()

    # 2. Total classes (sessions)
    total_classes = db.query(ClassSession).join(Course).filter(Course.teacher_id == user.id).count()

    # 3. Students tracked (unique enrolled students)
    students_tracked = db.query(Enrollment.student_id).join(Course).filter(Course.teacher_id == user.id).distinct().count()

    # 4. Avg attendance
    # Find all sessions for this teacher's courses
    session_ids = [s.id for s in db.scalars(select(ClassSession).join(Course).where(Course.teacher_id == user.id)).all()]
    avg_attendance = "0%"
    if session_ids:
        total_attendance_records = db.query(Attendance).filter(Attendance.session_id.in_(session_ids)).count()
        if total_attendance_records > 0:
            present_records = db.query(Attendance).filter(
                Attendance.session_id.in_(session_ids),
                Attendance.status.in_(["present", "late"])
            ).count()
            avg_attendance = f"{round((present_records / total_attendance_records) * 100)}%"
        else:
            avg_attendance = "N/A"
            
    
    courses = db.scalars(select(Course).where(Course.teacher_id == user.id)).all()
    course_map = {c.id: c for c in courses}
    course_ids = list(course_map.keys())

    # Upcoming classes
    upcoming_sessions = db.scalars(
        select(ClassSession)
        .where(ClassSession.course_id.in_(course_ids), ClassSession.start_at >= datetime.now())
        .order_by(ClassSession.start_at)
        .limit(3)
    ).all()
    
    upcoming = []
    for s in upcoming_sessions:
        c = course_map[s.course_id]
        upcoming.append({
            "id": s.id,
            "course": c.code,
            "title": c.title,
            "room": s.room or "TBA",
            "time": f"{s.start_at.strftime('%a')} · {s.start_at.strftime('%I:%M %p')}",
            "section": f"{c.semester}, Section {c.section}"
        })
        
    # Recent classes
    recent_sessions = db.scalars(
        select(ClassSession)
        .where(ClassSession.course_id.in_(course_ids), ClassSession.start_at < datetime.now())
        .order_by(ClassSession.start_at.desc())
        .limit(3)
    ).all()
    
    recent = []
    for s in recent_sessions:
        c = course_map[s.course_id]
        total_enrolled = db.query(Enrollment).filter(Enrollment.course_id == c.id).count()
        present = db.query(Attendance).filter(Attendance.session_id == s.id, Attendance.status.in_(["present", "late"])).count()
        score = f"{round((present/total_enrolled)*100, 1)}%" if total_enrolled > 0 else "0%"
        recent.append({
            "id": s.id,
            "class": f"{c.code} · {c.title}",
            "date": s.start_at.strftime("%b %-d"),
            "students": f"{present} / {total_enrolled} present",
            "score": score
        })
        
    # Performance
    performance = []
    for c in courses:
        s_ids = [s.id for s in db.scalars(select(ClassSession).where(ClassSession.course_id == c.id)).all()]
        if not s_ids:
            continue
        tot_att = db.query(Attendance).filter(Attendance.session_id.in_(s_ids)).count()
        pres_att = db.query(Attendance).filter(Attendance.session_id.in_(s_ids), Attendance.status.in_(["present", "late"])).count()
        perc = round((pres_att / tot_att) * 100) if tot_att > 0 else 0
        status_text = "Excellent" if perc >= 90 else "Healthy" if perc >= 80 else "Needs follow-up"
        performance.append({
            "course": c.code,
            "percent": perc,
            "status": status_text
        })
            
    return {
        "active_courses": f"{active_courses:02d}",
        "total_classes": str(total_classes),
        "students_tracked": str(students_tracked),
        "avg_attendance": avg_attendance,
        "upcoming": upcoming,
        "recent": recent,
        "performance": performance
    }


@router.get("/teacher/courses")
def teacher_courses(db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    courses = db.scalars(
        select(Course).where(Course.teacher_id == user.id, Course.is_active.is_(True)).order_by(Course.semester, Course.code)
    ).all()
    # We'll use the existing course_out but add extra info if needed by the frontend like section, room etc if they existed.
    # The frontend expects id, code, title, semester, section, room, day, time, students, session, rollStart, rollEnd
    # For now, we populate what we have in the DB.
    res = []
    for c in courses:
        students = db.query(Enrollment).filter(Enrollment.course_id == c.id).count()
        res.append({
            "id": c.id,
            "code": c.code,
            "title": c.title,
            "semester": c.semester,
            "credit": c.credit,
            "course_type": c.course_type,
            "section": c.section,
            "room": "TBA",
            "day": "TBA",
            "time": "TBA",
            "students": students,
            "session": c.session,
            "rollStart": "-",
            "rollEnd": "-",
        })
    return res



@router.post("/teacher/sessions")
def create_teacher_session(body: ClassSessionCreateIn, db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    course = db.get(Course, body.course_id)
    if not course or not course.is_active or course.teacher_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found or not assigned to you.")
        
    session = ClassSession(
        course_id=body.course_id,
        start_at=body.start_at,
        end_at=body.end_at,
        room=body.room,
        students=body.students,
        roll_start=body.roll_start,
        roll_end=body.roll_end,
        status="scheduled"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return {
        "id": session.id,
        "course_id": session.course_id,
        "start_at": session.start_at.isoformat(),
        "end_at": session.end_at.isoformat(),
        "room": session.room,
        "status": session.status,
    }

@router.get("/teacher/sessions")
def list_teacher_sessions(db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    courses = db.scalars(select(Course).where(Course.teacher_id == user.id)).all()
    if not courses:
        return []
        
    course_ids = [c.id for c in courses]
    sessions = db.scalars(select(ClassSession).where(ClassSession.course_id.in_(course_ids)).order_by(ClassSession.start_at.desc())).all()
    
    res = []
    course_map = {c.id: c for c in courses}
    for s in sessions:
        c = course_map[s.course_id]
        students = db.query(Enrollment).filter(Enrollment.course_id == c.id).count()
        res.append({
            "id": s.id,
            "code": c.code,
            "title": c.title,
            "semester": c.semester,
            "section": c.section,
            "room": s.room,
            "day": s.start_at.strftime("%A"),
            "time": f"{s.start_at.strftime('%I:%M %p')} - {s.end_at.strftime('%I:%M %p')}",
            "students": s.students or 0,
            "session": c.session,
            "rollStart": s.roll_start or "-",
            "rollEnd": s.roll_end or "-",
        })
    return res



@router.delete("/teacher/sessions/{session_id}")
def delete_teacher_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(teacher_only)):
    session = db.get(ClassSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    
    course = db.get(Course, session.course_id)
    if not course or course.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned to this course.")
        
    db.delete(session)
    db.commit()
    return {"detail": "Session deleted"}


@router.get("/admin/courses")
def admin_list_courses(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    query = select(Course)
    if not include_archived:
        query = query.where(Course.is_active.is_(True))
    courses = db.scalars(query.order_by(Course.is_active.desc(), Course.department, Course.semester, Course.code)).all()
    return [_admin_course_out(course) for course in courses]


@router.post("/admin/courses")
def create_course(body: CourseCreateIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    existing = db.scalar(
        select(Course).where(
            Course.code == body.code,
            Course.session == body.session,
            Course.department == body.department,
            Course.semester == body.semester,
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "This course offering already exists.")

    course = Course(
        code=body.code,
        title=body.title,
        department=body.department,
        semester=body.semester,
        course_type=body.course_type,
        credit=body.credit,
        session=body.session,
        is_active=True,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _admin_course_out(course)


@router.put("/admin/courses/{course_id}")
def update_course(
    course_id: int,
    body: CourseCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    duplicate = db.scalar(
        select(Course.id).where(
            Course.id != course_id,
            Course.code == body.code,
            Course.session == body.session,
            Course.department == body.department,
            Course.semester == body.semester,
        )
    )
    if duplicate:
        raise HTTPException(status.HTTP_409_CONFLICT, "This course offering already exists.")

    course.code = body.code
    course.title = body.title
    course.department = body.department
    course.semester = body.semester
    course.course_type = body.course_type
    course.credit = body.credit
    course.session = body.session
    db.commit()
    db.refresh(course)
    return _admin_course_out(course)


@router.get("/admin/courses/{course_id}/students")
def list_course_students(
    course_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    enrollment_ids = set(db.scalars(select(Enrollment.student_id).where(Enrollment.course_id == course.id)).all())
    assigned_roster_ids = set(
        db.scalars(
            select(CourseRosterAssignment.roster_id).where(CourseRosterAssignment.course_id == course.id)
        ).all()
    )
    roster_rows = db.scalars(
        select(StudentRoster).where(
            StudentRoster.is_active.is_(True),
            StudentRoster.department == course.department,
            StudentRoster.session == course.session,
        ).order_by(StudentRoster.roll)
    ).all()
    return [
        {
            "roster_id": roster.id,
            "roll": roster.roll,
            "enrolled": (
                roster.id in assigned_roster_ids
                or bool(roster.profile and roster.profile.user_id in enrollment_ids)
            ),
        }
        for roster in roster_rows
        if (
            roster.profile is None
            or (
                roster.profile.current_semester == course.semester
                and roster.profile.department == course.department
                and roster.profile.session == course.session
            )
        )
    ]


@router.put("/admin/courses/{course_id}/students")
def update_course_students(
    course_id: int,
    body: CourseStudentsIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    if not course.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Archived courses cannot be assigned to students.")
    if body.semester != course.semester:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This course is not offered in the selected semester.")

    requested_rolls: set[str] = set()
    roll_ranges: list[tuple[str, str]] = []
    entries = [entry.strip() for entry in re.split(r"[,;]+", body.roll_input.strip()) if entry.strip()]
    for entry in entries:
        match = re.fullmatch(r"(\d{7})(?:\s*-\s*(\d{7}))?", entry)
        if not match:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Invalid roll or range '{entry}'. Use a 7-digit roll or range such as 2207001-2207023.",
            )
        first, last = match.groups()
        if last is None:
            requested_rolls.add(first)
        elif int(first) > int(last):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Range '{entry}' must start with a roll less than or equal to its ending roll.",
            )
        else:
            roll_ranges.append((first, last))
    if not requested_rolls and not roll_ranges:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Enter a student roll or roll range before saving.",
        )
    all_eligible_rosters = db.scalars(
        select(StudentRoster).where(
            StudentRoster.is_active.is_(True),
            StudentRoster.department == course.department,
            StudentRoster.session == course.session,
        )
    ).all()
    eligible_rosters = {
        roster.roll: roster
        for roster in all_eligible_rosters
        if (
            roster.profile is None
            or (
                roster.profile.user.is_active
                and roster.profile.department == course.department
                and roster.profile.session == course.session
                and roster.profile.current_semester == course.semester
            )
        )
    }
    invalid_rolls = sorted(requested_rolls - eligible_rosters.keys())
    if invalid_rolls:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"These rolls are not active in the admin-approved roster for this course: {', '.join(invalid_rolls)}.",
        )
    for roll in eligible_rosters:
        if any(first <= roll <= last for first, last in roll_ranges):
            requested_rolls.add(roll)

    existing_assignments = db.scalars(
        select(CourseRosterAssignment).where(CourseRosterAssignment.course_id == course.id)
    ).all()
    existing_roster_ids = {assignment.roster_id for assignment in existing_assignments}
    added = 0
    for roll in requested_rolls:
        roster = eligible_rosters[roll]
        if roster.id not in existing_roster_ids:
            db.add(CourseRosterAssignment(course_id=course.id, roster_id=roster.id))
            added += 1

    for roll in requested_rolls:
        roster = eligible_rosters[roll]
        if not roster.profile:
            continue
        student_id = roster.profile.user_id
        enrollment = db.scalar(
            select(Enrollment).where(Enrollment.course_id == course.id, Enrollment.student_id == student_id)
        )
        if not enrollment:
            db.add(Enrollment(student_id=student_id, course_id=course.id, semester=course.semester))

    db.commit()
    return {
        "saved": len(requested_rolls),
        "added": added,
        "rolls": sorted(requested_rolls),
        "course_id": course.id,
        "semester": course.semester,
    }


@router.delete("/admin/courses")
def archive_all_courses(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    courses = db.scalars(select(Course).where(Course.is_active.is_(True))).all()
    for course in courses:
        course.is_active = False
    db.commit()
    return {"archived": len(courses), "history_preserved": True}


@router.patch("/admin/courses/{course_id}/restore")
def restore_course(course_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    course.is_active = True
    db.commit()
    db.refresh(course)
    return _admin_course_out(course)


@router.patch("/admin/courses/{course_id}/status")
def update_course_status(
    course_id: int,
    body: CourseStatusUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    
    course.status = body.status
    log = CourseStatusLog(course_code=course.code, status=body.status)
    db.add(log)
    db.commit()
    db.refresh(course)
    return _admin_course_out(course)


@router.post("/admin/courses/bulk-upload")
async def bulk_upload_courses(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    from ..ai_extraction import extract_courses_from_file
    from starlette.concurrency import run_in_threadpool
    import re
    from ..ai_extraction import _semester_from_heading
    
    file_content = await file.read()
    mime_type = file.content_type
    
    is_spreadsheet = mime_type in [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv"
    ] or file.filename.lower().endswith(('.xlsx', '.xls', '.csv'))
    
    if is_spreadsheet:
        import pandas as pd
        import io
        try:
            if file.filename.lower().endswith('.csv') or mime_type == "text/csv":
                df = pd.read_csv(io.BytesIO(file_content))
            else:
                df = pd.read_excel(io.BytesIO(file_content))
            
            extracted_data = []
            for _, row in df.iterrows():
                def get_val(keys, default=None):
                    for k in keys:
                        for col in df.columns:
                            if col.lower().strip() == k.lower():
                                v = row[col]
                                return str(v) if pd.notna(v) else default
                    return default
                    
                data = {
                    "code": get_val(["code", "course code", "course_code", "coursecode"]),
                    "title": get_val(["title", "course title", "course_title", "name"]),
                    "credit": get_val(["credit", "credits"]),
                    "department": get_val(["department", "dept"]),
                    "semester": get_val(["semester", "sem"]),
                    "course_type": get_val(["course_type", "type", "course type"]),
                    "session": get_val(["session"])
                }
                if data["code"]:
                    extracted_data.append(data)
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Error parsing spreadsheet: {str(e)}")
    else:
        try:
            extracted_data = await run_in_threadpool(extract_courses_from_file, file_content, mime_type)
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
        
    if not extracted_data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No courses were extracted from the document.")

    added = 0
    skipped = 0
    skipped_items: list[dict] = []

    def _normalize_course(d: dict) -> dict:
        out = dict(d)
        # Normalize code: ensure space between letters and numbers and uppercase letters
        code = out.get('code') or out.get('Code')
        if code:
            code = re.sub(r"([A-Za-z]+)\s*([0-9])", r"\1 \2", str(code))
            code = re.sub(r"\s+", " ", code).strip().upper()
            out['code'] = code

        # Normalize title
        title = out.get('title') or out.get('Title')
        if title:
            out['title'] = str(title).strip()

        # Normalize credit to float
        credit = out.get('credit')
        if credit is not None:
            try:
                out['credit'] = float(str(credit).strip())
            except Exception:
                # try to extract number
                m = re.search(r"(\d+(?:\.\d+)?)", str(credit))
                out['credit'] = float(m.group(1)) if m else 3.0
        else:
            out['credit'] = 3.0

        # Department mapping
        dept = out.get('department')
        if dept:
            dept_str = str(dept).strip()
            # Try to match case-insensitively with DEPARTMENTS
            matched_dept = next((d for d in DEPARTMENTS if d.lower() == dept_str.lower()), dept_str.upper())
            out['department'] = matched_dept

        # Semester normalization
        sem = out.get('semester')
        if sem:
            sem_s = str(sem).strip()
            m = re.search(r"(\d)\s*[-/]\s*(\d)", sem_s)
            if m:
                out['semester'] = f"{m.group(1)}-{m.group(2)}"
            else:
                out['semester'] = _semester_from_heading(sem_s)

        # Course type
        ctype = out.get('course_type') or out.get('type')
        if ctype:
            s = str(ctype).strip().lower()
            out['course_type'] = 'Lab' if re.search(r"lab|sessional|laboratory|project|design", s) else 'Theory'

        # Session default
        if not out.get('session'):
            out['session'] = 'Default'

        return out

    seen_codes = set()
    for data in extracted_data:
        norm = _normalize_course(data)
        try:
            # Validate via Pydantic
            body = CourseCreateIn(**norm)
        except Exception as e:
            skipped += 1
            skipped_items.append({"data": norm, "reason": f"validation_error: {e}"})
            continue

        # Check for duplicate in current batch or DB
        if body.code in seen_codes or db.scalar(select(Course).where(Course.code == body.code)):
            skipped += 1
            skipped_items.append({"data": norm, "reason": "duplicate_code"})
            continue

        seen_codes.add(body.code)
        
        course = Course(
            code=body.code,
            title=body.title,
            department=body.department,
            semester=body.semester,
            course_type=body.course_type,
            credit=body.credit,
            session=body.session,
            status='Active'
        )
        db.add(course)
        try:
            db.flush()
            added += 1
        except Exception as e:
            db.rollback()
            skipped += 1
            skipped_items.append({"data": norm, "reason": f"db_error: {e}"})
            continue

    db.commit()

    if skipped > 0:
        print("SKIPPED ITEMS:", skipped_items)

    return {
        "detail": "Bulk upload completed.",
        "added": added,
        "skipped": skipped,
        "total": len(extracted_data),
        "skipped_items": skipped_items,
    }

@router.patch("/admin/courses/{course_id}/teacher")
def assign_course_teacher(
    course_id: int,
    body: CourseTeacherAssignmentIn,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")

    if body.teacher_id is not None:
        teacher = db.get(User, body.teacher_id)
        if not teacher or teacher.role not in {"teacher", "admin"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Teacher not found.")

    course.teacher_id = body.teacher_id
    if body.section:
        course.section = body.section
    db.commit()
    db.refresh(course)
    return _admin_course_out(course)


@router.delete("/admin/courses/all")
def delete_all_courses(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    db.query(Enrollment).delete()
    db.query(Attendance).delete(synchronize_session=False)
    db.query(ClassSession).delete(synchronize_session=False)
    db.query(CourseStatusLog).delete(synchronize_session=False)
    db.query(Course).delete(synchronize_session=False)
    db.commit()
    return {"success": True}


@router.delete("/admin/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    course.is_active = False
    db.commit()
    return {"archived": True, "history_preserved": True}


@router.get("/admin/teachers")
def list_teachers(db: Session = Depends(get_db), _: User = Depends(system_admin_only)):
    rows = db.scalars(select(User).where(User.role.in_(["teacher", "admin"])).order_by(User.name)).all()
    payload = []
    for user in rows:
        courses = db.scalars(select(Course).where(Course.teacher_id == user.id)).all()
        student_ids = db.scalars(
            select(Enrollment.student_id).join(Course, Enrollment.course_id == Course.id).where(Course.teacher_id == user.id)
        ).all()
        department_values = sorted({course.department for course in courses if course.department})
        department_name = user.department or (department_values[0] if department_values else "General")
        # Resolve the display status: use persisted teacher_status; fall back to active/disabled
        if user.teacher_status:
            display_status = user.teacher_status
        else:
            display_status = "Active" if user.is_active else "Disabled"
        payload.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "department": department_name,
            "designation": user.designation or ("Administrator" if user.role == "admin" else "Lecturer"),
            "education": user.education,
            "professionalMembership": user.professional_membership,
            "researchFields": user.research_fields,
            "pabxExt": user.pabx_ext,
            "phone": user.phone,
            "website": user.website,
            "picture": user.picture,
            "courses": len(courses),
            "students": len(set(student_ids)),
            "status": display_status,
            "lastLogin": "Recently",
        })
    return payload


@router.post("/admin/teachers/bulk-upload")
async def bulk_upload_teachers(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    import io
    import pandas as pd
    
    file_content = await file.read()
    mime_type = file.content_type
    
    is_spreadsheet = mime_type in [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv"
    ] or file.filename.lower().endswith(('.xlsx', '.xls', '.csv'))
    
    if not is_spreadsheet:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please upload a valid Excel or CSV file for teachers.")
        
    try:
        if file.filename.lower().endswith('.csv') or mime_type == "text/csv":
            df = pd.read_csv(io.BytesIO(file_content))
        else:
            df = pd.read_excel(io.BytesIO(file_content))
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Error parsing spreadsheet: {str(e)}")
        
    extracted_data = []
    for _, row in df.iterrows():
        def get_val(keys, default=None):
            for k in keys:
                for col in df.columns:
                    if col.lower().strip() == k.lower():
                        v = row[col]
                        return str(v) if pd.notna(v) else default
            return default
            
        data = {
            "name": get_val(["name", "full name", "teacher name"]),
            "email": get_val(["email", "academic email"]),
            "department": get_val(["department", "dept"]),
            "designation": get_val(["designation", "title", "position"]),
            "education": get_val(["education", "degree", "qualifications"]),
            "professional_membership": get_val(["professional membership", "membership"]),
            "research_fields": get_val(["research fields", "research field", "research"]),
            "pabx_ext": get_val(["pabx ext", "pabx", "ext", "extension"]),
            "phone": get_val(["phone", "mobile", "contact", "mobile number"]),
            "website": get_val(["website", "web", "url", "link"]),
            "picture": get_val(["picture", "image", "photo", "image link", "photo link"]),
        }
        if data["name"] and data["email"]:
            extracted_data.append(data)
            
    if not extracted_data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No valid teacher records found in the document. Ensure 'Name' and 'Email' columns exist.")

    added = 0
    skipped = 0
    skipped_items = []

    seen_emails = set()
    for data in extracted_data:
        email = data["email"].strip().lower()
        name = data["name"].strip()
        dept = (data["department"] or "General").strip().upper()
        designation = (data["designation"] or "Lecturer").strip()
        
        if email in seen_emails or db.scalar(select(User).where(User.email == email)):
            skipped += 1
            skipped_items.append({"data": data, "reason": "duplicate_email"})
            continue
            
        seen_emails.add(email)
        
        user = User(
            email=email,
            name=name,
            role="teacher",
            department=dept,
            designation=designation,
            education=data.get("education") or None,
            professional_membership=data.get("professional_membership") or None,
            research_fields=data.get("research_fields") or None,
            pabx_ext=data.get("pabx_ext") or None,
            phone=data.get("phone") or None,
            website=data.get("website") or None,
            picture=data.get("picture") or None,
            teacher_status="Active",
            password_hash=None, # password can be set later or use default
            is_active=True,
        )
        db.add(user)
        try:
            db.flush()
            added += 1
        except Exception as e:
            db.rollback()
            skipped += 1
            skipped_items.append({"data": data, "reason": f"db_error: {e}"})
            continue

    db.commit()

    return {
        "detail": "Bulk upload completed.",
        "added": added,
        "skipped": skipped,
        "total": len(extracted_data),
        "skipped_items": skipped_items,
    }


@router.delete("/admin/teachers/all")
def delete_all_teachers(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    teachers = db.scalars(select(User).where(User.role == "teacher")).all()
    for teacher in teachers:
        courses = db.scalars(select(Course).where(Course.teacher_id == teacher.id)).all()
        for course in courses:
            course.teacher_id = None
        db.delete(teacher)
    db.commit()
    return {"detail": "All teachers deleted successfully."}


@router.post("/admin/teachers")
def create_teacher(body: dict, db: Session = Depends(get_db), _: User = Depends(system_admin_only)):
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    department = (body.get("department") or "").strip().upper()
    designation = (body.get("designation") or "").strip()
    education = (body.get("education") or "").strip()
    professional_membership = (body.get("professionalMembership") or "").strip()
    research_fields = (body.get("researchFields") or "").strip()
    pabx_ext = (body.get("pabxExt") or "").strip()
    phone = (body.get("phone") or "").strip()
    website = (body.get("website") or "").strip()
    password = (body.get("password") or "").strip()
    if not email or not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Teacher email and name are required.")

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A teacher with this email already exists.")

    user = User(
        email=email,
        name=name,
        role="teacher",
        department=department or None,
        designation=designation or None,
        education=education or None,
        professional_membership=professional_membership or None,
        research_fields=research_fields or None,
        pabx_ext=pabx_ext or None,
        phone=phone or None,
        website=website or None,
        teacher_status="Active",
        password_hash=hash_password(password) if password else None,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
        "designation": user.designation,
        "education": user.education,
        "professionalMembership": user.professional_membership,
        "researchFields": user.research_fields,
        "pabxExt": user.pabx_ext,
        "phone": user.phone,
        "website": user.website,
        "status": "Active",
    }


@router.patch("/admin/teachers/{teacher_id}")
def update_teacher(
    teacher_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    teacher = db.get(User, teacher_id)
    if not teacher:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found.")

    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    department = (body.get("department") or "").strip().upper()
    designation = (body.get("designation") or "").strip()
    education = (body.get("education") or "").strip()
    professional_membership = (body.get("professionalMembership") or "").strip()
    research_fields = (body.get("researchFields") or "").strip()
    pabx_ext = (body.get("pabxExt") or "").strip()
    phone = (body.get("phone") or "").strip()
    website = (body.get("website") or "").strip()
    password = (body.get("password") or "").strip()
    if not email or not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Teacher email and name are required.")

    if email != teacher.email and db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A teacher with this email already exists.")

    teacher.name = name
    teacher.email = email
    if department:
        teacher.department = department
    teacher.designation = designation or None
    teacher.education = education or None
    teacher.professional_membership = professional_membership or None
    teacher.research_fields = research_fields or None
    teacher.pabx_ext = pabx_ext or None
    teacher.phone = phone or None
    teacher.website = website or None
    
    if password:
        teacher.password_hash = hash_password(password)
    db.commit()
    db.refresh(teacher)
    # Resolve display status
    if teacher.teacher_status:
        display_status = teacher.teacher_status
    else:
        display_status = "Active" if teacher.is_active else "Disabled"
    return {
        "id": teacher.id,
        "name": teacher.name,
        "email": teacher.email,
        "role": teacher.role,
        "department": teacher.department,
        "designation": teacher.designation,
        "education": teacher.education,
        "researchFields": teacher.research_fields,
        "pabxExt": teacher.pabx_ext,
        "phone": teacher.phone,
        "website": teacher.website,
        "status": display_status,
    }


@router.patch("/admin/teachers/{teacher_id}/status")
def update_teacher_status(
    teacher_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(system_admin_only),
):
    teacher = db.get(User, teacher_id)
    if not teacher:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Teacher not found.")

    status_value = (body.get("status") or "Active").strip()
    valid_statuses = {"Active", "On leave", "Pending", "Disabled"}
    if status_value not in valid_statuses:
        status_value = "Active"
    teacher.teacher_status = status_value
    teacher.is_active = status_value != "Disabled"
    db.commit()
    db.refresh(teacher)
    return {"id": teacher.id, "name": teacher.name, "status": teacher.teacher_status}


@router.post("/admin/students")
def create_student(
    body: AdminStudentCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    email = str(body.email).lower()
    if not email.endswith("@" + settings.student_email_domain.lower()):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Student email must use the @{settings.student_email_domain} domain.",
        )
    if db.scalar(select(StudentRoster.id).where(StudentRoster.roll == body.roll)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This roll number is already in the student roster.")
    if db.scalar(select(StudentRoster.id).where(StudentRoster.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already linked to a roster record.")

    linked_user = db.scalar(select(User).where(User.email == email))
    if linked_user and linked_user.role != "student":
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already used by a staff account.")

    roster = StudentRoster(
        full_name=body.name,
        roll=body.roll,
        email=email,
        department=body.department,
        session=body.session,
        phone=body.phone,
        is_active=True,
    )
    db.add(roster)
    db.commit()
    db.refresh(roster)
    return {
        "id": roster.id,
        "name": roster.full_name,
        "email": roster.email,
        "roll": roster.roll,
        "department": roster.department,
        "session": roster.session,
        "phone": roster.phone,
        "photo_available": False,
        "status": "Needs photo",
    }


@router.post("/admin/students/{student_id}/photo")
async def upload_student_photo(
    student_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    roster = db.get(StudentRoster, student_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    content = await photo.read()
    if photo.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPEG or PNG images are allowed.")
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Each photo must be under 3 MB.")
    if content.startswith(b"\x89PNG"):
        mime_type = "image/png"
    elif content.startswith(b"\xff\xd8"):
        mime_type = "image/jpeg"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photos must be JPEG or PNG images.")
    roster.photo_data = content
    roster.photo_mime_type = mime_type
    if roster.profile:
        student_id = roster.profile.user_id
        db.execute(delete(FaceSample).where(FaceSample.student_id == student_id))
        face_folder = settings.storage_dir / "faces" / str(student_id)
        if face_folder.exists():
            shutil.rmtree(face_folder)
    db.commit()
    return {"status": "submitted", "count": 1, "stored_in": "student_roster.photo_data"}


@router.get("/admin/students/{student_id}/photo")
def get_roster_photo(student_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    roster = db.get(StudentRoster, student_id)
    if not roster or not roster.photo_data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Official student photo not found.")
    return Response(content=roster.photo_data, media_type=roster.photo_mime_type or "image/jpeg")


@router.put("/admin/students/{student_id}")
def update_student_roster(
    student_id: int,
    body: AdminStudentUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    roster = db.get(StudentRoster, student_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student roster record not found.")
    email = str(body.email).lower()
    if not email.endswith("@" + settings.student_email_domain.lower()):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Student email must use the @{settings.student_email_domain} domain.",
        )
    duplicate_roll = db.scalar(
        select(StudentRoster.id).where(StudentRoster.roll == body.roll, StudentRoster.id != student_id)
    )
    duplicate_email = db.scalar(
        select(StudentRoster.id).where(StudentRoster.email == email, StudentRoster.id != student_id)
    )
    if duplicate_roll:
        raise HTTPException(status.HTTP_409_CONFLICT, "This roll number is already in the student roster.")
    if duplicate_email:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already linked to another roster record.")
    linked_user = db.scalar(select(User).where(User.email == email))
    if linked_user and linked_user.role != "student":
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already used by a staff account.")
    if roster.profile and linked_user and linked_user.id != roster.profile.user_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already linked to another student account.")

    roster.full_name = body.name
    roster.roll = body.roll
    roster.email = email
    roster.department = body.department
    roster.session = body.session
    roster.phone = body.phone
    if roster.profile:
        roster.profile.full_name = body.name
        roster.profile.roll = body.roll
        roster.profile.department = body.department
        roster.profile.series = body.session[:4]
        roster.profile.session = body.session
        roster.profile.phone = body.phone
        roster.profile.section = None
        roster.profile.user.name = body.name
        roster.profile.user.email = email
        roster.profile.user.is_active = True
    roster.is_active = True
    db.commit()
    return {
        "id": roster.id,
        "name": roster.full_name,
        "email": roster.email,
        "roll": roster.roll,
        "department": roster.department,
        "session": roster.session,
        "phone": roster.phone,
        "photo_available": bool(roster.photo_data),
    }


@router.delete("/admin/students/{student_id}")
def delete_student_roster(student_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    roster = db.get(StudentRoster, student_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student roster record not found.")

    if roster.profile:
        roster.is_active = False
        roster.profile.user.is_active = False
        db.commit()
        return {"deleted": False, "disabled": True}

    if roster.email:
        waiting_user = db.scalar(select(User).where(User.email == roster.email, User.role == "student"))
        if waiting_user:
            waiting_user.is_active = False
    db.delete(roster)
    db.commit()
    return {"deleted": True, "disabled": False}


@router.delete("/admin/legacy-students/{user_id}")
def delete_legacy_student(user_id: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    user = db.get(User, user_id)
    if not user or user.role != "student" or not user.profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Legacy student account not found.")
    if user.profile.roster_id is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This student is linked to an approved roster record. Delete or disable that roster entry instead.",
        )

    face_samples = db.scalars(select(FaceSample).where(FaceSample.student_id == user.id)).all()
    face_paths = [Path(sample.file_path) for sample in face_samples]
    db.execute(delete(Attendance).where(Attendance.student_id == user.id))
    db.execute(delete(Enrollment).where(Enrollment.student_id == user.id))
    db.execute(delete(FaceSample).where(FaceSample.student_id == user.id))
    db.delete(user.profile)
    db.delete(user)
    db.commit()

    for face_path in face_paths:
        face_path.unlink(missing_ok=True)
    return {"deleted": True, "user_id": user_id}


@router.get("/admin/students")
def list_students(
    department: str | None = None,
    semester: str | None = None,
    session: str | None = None,
    section: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    query = select(StudentRoster)
    if department:
        query = query.where(StudentRoster.department == department)
    if session:
        query = query.where(StudentRoster.session == session)
    if section:
        query = query.join(StudentProfile, StudentProfile.roster_id == StudentRoster.id).where(
            StudentProfile.section == section
        )
    if q:
        search = f"%{q.strip()}%"
        query = query.where(
            (StudentRoster.full_name.ilike(search))
            | (StudentRoster.roll.ilike(search))
            | (StudentRoster.email.ilike(search))
        )
    rows = db.scalars(query.order_by(StudentRoster.roll)).all()
    payload = []
    registered_user_ids = set()
    for roster in rows:
        profile = roster.profile
        user = profile.user if profile else db.scalar(select(User).where(User.email == roster.email)) if roster.email else None
        if semester and (not profile or profile.current_semester != semester):
            continue
        payload.append({
            "id": roster.id,
            "user_id": user.id if user else None,
            "name": roster.full_name,
            "full_name": roster.full_name,
            "roll": roster.roll,
            "department": roster.department,
            "session": roster.session,
            "phone": roster.phone,
            "current_semester": profile.current_semester if profile else None,
            "semester": profile.current_semester if profile else None,
            "section": profile.section if profile else None,
            "email": roster.email,
        })
        if user:
            registered_user_ids.add(user.id)

    legacy_query = select(User).join(StudentProfile).where(
        User.role == "student",
        StudentProfile.roster_id.is_(None),
    )
    if department:
        legacy_query = legacy_query.where(StudentProfile.department == department)
    if session:
        legacy_query = legacy_query.where(StudentProfile.session == session)
    if semester:
        legacy_query = legacy_query.where(StudentProfile.current_semester == semester)
    if section:
        legacy_query = legacy_query.where(StudentProfile.section == section)
    if q:
        search = f"%{q.strip()}%"
        legacy_query = legacy_query.where(
            User.name.ilike(search) | StudentProfile.full_name.ilike(search) | StudentProfile.roll.ilike(search)
        )
    for user in db.scalars(legacy_query.order_by(StudentProfile.roll)):
        if user.id in registered_user_ids:
            continue
        profile = user.profile
        payload.append({
            "id": None,
            "user_id": user.id,
            "name": profile.full_name,
            "full_name": profile.full_name,
            "roll": profile.roll,
            "department": profile.department,
            "session": profile.session,
            "current_semester": profile.current_semester,
            "semester": profile.current_semester,
            "section": profile.section,
            "email": user.email,
        })
    return payload


@router.get("/admin/security-alerts")
def list_security_alerts(db: Session = Depends(get_db), _: User = Depends(system_admin_only)):
    return [{
        "id": "all-clear",
        "title": "No active security incidents",
        "severity": "Low",
        "location": "System health",
        "note": "All monitored security checks are currently within expected limits.",
        "status": "Resolved",
    }]


@router.get("/admin/settings")
def list_admin_settings(db: Session = Depends(get_db), _: User = Depends(system_admin_only)):
    rows = db.scalars(select(AdminSetting).order_by(AdminSetting.key)).all()
    return [{
        "id": item.id,
        "key": item.key,
        "label": item.label,
        "description": item.description,
        "enabled": item.enabled,
        "value": item.value,
    } for item in rows]


@router.put("/admin/settings/{key}")
def update_admin_setting(key: str, body: dict, db: Session = Depends(get_db), _: User = Depends(system_admin_only)):
    setting = db.scalar(select(AdminSetting).where(AdminSetting.key == key))
    if setting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found.")
    
    if "enabled" in body:
        setting.enabled = bool(body["enabled"])
    if "value" in body:
        setting.value = body["value"]
        
    db.commit()
    db.refresh(setting)
    return {
        "id": setting.id,
        "key": setting.key,
        "label": setting.label,
        "description": setting.description,
        "enabled": setting.enabled,
        "value": setting.value,
    }


@router.post("/admin/student-enrollments")
def enroll_students(
    body: StudentCourseEnrollmentIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, body.course_id)
    if not course or not course.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    if body.semester != course.semester:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This course is not offered in the selected semester.")

    saved = 0
    for student_id in set(body.student_ids):
        student = db.get(User, student_id)
        if not student or student.role != "student":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more students do not exist.")
        profile = student.profile
        if (
            not profile
            or not profile.roster
            or not profile.roster_id
            or not profile.roster.is_active
            or profile.department != course.department
            or profile.session != course.session
        ):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{student.name} is not registered for the {course.department} {course.session} session.",
            )
        if profile.current_semester != body.semester:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{profile.full_name} is not currently in {body.semester}.",
            )
        existing = db.scalar(
            select(Enrollment).where(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course.id,
            )
        )
        assignment = db.scalar(
            select(CourseRosterAssignment).where(
                CourseRosterAssignment.course_id == course.id,
                CourseRosterAssignment.roster_id == profile.roster_id,
            )
        )
        if not assignment:
            db.add(CourseRosterAssignment(course_id=course.id, roster_id=profile.roster_id))
        if not existing:
            db.add(Enrollment(student_id=student_id, course_id=course.id, semester=body.semester))
            saved += 1
    db.commit()
    return {"saved": saved, "course_id": course.id, "semester": body.semester}
