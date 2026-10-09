import shutil
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..marks import RULE
from ..models import (
    Attendance, ClassSession, Course, Enrollment, FaceSample, StudentProfile,
    AdminSetting, User, CourseStatusLog,
)
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from ..schemas import (
    AdminStudentCreateIn,
    CourseCreateIn,
    CourseTeacherAssignmentIn,
    ClassSessionCreateIn,
    DEPARTMENTS,
    SEMESTERS,
    StudentCourseEnrollmentIn,
)
from pydantic import BaseModel

class CourseStatusUpdateIn(BaseModel):
    status: str
from ..security import get_current_user, hash_password, require_role
from ..services import course_out

router = APIRouter(prefix="/api", tags=["courses"])
admin_only = require_role("admin")
teacher_only = require_role("teacher", "admin")


def _attendance_percentage(db: Session, student_id: int) -> int:
    student_enrollments = db.scalars(select(Enrollment).where(Enrollment.student_id == student_id)).all()
    if not student_enrollments:
        return 0

    course_ids = [enrollment.course_id for enrollment in student_enrollments]
    if not course_ids:
        return 0

    sessions = db.scalars(select(ClassSession).where(ClassSession.course_id.in_(course_ids))).all()
    if not sessions:
        return 0

    session_ids = [session.id for session in sessions]
    total_sessions = len(session_ids)
    if total_sessions == 0:
        return 0

    present_count = db.scalar(
        select(Attendance.id).where(
            Attendance.student_id == student_id,
            Attendance.session_id.in_(session_ids),
            Attendance.status.in_(["present", "late"]),
        )
    )
    if present_count is None:
        return 0

    present_total = db.query(Attendance).filter(
        Attendance.student_id == student_id,
        Attendance.session_id.in_(session_ids),
        Attendance.status.in_(["present", "late"]),
    ).count()
    return min(100, max(0, round((present_total / total_sessions) * 100)))


def _student_risk(attendance: int) -> str:
    if attendance >= 85:
        return "Low"
    if attendance >= 70:
        return "Medium"
    return "High"


def _student_status(profile: StudentProfile | None) -> str:
    if not profile:
        return "Pending"
    if profile.face_status == "approved":
        return "Verified"
    if profile.face_status == "submitted":
        return "Review"
    return "Pending"


def _admin_course_out(db: Session, course: Course) -> dict:
    teacher = db.get(User, course.teacher_id) if course.teacher_id else None
    return {
        **course_out(course),
        "teacher_id": course.teacher_id,
        "teacher_name": teacher.name if teacher else None,
        "teacher_email": teacher.email if teacher else None,
    }


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    settings_rows = db.scalars(select(AdminSetting).where(AdminSetting.key.in_(["instName", "deptName", "instLogo"]))).all()
    inst_config = {}
    for s in settings_rows:
        inst_config[s.key] = s.value
        
    return {
        "departments": DEPARTMENTS,
        "semesters": SEMESTERS,
        "marking_rule": RULE,
        "institution": inst_config
    }


@router.get("/courses")
def list_courses(
    department: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Course).order_by(Course.code)
    if department:
        query = query.where(Course.department == department)
    if semester:
        query = query.where(Course.semester == semester)
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
    courses = db.scalars(select(Course).where(Course.teacher_id == user.id).order_by(Course.semester, Course.code)).all()
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
    if not course or course.teacher_id != user.id:
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
def admin_list_courses(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    courses = db.scalars(select(Course).order_by(Course.code)).all()
    return [_admin_course_out(db, course) for course in courses]


@router.post("/admin/courses")
def create_course(body: CourseCreateIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    if db.scalar(select(Course).where(Course.code == body.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A course with this code already exists.")

    course = Course(
        code=body.code,
        title=body.title,
        department=body.department,
        semester=body.semester,
        course_type=body.course_type,
        credit=body.credit,
        session=body.session,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _admin_course_out(db, course)


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
    return _admin_course_out(db, course)


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
    _: User = Depends(admin_only),
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
    return _admin_course_out(db, course)


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

    # Cascading deletes
    db.query(Enrollment).filter(Enrollment.course_id == course.id).delete()
    
    sessions = db.scalars(select(ClassSession).where(ClassSession.course_id == course.id)).all()
    session_ids = [s.id for s in sessions]
    if session_ids:
        db.query(Attendance).filter(Attendance.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(ClassSession).filter(ClassSession.course_id == course.id).delete(synchronize_session=False)
        
    db.delete(course)
    db.commit()
    return {"success": True}


@router.get("/admin/teachers")
def list_teachers(db: Session = Depends(get_db), _: User = Depends(admin_only)):
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
def create_teacher(body: dict, db: Session = Depends(get_db), _: User = Depends(admin_only)):
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
    _: User = Depends(admin_only),
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
    _: User = Depends(admin_only),
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
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "A student with this email already exists.")
    if db.scalar(select(StudentProfile).where(StudentProfile.roll == body.roll)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This roll number is already registered.")

    user = User(
        email=body.email.lower(),
        name=body.name,
        role="student",
        password_hash=None,
        is_active=True,
    )
    db.add(user)
    db.flush()

    start_year = body.session.split("-")[0]
    profile = StudentProfile(
        user_id=user.id,
        full_name=body.name,
        roll=body.roll,
        department=body.department,
        series=start_year,
        section="A",
        current_semester="1-1",
        face_status="none",
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "roll": profile.roll,
        "department": profile.department,
        "session": body.session,
        "status": "Pending",
    }


@router.post("/admin/students/{student_id}/photo")
async def upload_student_photo(
    student_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    user = db.get(User, student_id)
    if not user or user.role != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    content = await photo.read()
    if not photo.content_type or "image" not in photo.content_type.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only image files are allowed.")
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Each photo must be under 3 MB.")
    if not (content.startswith(b"\xff\xd8") or content.startswith(b"\x89PNG")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photos must be JPEG or PNG images.")

    folder = settings.storage_dir / "faces" / str(user.id)
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True, exist_ok=True)
    db.execute(delete(FaceSample).where(FaceSample.student_id == user.id))

    path = folder / "01.jpg"
    path.write_bytes(content)
    db.add(FaceSample(student_id=user.id, file_path=str(path)))

    if user.profile is not None:
        user.profile.face_status = "submitted"
    db.commit()
    return {"status": "submitted", "count": 1, "path": str(path)}


@router.get("/admin/students")
def list_students(
    department: str | None = None,
    semester: str | None = None,
    section: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    query = select(User).join(StudentProfile).where(User.role == "student")
    if department:
        query = query.where(StudentProfile.department == department)
    if semester:
        query = query.where(StudentProfile.current_semester == semester)
    if section:
        query = query.where(StudentProfile.section == section)
    if q:
        search = f"%{q.strip()}%"
        query = query.where(
            (User.name.ilike(search)) |
            (StudentProfile.full_name.ilike(search)) |
            (StudentProfile.roll.ilike(search))
        )
    rows = db.scalars(query.order_by(StudentProfile.roll)).all()
    payload = []
    for user in rows:
        profile = user.profile
        attendance = _attendance_percentage(db, user.id)
        status = _student_status(profile)
        payload.append({
            "id": user.id,
            "name": user.name,
            "full_name": profile.full_name if profile else user.name,
            "roll": profile.roll if profile else None,
            "department": profile.department if profile else None,
            "current_semester": profile.current_semester if profile else None,
            "semester": profile.current_semester if profile else None,
            "section": profile.section if profile else None,
            "email": user.email,
            "attendance": f"{attendance}%",
            "risk": _student_risk(attendance),
            "status": status,
        })
    return payload


@router.get("/admin/security-alerts")
def list_security_alerts(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    alerts = []

    pending_face = db.scalar(select(User.id).join(StudentProfile).where(User.role == "student").where(StudentProfile.face_status != "approved"))
    if pending_face is not None:
        pending_count = db.query(User).join(StudentProfile).filter(User.role == "student").filter(StudentProfile.face_status != "approved").count()
        alerts.append({
            "id": "face-verification",
            "title": "Face verification queue",
            "severity": "High" if pending_count >= 3 else "Medium",
            "location": "Student onboarding",
            "note": f"{pending_count} student profile(s) are waiting for approval before attendance can be accepted.",
            "status": "Open",
        })

    at_risk = db.scalars(select(User).where(User.role == "student")).all()
    risk_students = []
    for user in at_risk:
        attendance = _attendance_percentage(db, user.id)
        if attendance < 75:
            risk_students.append(f"{user.name} ({attendance}%)")
    if risk_students:
        alerts.append({
            "id": "attendance-risk",
            "title": "Low attendance exposure",
            "severity": "Medium",
            "location": "Academic monitoring",
            "note": ", ".join(risk_students[:3]) + (" and more" if len(risk_students) > 3 else "") + ".",
            "status": "Investigating",
        })

    if not alerts:
        alerts.append({
            "id": "all-clear",
            "title": "No active security incidents",
            "severity": "Low",
            "location": "System health",
            "note": "All monitored security checks are currently within expected limits.",
            "status": "Resolved",
        })
    return alerts


@router.get("/admin/settings")
def list_admin_settings(db: Session = Depends(get_db), _: User = Depends(admin_only)):
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
def update_admin_setting(key: str, body: dict, db: Session = Depends(get_db), _: User = Depends(admin_only)):
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


@router.patch("/admin/students/{student_id}/status")
def update_student_status(
    student_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    user = db.get(User, student_id)
    if not user or user.role != "student":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")

    profile = user.profile
    status_value = (body.get("status") or "Pending").strip()
    if profile is not None:
        if status_value == "Verified":
            profile.face_status = "approved"
        elif status_value == "Review":
            profile.face_status = "submitted"
        elif status_value == "Pending":
            profile.face_status = "none"
        elif status_value == "Suspended":
            user.is_active = False
    db.commit()
    return {"id": user.id, "status": status_value}


@router.post("/admin/student-enrollments")
def enroll_students(
    body: StudentCourseEnrollmentIn,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    course = db.get(Course, body.course_id)
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    if body.semester != course.semester:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This course is not offered in the selected semester.")

    saved = 0
    for student_id in set(body.student_ids):
        student = db.get(User, student_id)
        if not student or student.role != "student":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more students do not exist.")
        profile = student.profile
        if not profile or profile.department != course.department:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{student.name} is not eligible for {course.department} courses.",
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
        if not existing:
            db.add(Enrollment(student_id=student_id, course_id=course.id, semester=body.semester))
            saved += 1
    db.commit()
    return {"saved": saved, "course_id": course.id, "semester": body.semester}
