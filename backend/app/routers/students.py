"""Everything a logged-in student can do with their own data."""
from collections import defaultdict
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..marks import RULE, attendance_marks, attendance_percent
from ..models import (
    Attendance, ClassSession, Course, CourseRosterAssignment, Enrollment, FaceSample, StudentProfile,
    StudentRoster, User,
)
from ..schemas import ProfileIn
from ..security import require_role
from ..services import course_out, onboarding_status

router = APIRouter(prefix="/api/students/me", tags=["student"])
student_only = require_role("student")


def _profile_or_404(user: User) -> StudentProfile:
    if not user.profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complete your profile first.")
    return user.profile


def _profile_out(p: StudentProfile, user: User) -> dict:
    return {
        "email": user.email,
        "full_name": p.full_name,
        "roll": p.roll,
        "department": p.department,
        "series": p.series,
        "session": p.session,
        "current_semester": p.current_semester,
        "phone": p.phone,
    }


# ---------------------------------------------------------------- profile

@router.get("/profile")
def get_profile(user: User = Depends(student_only)):
    if not user.profile:
        return None
    return _profile_out(user.profile, user)


@router.put("/profile")
def save_profile(body: ProfileIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    roster = db.scalar(
        select(StudentRoster).where(
            StudentRoster.roll == body.roll,
            StudentRoster.session == body.session,
        )
    )
    if not roster or not roster.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Roll number and session do not match an active admin-approved student record.",
        )
    if not roster.photo_data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "The admin-approved roster record needs an official face photo before registration.",
        )
    if roster.department != body.department:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Department does not match the admin-approved student record.")
    if roster.email and roster.email.lower() != user.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This academic email does not match the admin-approved student record.")
    if body.series != roster.session[:4]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admission year does not match the approved session.")
    if user.profile and user.profile.roster_id not in {None, roster.id}:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is already linked to another student record.")
    if roster.profile and roster.profile.user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This student record has already been linked to another account.")
    offered = db.scalar(
        select(Course.id).where(
            Course.department == roster.department,
            Course.session == roster.session,
            Course.semester == body.current_semester,
            Course.is_active.is_(True),
        ).limit(1)
    )
    if offered is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This year-term is not offered for your approved department and session.",
        )

    profile = user.profile or StudentProfile(user_id=user.id)
    profile.roster_id = roster.id
    profile.full_name = roster.full_name
    profile.roll = roster.roll
    profile.department = roster.department
    profile.series = roster.session[:4]
    profile.session = roster.session
    profile.section = None
    profile.current_semester = body.current_semester
    profile.phone = roster.phone
    user.name = roster.full_name
    db.add(profile)
    assigned_courses = db.scalars(
        select(Course)
        .join(CourseRosterAssignment, CourseRosterAssignment.course_id == Course.id)
        .where(
            CourseRosterAssignment.roster_id == roster.id,
            Course.is_active.is_(True),
            Course.department == roster.department,
            Course.session == roster.session,
            Course.semester == body.current_semester,
        )
    ).all()
    for course in assigned_courses:
        existing_enrollment = db.scalar(
            select(Enrollment).where(Enrollment.student_id == user.id, Enrollment.course_id == course.id)
        )
        if not existing_enrollment:
            db.add(Enrollment(student_id=user.id, course_id=course.id, semester=course.semester))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This roll number is already registered to another account.")
    db.refresh(user)
    return {"profile": _profile_out(profile, user), "onboarding": onboarding_status(db, user)}


# ---------------------------------------------------------------- course selection

@router.get("/enrollments")
def list_enrollments(semester: str | None = None, user: User = Depends(student_only), db: Session = Depends(get_db)):
    profile = _profile_or_404(user)
    query = (
        select(Enrollment)
        .join(CourseRosterAssignment, CourseRosterAssignment.course_id == Enrollment.course_id)
        .where(
            Enrollment.student_id == user.id,
            CourseRosterAssignment.roster_id == profile.roster_id,
        )
    )
    if semester:
        query = query.where(Enrollment.semester == semester)
    grouped: dict[str, list] = defaultdict(list)
    for e in db.scalars(query):
        grouped[e.semester].append(course_out(e.course))
    return [
        {"semester": sem, "courses": sorted(courses, key=lambda c: c["code"])}
        for sem, courses in sorted(grouped.items(), reverse=True)
    ]


@router.put("/enrollments")
def save_enrollments(user: User = Depends(student_only)):
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Course assignments are managed by the student administrator.",
    )


# ---------------------------------------------------------------- dashboard & history

def _semester_data(db: Session, user: User, semester: str):
    profile = user.profile
    if not profile or not profile.roster_id:
        return {}, [], {}
    enrollments = db.scalars(
        select(Enrollment)
        .join(CourseRosterAssignment, CourseRosterAssignment.course_id == Enrollment.course_id)
        .where(
            Enrollment.student_id == user.id,
            Enrollment.semester == semester,
            CourseRosterAssignment.roster_id == profile.roster_id,
        )
    ).all()
    courses = {e.course_id: e.course for e in enrollments}
    # Classes held before the student enrolled do not count against them
    since = {e.course_id: datetime.combine(e.created_at.date(), time.min) for e in enrollments}
    sessions = [
        s for s in db.scalars(
            select(ClassSession)
            .where(ClassSession.course_id.in_(courses), ClassSession.status == "completed")
            .order_by(ClassSession.start_at)
        )
        if s.start_at >= since[s.course_id]
    ] if courses else []
    records = {
        a.session_id: a
        for a in db.scalars(
            select(Attendance).where(
                Attendance.student_id == user.id,
                Attendance.session_id.in_([s.id for s in sessions]),
            )
        )
    } if sessions else {}
    return courses, sessions, records


def _status_of(session: ClassSession, records: dict) -> str:
    record = records.get(session.id)
    return record.status if record else "absent"


@router.get("/dashboard")
def dashboard(semester: str | None = None, user: User = Depends(student_only), db: Session = Depends(get_db)):
    profile = _profile_or_404(user)
    semester = semester or profile.current_semester
    courses, sessions, records = _semester_data(db, user, semester)

    per_course = {cid: {"held": 0, "present": 0, "late": 0} for cid in courses}
    for s in sessions:
        stat = per_course[s.course_id]
        stat["held"] += 1
        st = _status_of(s, records)
        if st in ("present", "late"):
            stat[st] += 1

    course_rows = []
    for cid, course in sorted(courses.items(), key=lambda kv: kv[1].code):
        st = per_course[cid]
        attended = st["present"] + st["late"]
        pct = attendance_percent(attended, st["held"])
        course_rows.append({
            **course_out(course),
            "held": st["held"],
            "attended": attended,
            "present": st["present"],
            "late": st["late"],
            "absent": st["held"] - attended,
            "percent": pct,
            **attendance_marks(pct),
        })

    held_total = sum(r["held"] for r in course_rows)
    attended_total = sum(r["attended"] for r in course_rows)
    graded = [r for r in course_rows if r["grade"] != "no_classes"]

    # Weekly trend: attendance % of each week and the running (cumulative) %
    weeks: dict = defaultdict(lambda: [0, 0])  # week_start -> [attended, held]
    for s in sessions:
        week_start = (s.start_at - timedelta(days=s.start_at.weekday())).date()
        weeks[week_start][1] += 1
        if _status_of(s, records) != "absent":
            weeks[week_start][0] += 1
    trend, run_att, run_held = [], 0, 0
    for week_start in sorted(weeks):
        att, held = weeks[week_start]
        run_att, run_held = run_att + att, run_held + held
        trend.append({
            "week": week_start.isoformat(),
            "label": week_start.strftime("%d %b"),
            "weekly": attendance_percent(att, held),
            "cumulative": attendance_percent(run_att, run_held),
        })

    recent = [
        {
            "session_id": s.id,
            "course_code": s.course.code,
            "course_title": s.course.title,
            "start_at": s.start_at,
            "status": _status_of(s, records),
        }
        for s in reversed(sessions[-6:])
    ]

    today = [
        {
            "session_id": s.id,
            "course_code": s.course.code,
            "course_title": s.course.title,
            "start_at": s.start_at,
            "status": _status_of(s, records),
        }
        for s in sessions
        if s.start_at.date() == datetime.now().date()
    ]

    upcoming = [
        {
            "session_id": s.id,
            "course_code": s.course.code,
            "course_title": s.course.title,
            "type": s.course.course_type,
            "start_at": s.start_at,
            "room": s.room,
        }
        for s in db.scalars(
            select(ClassSession)
            .where(
                ClassSession.course_id.in_(courses),
                ClassSession.status.in_(["scheduled", "ongoing"]),
                ClassSession.end_at >= datetime.now(),
            )
            .order_by(ClassSession.start_at)
            .limit(5)
        )
    ] if courses else []

    return {
        "semester": semester,
        "marking_rule": RULE,
        "summary": {
            "courses": len(course_rows),
            "held": held_total,
            "attended": attended_total,
            "percent": attendance_percent(attended_total, held_total),
            "marks_obtained": round(sum(r["marks"] or 0 for r in graded), 1),
            "marks_possible": len(graded) * RULE["full_marks"],
            "full": sum(r["grade"] == "full" for r in course_rows),
            "partial": sum(r["grade"] == "partial" for r in course_rows),
            "incomplete": sum(r["grade"] == "incomplete" for r in course_rows),
        },
        "courses": course_rows,
        "trend": trend,
        "recent": recent,
        "today": today,
        "upcoming": upcoming,
    }


@router.get("/attendance")
def attendance_history(
    semester: str | None = None,
    course_id: int | None = None,
    user: User = Depends(student_only),
    db: Session = Depends(get_db),
):
    profile = _profile_or_404(user)
    semester = semester or profile.current_semester
    _, sessions, records = _semester_data(db, user, semester)
    rows = []
    for s in reversed(sessions):
        if course_id and s.course_id != course_id:
            continue
        record = records.get(s.id)
        rows.append({
            "session_id": s.id,
            "course_id": s.course_id,
            "course_code": s.course.code,
            "course_title": s.course.title,
            "start_at": s.start_at,
            "end_at": s.end_at,
            "room": s.room,
            "status": record.status if record else "absent",
            "marked_at": record.marked_at if record else None,
            "method": record.method if record else None,
        })
    return {"semester": semester, "rows": rows}
