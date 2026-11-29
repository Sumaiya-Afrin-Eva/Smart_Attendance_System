"""Everything a logged-in student can do with their own data."""
import json
import re
from collections import defaultdict
from datetime import datetime, time, timedelta
from datetime import timezone
from pathlib import Path
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..database import get_db
from ..config import settings
from ..marks import RULE, attendance_marks, attendance_percent
from ..models import (
    Attendance, ClassRoutine, ClassSession, ConsumedAttendanceQr, Course, CourseRosterAssignment, Enrollment, FaceSample, StudentProfile,
    StudentRoster, StudentSemesterFaceEnrollment, User,
)
from .routine import _clean_course_code
from ..schemas import ProfileIn
from ..security import require_role
from ..services import FACE_ENROLLMENT_VERSION, course_out, onboarding_status
from ..services.face_service import get_face_service
from ..schedule_utils import approved_schedule_changes, effective_routine_times

router = APIRouter(prefix="/api/students/me", tags=["student"])
student_only = require_role("student")
ATTENDANCE_QR_VALID_SECONDS = 30
ATTENDANCE_QR_ISSUER = "smart-attendance"
ATTENDANCE_QR_AUDIENCE = "attendance-kiosk"
ANDROID_DEVICE_ID_PATTERN = re.compile(r"[0-9a-fA-F]{16}")


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


@router.get("/attendance-qr")
def issue_attendance_qr(
    device_id: str = Header(..., alias="X-Device-ID"),
    user: User = Depends(student_only),
    db: Session = Depends(get_db),
):
    """Issue a short-lived signed QR token for the student's active semester."""
    if not ANDROID_DEVICE_ID_PATTERN.fullmatch(device_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A valid Android device ID is required.")

    profile = user.profile
    if not profile or not profile.roster_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Complete student registration before requesting an attendance QR.")

    roster = db.get(StudentRoster, profile.roster_id)
    if (
        not roster
        or not roster.is_active
        or roster.roll != profile.roll
        or roster.department != profile.department
        or roster.session != profile.session
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your approved student record is not active.")

    enrolled = db.scalar(
        select(StudentSemesterFaceEnrollment.id).where(
            StudentSemesterFaceEnrollment.user_id == user.id,
            StudentSemesterFaceEnrollment.semester == profile.current_semester,
            StudentSemesterFaceEnrollment.enrollment_version >= FACE_ENROLLMENT_VERSION,
        )
    )
    if not enrolled:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Complete face enrollment for your current semester before requesting an attendance QR.",
        )

    _bind_student_device(profile, device_id, db)

    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + ATTENDANCE_QR_VALID_SECONDS
    db.execute(delete(ConsumedAttendanceQr).where(ConsumedAttendanceQr.expires_at < int(now.timestamp())))
    db.commit()
    token = jwt.encode(
        {
            "sub": str(user.id),
            "semester": profile.current_semester,
            "jti": str(uuid4()),
            "iat": int(now.timestamp()),
            "exp": expires_at,
            "iss": ATTENDANCE_QR_ISSUER,
            "aud": ATTENDANCE_QR_AUDIENCE,
            "scope": "attendance:mark",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {
        "token": token,
        "expires_at": expires_at,
        "expires_in": ATTENDANCE_QR_VALID_SECONDS,
        "student": {
            "name": profile.full_name,
            "roll": profile.roll,
            "semester": profile.current_semester,
        },
    }


def _bind_student_device(profile: StudentProfile, device_id: str, db: Session) -> None:
    if profile.device_id is not None:
        if profile.device_id != device_id:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This account is bound to a different phone. Contact your instructor if you changed your phone.",
            )
        return

    try:
        result = db.execute(
            update(StudentProfile)
            .where(StudentProfile.id == profile.id, StudentProfile.device_id.is_(None))
            .values(device_id=device_id, device_bound_at=datetime.now())
        )
        if result.rowcount == 0:
            db.rollback()
            db.refresh(profile)
            if profile.device_id != device_id:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "This account is bound to a different phone. Contact your instructor if you changed your phone.",
                )
            return
        db.commit()
        db.refresh(profile)
    except IntegrityError:
        db.rollback()
        owner_id = db.scalar(select(StudentProfile.id).where(StudentProfile.device_id == device_id))
        if owner_id is None:
            raise
        if owner_id != profile.id:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This phone is registered to another account.",
            ) from None
        db.refresh(profile)


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
            Course.semester == body.current_semester,
            Course.is_active.is_(True),
        ).limit(1)
    )
    if offered is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This year-term is not offered for your approved department.",
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


POSE_NAMES = [
    "look_straight",
    "turn_left",
    "turn_right",
    "tilt_up",
    "tilt_down",
]


def _resolve_pose_name(photo: UploadFile, index: int) -> str:
    original = Path(photo.filename or "").stem.lower().strip()
    for pose in POSE_NAMES:
        if pose in original:
            return pose
    if "left" in original:
        return "turn_left"
    if "right" in original:
        return "turn_right"
    if "up" in original:
        return "tilt_up"
    if "down" in original:
        return "tilt_down"
    if "straight" in original:
        return "look_straight"
    if 0 <= index < len(POSE_NAMES):
        return POSE_NAMES[index]
    return f"pose_{index + 1}"


@router.post("/face-samples")
async def upload_face_samples(
    photos: list[UploadFile] = File(...),
    user: User = Depends(student_only),
    db: Session = Depends(get_db),
):
    """Validate and store the student's camera registration samples."""
    if len(photos) != 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Capture exactly five different face photos.")
    if not user.profile or not user.profile.roster_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Complete the academic details before face registration.")

    roster = db.get(StudentRoster, user.profile.roster_id)
    if not roster or not roster.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your approved student record could not be found.")

    face_service = get_face_service()
    validated: list[tuple[bytes, str]] = []
    for photo in photos:
        content = await photo.read()
        if photo.content_type not in {"image/jpeg", "image/png"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPEG or PNG images are allowed.")
        if len(content) > 3 * 1024 * 1024:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Each photo must be under 3 MB.")
        try:
            face_service.validate_single_human_face(content)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        validated.append((content, "image/png" if content.startswith(b"\x89PNG") else "image/jpeg"))

    picture_root = settings.picture_dir.resolve()
    picture_root.mkdir(parents=True, exist_ok=True)
    dept = (roster.department or "GENERAL").strip()
    dept_dir = picture_root / dept
    dept_dir.mkdir(parents=True, exist_ok=True)

    old_paths = json.loads(roster.face_sample_paths or "[]")
    paths: list[str] = []
    new_filenames: set[str] = set()
    main_suffix = ".png" if validated[0][1] == "image/png" else ".jpg"
    main_filename = f"{roster.roll}{main_suffix}"
    (dept_dir / main_filename).write_bytes(validated[0][0])
    roster.photo_path = f"picture/{dept}/{main_filename}"
    roster.photo_data = validated[0][0]
    roster.photo_mime_type = validated[0][1]

    for index, ((content, mime_type), photo) in enumerate(zip(validated, photos)):
        suffix = ".png" if mime_type == "image/png" else ".jpg"
        pose_name = _resolve_pose_name(photo, index)
        filename = f"{roster.roll}_{pose_name}{suffix}"
        new_filenames.add(filename)
        (dept_dir / filename).write_bytes(content)
        paths.append(f"picture/{dept}/{filename}")

    for relative_path in old_paths:
        old_file = (settings.picture_dir.parent / relative_path).resolve()
        if (old_file.parent == picture_root or picture_root in old_file.parents) and old_file.is_file():
            if old_file.name not in new_filenames and old_file.name != main_filename:
                old_file.unlink(missing_ok=True)

    roster.face_sample_paths = json.dumps(paths)
    roster.face_enrollment_version = FACE_ENROLLMENT_VERSION
    semester_enrollment = db.scalar(
        select(StudentSemesterFaceEnrollment).where(
            StudentSemesterFaceEnrollment.user_id == user.id,
            StudentSemesterFaceEnrollment.semester == user.profile.current_semester,
        )
    )
    if semester_enrollment:
        semester_enrollment.enrollment_version = FACE_ENROLLMENT_VERSION
        semester_enrollment.created_at = datetime.now()
    else:
        db.add(
            StudentSemesterFaceEnrollment(
                user_id=user.id,
                semester=user.profile.current_semester,
                enrollment_version=FACE_ENROLLMENT_VERSION,
            )
        )
    db.commit()
    return {"status": "submitted", "count": len(paths), "photo_paths": paths}


@router.post("/face-check")
async def check_live_face(
    photo: UploadFile = File(...),
    user: User = Depends(student_only),
):
    """Check one live camera frame before allowing a registration capture."""
    if photo.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Camera frame must be a JPEG or PNG image.")
    try:
        frame = await photo.read()
        return await run_in_threadpool(get_face_service().check_liveness, frame, str(user.id))
    except ValueError:
        return {
            "human": False,
            "liveness": False,
            "message": "Exactly one clear face must be visible. Uncover the camera, center your face, and face a well-lit area.",
        }
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {"human": True, "message": "Human face detected. You can capture this view."}


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


def _routine_time_minutes(value: str | None) -> int | None:
    if not value:
        return None
    normalized = str(value).strip().replace(".", ":")
    for time_format in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p"):
        try:
            parsed = datetime.strptime(normalized, time_format)
            return parsed.hour * 60 + parsed.minute
        except ValueError:
            continue
    return None


def _routine_contains_minute(start: int, end: int, minute: int) -> bool:
    if start <= end:
        return start <= minute <= end
    return minute >= start or minute <= end


def _parse_time_str(time_str: str | None) -> time | None:
    if not time_str:
        return None
    normalized = str(time_str).strip().replace(".", ":")
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(normalized, fmt).time()
        except ValueError:
            pass
    return None


def _absence_window_for_session(session: ClassSession, db: Session | None = None) -> dict | None:
    start_at = session.start_at
    end_at = session.end_at or start_at

    # Resolve scheduled class start time from ClassRoutine when possible
    if db is not None and session.start_at is not None:
        try:
            course = session.course or db.get(Course, session.course_id)
            if course:
                day_name = session.start_at.strftime("%A").strip().lower()
                routines = db.scalars(
                    select(ClassRoutine).where(
                        func.upper(func.trim(ClassRoutine.course_code)) == func.upper(func.trim(course.code)),
                        func.lower(func.trim(ClassRoutine.day)) == day_name,
                    )
                ).all()

                matched_routine = None
                if routines:
                    for r in routines:
                        dept_match = (r.department or "").strip().upper() == (course.department or "").strip().upper()
                        sem_match = (r.semester or "").strip() == (course.semester or "").strip()
                        if dept_match and sem_match:
                            matched_routine = r
                            break
                    if not matched_routine:
                        matched_routine = routines[0]

                if matched_routine and matched_routine.start_time:
                    parsed_time = _parse_time_str(matched_routine.start_time)
                    if parsed_time:
                        class_start_dt = datetime.combine(session.start_at.date(), parsed_time)
                        if class_start_dt <= end_at:
                            start_at = class_start_dt
                        elif start_at > class_start_dt:
                            start_at = class_start_dt
        except Exception:
            pass

    if end_at < start_at:
        end_at = start_at
    delta_seconds = max(0, (end_at - start_at).total_seconds())
    if delta_seconds == 0:
        return {
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
            "duration_minutes": 0,
            "label": "Absent since class started",
        }
    return {
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat(),
        "duration_minutes": int(delta_seconds // 60),
        "label": "Absent during class window",
    }


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

    now = datetime.now()
    today_start = datetime.combine(now.date(), time.min)
    today_end = today_start + timedelta(days=1)
    schedule_changes = approved_schedule_changes(db, now.date())
    course_codes = {course.code.strip().casefold() for course in courses.values()}
    routines = db.scalars(
        select(ClassRoutine).where(
            or_(
                ClassRoutine.department == profile.department,
                ClassRoutine.course_code.in_([c.code for c in courses.values() if c.code]),
            ),
            ClassRoutine.semester == semester,
            ClassRoutine.day == now.strftime("%A"),
        )
    ).all() if course_codes else []
    today_routines = []
    for routine in routines:
        clean_code = _clean_course_code(routine.course_code).strip().casefold()
        raw_code = routine.course_code.strip().casefold()
        if clean_code not in course_codes and raw_code not in course_codes:
            continue
        routine_section = (routine.section or "").strip().upper()
        student_section = (profile.section or "").strip().upper()
        if student_section and student_section != "ALL" and routine_section not in {student_section, "BOTH", "ALL", ""}:
            continue

        course = next(
            (
                course for course in courses.values()
                if course.code.strip().casefold() in {clean_code, raw_code}
                and (
                    not routine_section
                    or routine_section in {"BOTH", "ALL", ""}
                    or (course.section or "").strip().upper() in {routine_section, "BOTH", "ALL", ""}
                )
                and (
                    not student_section
                    or (course.section or "").strip().upper() in {student_section, "BOTH", "ALL", ""}
                )
            ),
            None,
        )
        if course is not None:
            start_time, end_time = effective_routine_times(routine, schedule_changes)
            today_routines.append((course, start_time, end_time))

    today_course_ids = {course.id for course, _, _ in today_routines}
    today_sessions = db.scalars(
        select(ClassSession).where(
            ClassSession.course_id.in_(today_course_ids),
            ClassSession.start_at >= today_start,
            ClassSession.start_at < today_end,
            ClassSession.status != "cancelled",
        ).order_by(ClassSession.start_at)
    ).all() if today_course_ids else []
    today_session_ids = [session.id for session in today_sessions]
    today_records = db.scalars(
        select(Attendance).where(
            Attendance.student_id == user.id,
            Attendance.session_id.in_(today_session_ids),
        )
    ).all() if today_session_ids else []
    record_status_by_session = {record.session_id: record.status for record in today_records}
    sessions_by_course = {}
    for session in today_sessions:
        sessions_by_course.setdefault(session.course_id, []).append(session)

    today = []
    for course, start_time, end_time in sorted(
        today_routines,
        key=lambda row: (row[1] or "", row[0].code),
    ):
        start_minutes = _routine_time_minutes(start_time)
        end_minutes = _routine_time_minutes(end_time)
        course_sessions = sessions_by_course.get(course.id, [])
        if start_minutes is not None and end_minutes is not None:
            matching_sessions = [
                session for session in course_sessions
                if _routine_contains_minute(
                    start_minutes,
                    end_minutes,
                    session.start_at.hour * 60 + session.start_at.minute,
                )
            ]
        else:
            matching_sessions = course_sessions if len(course_sessions) == 1 else []
        matched_session = matching_sessions[0] if matching_sessions else None
        attended = any(
            record_status_by_session.get(session.id) in {"present", "late"}
            for session in matching_sessions
        )
        today.append({
            "routine_id": routine.id,
            "session_id": matched_session.id if matched_session else None,
            "course_code": course.code,
            "course_title": course.title,
            "start_time": start_time,
            "end_time": end_time,
            "status": "present" if attended else "absent",
        })

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
        "department": profile.department or "CSE",
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
            "absence_window": _absence_window_for_session(s, db=db) if (record is None or record.status == "absent") else None,
        })
    return {"semester": semester, "rows": rows}
