import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_attendance.db"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, SessionLocal, engine
from app.main import ensure_seed_settings
from app.models import Course, CourseRosterAssignment, Enrollment, StudentProfile, StudentRoster, User, ClassSession
from app.routers import face, students
def test_student_attendance_history_includes_absence_window_for_absent_sessions():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()

    now = datetime(2026, 11, 17, 18, 0, 0)

    with SessionLocal() as db:
        user = User(email="student-absent@stud.kuet.ac.bd", name="Absent Student", role="student", password_hash=None)
        roster = StudentRoster(
            roll="2201001",
            full_name="Absent Student",
            email="student-absent@stud.kuet.ac.bd",
            department="CSE",
            session="2022-2023",
            phone="01700000000",
            is_active=True,
        )
        profile = StudentProfile(
            user_id=None,
            full_name="Absent Student",
            roll="2201001",
            department="CSE",
            series="2022",
            session="2022-2023",
            current_semester="2-1",
            phone="01700000000",
            roster_id=None,
        )
        course = Course(code="CSE 211", title="Computer Security", department="CSE", semester="2-1", is_active=True)

        db.add_all([user, roster, course])
        db.commit()
        db.refresh(user)
        db.refresh(roster)
        db.refresh(course)

        profile.user_id = user.id
        profile.roster_id = roster.id
        user.profile = profile
        roster.profile = profile

        db.add(profile)
        db.add(CourseRosterAssignment(course_id=course.id, roster_id=roster.id))
        db.add(Enrollment(student_id=user.id, course_id=course.id, semester=course.semester))

        session = ClassSession(
            course_id=course.id,
            teacher_id=None,
            start_at=now - timedelta(minutes=60),
            end_at=now - timedelta(minutes=20),
            room="D-204",
            students=40,
            status="completed",
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        result = students.attendance_history(semester="2-1", user=user, db=db)

        assert result["rows"]
        row = result["rows"][0]
        assert row["status"] == "absent"
        assert row["absence_window"]["start_at"] == session.start_at.isoformat()
        assert row["absence_window"]["end_at"] == session.end_at.isoformat()


def test_face_scan_within_first_five_minutes_is_marked_as_late():
    start = datetime(2026, 11, 17, 9, 0, 0)
    session = ClassSession(
        id=1,
        course_id=1,
        teacher_id=None,
        start_at=start,
        end_at=start + timedelta(minutes=90),
        room="D-204",
        students=40,
        status="completed",
    )

    late_at = start + timedelta(minutes=3)
    present_at = start + timedelta(minutes=8)

    assert face._attendance_status_for_session(session, late_at) == "late"
    assert face._attendance_status_for_session(session, present_at) == "present"
