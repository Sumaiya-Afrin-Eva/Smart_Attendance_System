"""Everything a logged-in student can do with their own data."""
import shutil
from collections import defaultdict
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..marks import RULE, attendance_marks, attendance_percent
from ..models import (
    Attendance, ClassSession, Course, Enrollment, FaceSample, StudentProfile, User,
)
from ..schemas import EnrollmentIn, ProfileIn
from ..security import require_role
from ..services import course_out, onboarding_status

router = APIRouter(prefix="/api/students/me", tags=["student"])
student_only = require_role("student")

MIN_FACE_PHOTOS, MAX_FACE_PHOTOS = 3, 10
MAX_PHOTO_BYTES = 3 * 1024 * 1024


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
        "section": p.section,
        "current_semester": p.current_semester,
        "phone": p.phone,
        "face_status": p.face_status,
    }


# ---------------------------------------------------------------- profile

@router.get("/profile")
def get_profile(user: User = Depends(student_only)):
    if not user.profile:
        return None
    return _profile_out(user.profile, user)


@router.put("/profile")
def save_profile(body: ProfileIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    profile = user.profile or StudentProfile(user_id=user.id, face_status="none")
    for field, value in body.model_dump().items():
        setattr(profile, field, value)
    user.name = body.full_name
    db.add(profile)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This roll number is already registered to another account.")
    db.refresh(user)
    return {"profile": _profile_out(profile, user), "onboarding": onboarding_status(db, user)}


# ---------------------------------------------------------------- face photos

@router.get("/face")
def face_status(user: User = Depends(student_only), db: Session = Depends(get_db)):
    samples = db.scalars(
        select(FaceSample).where(FaceSample.student_id == user.id).order_by(FaceSample.id)
    ).all()
    return {
        "status": user.profile.face_status if user.profile else "none",
        "count": len(samples),
        "sample_ids": [s.id for s in samples],
        "updated_at": samples[-1].created_at if samples else None,
    }


@router.get("/face/{sample_id}")
def face_photo(sample_id: int, user: User = Depends(student_only), db: Session = Depends(get_db)):
    sample = db.get(FaceSample, sample_id)
    if not sample or sample.student_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    return FileResponse(sample.file_path, media_type="image/jpeg")


@router.post("/face")
async def upload_face(
    photos: list[UploadFile] = File(...),
    user: User = Depends(student_only),
    db: Session = Depends(get_db),
):
    profile = _profile_or_404(user)
    if not MIN_FACE_PHOTOS <= len(photos) <= MAX_FACE_PHOTOS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Upload between {MIN_FACE_PHOTOS} and {MAX_FACE_PHOTOS} photos.",
        )

    contents = []
    for photo in photos:
        data = await photo.read()
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Each photo must be under 3 MB.")
        if not (data.startswith(b"\xff\xd8") or data.startswith(b"\x89PNG")):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photos must be JPEG or PNG images.")
        contents.append(data)

    # Replace any previous photos
    folder = settings.storage_dir / "faces" / str(user.id)
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True, exist_ok=True)
    db.execute(delete(FaceSample).where(FaceSample.student_id == user.id))

    for i, data in enumerate(contents, start=1):
        path = folder / f"{i:02d}.jpg"
        path.write_bytes(data)
        db.add(FaceSample(student_id=user.id, file_path=str(path)))

    # "submitted": photos saved. The kiosk turns them into face embeddings later.
    profile.face_status = "submitted"
    db.commit()
    return {"status": profile.face_status, "count": len(contents), "onboarding": onboarding_status(db, user)}


# ---------------------------------------------------------------- course selection

@router.get("/enrollments")
def list_enrollments(semester: str | None = None, user: User = Depends(student_only), db: Session = Depends(get_db)):
    query = select(Enrollment).where(Enrollment.student_id == user.id)
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
def save_enrollments(body: EnrollmentIn, user: User = Depends(student_only), db: Session = Depends(get_db)):
    profile = _profile_or_404(user)
    wanted = set(body.course_ids)
    if not wanted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one course.")

    courses = db.scalars(select(Course).where(Course.id.in_(wanted))).all()
    if len(courses) != len(wanted):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "One or more courses do not exist.")
    for c in courses:
        if c.semester != body.semester or c.department != profile.department:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{c.code} is not a {profile.department} {body.semester} course.",
            )

    current = {
        e.course_id: e
        for e in db.scalars(
            select(Enrollment).where(Enrollment.student_id == user.id, Enrollment.semester == body.semester)
        )
    }
    to_remove = set(current) - wanted
    if to_remove:
        has_attendance = db.scalar(
            select(func.count(Attendance.id))
            .join(ClassSession, ClassSession.id == Attendance.session_id)
            .where(Attendance.student_id == user.id, ClassSession.course_id.in_(to_remove))
        )
        if has_attendance:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "You cannot drop a course that already has attendance records. Contact your teacher.",
            )
        for course_id in to_remove:
            db.delete(current[course_id])
    for course_id in wanted - set(current):
        db.add(Enrollment(student_id=user.id, course_id=course_id, semester=body.semester))
    db.commit()
    return {"saved": len(wanted), "onboarding": onboarding_status(db, user)}


# ---------------------------------------------------------------- dashboard & history

def _semester_data(db: Session, user: User, semester: str):
    enrollments = db.scalars(
        select(Enrollment).where(Enrollment.student_id == user.id, Enrollment.semester == semester)
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
