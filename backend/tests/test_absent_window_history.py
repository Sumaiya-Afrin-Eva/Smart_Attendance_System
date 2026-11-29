import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_attendance.db"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, SessionLocal, engine
from app.main import ensure_seed_settings
from app.models import Course, CourseRosterAssignment, Enrollment, StudentProfile, StudentRoster, User, ClassSession, ClassRoutine
from app.routers import face, students
from app.routers.face import _get_or_create_session_for_routine


def test_face_scans_reuse_the_same_routine_session_when_teacher_resolution_changes():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    now = datetime(2026, 11, 24, 9, 15, 0)
    with SessionLocal() as db:
        teacher = User(email="routine-teacher@kuet.ac.bd", name="Routine Teacher", role="teacher")
        course = Course(code="CSE 2101", title="Test Course", department="CSE", semester="2-1")
        routine = ClassRoutine(
            department="CSE",
            semester="2-1",
            day=now.strftime("%A"),
            start_time="09:00 AM",
            end_time="10:00 AM",
            course_code="CSE 2101",
            course_title="Test Course",
            teacher_name="Routine Teacher",
            room="Room 101",
        )
        db.add_all([teacher, course, routine])
        db.commit()
        db.refresh(teacher)
        db.refresh(course)

        first_session = _get_or_create_session_for_routine(db, course, None, now, routine=routine)
        second_session = _get_or_create_session_for_routine(db, course, teacher.id, now, routine=routine)

        assert second_session.id == first_session.id
        assert db.query(ClassSession).count() == 1


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
        db.add(Enrollment(student_id=user.id, course_id=course.id, semester=course.semester, created_at=now - timedelta(days=2)))

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


def test_face_scan_after_ten_minutes_is_marked_as_late():
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

    present_at = start + timedelta(minutes=8)
    late_at = start + timedelta(minutes=15)

    assert face._attendance_status_for_session(session, present_at) == "present"
    assert face._attendance_status_for_session(session, late_at) == "late"


def test_student_attendance_history_uses_routine_start_time_for_absence_window():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()

    now = datetime(2026, 11, 24, 19, 2, 0)

    with SessionLocal() as db:
        user = User(email="student-absent2@stud.kuet.ac.bd", name="Absent Student 2", role="student", password_hash=None)
        roster = StudentRoster(
            roll="2201002",
            full_name="Absent Student 2",
            email="student-absent2@stud.kuet.ac.bd",
            department="CSE",
            session="2022-2023",
            phone="01700000001",
            is_active=True,
        )
        profile = StudentProfile(
            user_id=None,
            full_name="Absent Student 2",
            roll="2201002",
            department="CSE",
            series="2022",
            session="2022-2023",
            current_semester="3-2",
            phone="01700000001",
            roster_id=None,
        )
        course = Course(code="CSE 3200", title="System Development Project", department="CSE", semester="3-2", is_active=True)
        routine = ClassRoutine(
            department="CSE",
            semester="3-2",
            day="Tuesday",
            start_time="08:00 AM",
            end_time="10:00 PM",
            course_code="CSE 3200",
            course_title="System Development Project",
            teacher_name="Dr. M. M. A. Hashem",
            room="Room 301",
        )

        db.add_all([user, roster, course, routine])
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
        db.add(Enrollment(student_id=user.id, course_id=course.id, semester=course.semester, created_at=now - timedelta(days=2)))

        session = ClassSession(
            course_id=course.id,
            teacher_id=None,
            start_at=now,
            end_at=now + timedelta(seconds=14),
            room="Room 301",
            students=40,
            status="completed",
        )
        db.add(session)
        db.commit()
        db.refresh(session)

        result = students.attendance_history(semester="3-2", user=user, db=db)

        assert result["rows"]
        row = result["rows"][0]
        assert row["status"] == "absent"
        assert row["absence_window"]["start_at"] == datetime(2026, 11, 24, 8, 0, 0).isoformat()
        assert row["absence_window"]["end_at"] == (now + timedelta(seconds=14)).isoformat()

