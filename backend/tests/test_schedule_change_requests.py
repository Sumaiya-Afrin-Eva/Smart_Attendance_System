from datetime import date, datetime, time, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import (
    Attendance,
    ClassScheduleChangeRequest,
    ClassRoutine,
    ClassSession,
    Course,
    CourseRosterAssignment,
    Enrollment,
    StudentProfile,
    User,
)
from app.routers.face import _get_or_create_session_for_routine, _resolve_active_class_for_student
from app.routers.students import dashboard as student_dashboard
from app.security import hash_password

test_engine = create_engine("sqlite:///./test_attendance.db")
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


def next_sunday():
    today = date.today()
    days_until = (6 - today.weekday()) % 7 or 7
    return today + timedelta(days=days_until)


def reset_db(target_date=None):
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    target_date = target_date or next_sunday()
    with TestSessionLocal() as db:
        admin = User(
            email="sysadmin@kuet.ac.bd",
            name="System Administrator",
            role="system_admin",
            password_hash=hash_password("sysadmin123"),
        )
        teacher = User(
            email="teacher@kuet.ac.bd",
            name="Dr Test Teacher",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        other_teacher = User(
            email="other.teacher@kuet.ac.bd",
            name="Other Teacher",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        student = User(
            email="student@kuet.ac.bd",
            name="Test Student",
            role="student",
        )
        db.add_all([admin, teacher, other_teacher, student])
        db.commit()

        course = Course(
            code="CSE 3101",
            title="Test Course",
            department="CSE",
            semester="3-1",
            session="2025-2026",
            section="A",
            teacher_id=teacher.id,
        )
        routine = ClassRoutine(
            department="CSE",
            semester="3-1",
            section="A",
            day=target_date.strftime("%A"),
            start_time="10:00 AM",
            end_time="10:50 AM",
            course_code="CSE 3101",
            course_title="Test Course",
            teacher_name=teacher.name,
            room="Room 301",
            session="2025-2026",
        )
        db.add_all([course, routine])
        db.commit()

        profile = StudentProfile(
            user_id=student.id,
            roster_id=7001,
            roll="2107001",
            full_name=student.name,
            department="CSE",
            series="2021",
            session="2025-2026",
            section="A",
            current_semester="3-1",
        )
        db.add_all([
            profile,
            Enrollment(student_id=student.id, course_id=course.id, semester=course.semester),
            CourseRosterAssignment(course_id=course.id, roster_id=7001),
        ])
        db.commit()
        return target_date, routine.id, student.id, course.id, teacher.id, other_teacher.id


def login(email, password, access_code=None):
    payload = {"email": email, "password": password}
    if access_code:
        payload["access_code"] = access_code
    response = TestClient(app).post("/api/auth/login", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_teacher_request_admin_approval_reschedules_only_that_date_and_kiosk_window():
    target_date, routine_id, student_id, course_id, teacher_id, other_teacher_id = reset_db()
    original_session_start = datetime.combine(target_date, time(10, 0))
    with TestSessionLocal() as db:
        existing_session = ClassSession(
            course_id=course_id,
            teacher_id=other_teacher_id,
            start_at=original_session_start,
            end_at=original_session_start + timedelta(minutes=50),
            status="completed",
        )
        db.add(existing_session)
        db.commit()
        existing_session_id = existing_session.id

    client = TestClient(app)
    teacher_token = login("teacher@kuet.ac.bd", "teacher123")
    admin_token = login("sysadmin@kuet.ac.bd", "sysadmin123", "admin123")

    create_response = client.post(
        "/api/teacher/schedule-change-requests",
        headers={"Authorization": f"Bearer {teacher_token}"},
        json={
            "routine_id": routine_id,
            "target_date": target_date.isoformat(),
            "requested_start_time": "14:30",
            "requested_end_time": "15:20",
        },
    )
    assert create_response.status_code == 200, create_response.text
    assert create_response.json()["status"] == "pending"

    pending_response = client.get(
        "/api/admin/schedule-change-requests",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert pending_response.status_code == 200
    assert len(pending_response.json()) == 1
    request_id = pending_response.json()[0]["id"]

    approve_response = client.patch(
        f"/api/admin/schedule-change-requests/{request_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "approved"},
    )
    assert approve_response.status_code == 200, approve_response.text
    assert approve_response.json()["status"] == "approved"

    with TestSessionLocal() as db:
        student = db.get(User, student_id)
        routine = db.get(ClassRoutine, routine_id)
        course = db.get(Course, course_id)
        before_class = datetime.combine(target_date, time(10, 10))
        during_class = datetime.combine(target_date, time(14, 40))
        after_class = datetime.combine(target_date, time(15, 21))

        assert _resolve_active_class_for_student(db, student, before_class)[0] is None
        assert _resolve_active_class_for_student(db, student, during_class)[0].code == "CSE 3101"
        assert _resolve_active_class_for_student(db, student, after_class)[0] is None
        class_session = _get_or_create_session_for_routine(
            db, course, teacher_id, during_class, routine=routine
        )
        assert class_session.id == existing_session_id
        assert class_session.teacher_id == teacher_id
        assert class_session.start_at == datetime.combine(target_date, time(14, 30))
        assert class_session.end_at == datetime.combine(target_date, time(15, 20))
        assert db.query(ClassSession).filter_by(course_id=course_id).count() == 1


def test_kiosk_creates_session_at_approved_time_when_no_session_exists():
    target_date, routine_id, _, course_id, teacher_id, _ = reset_db()
    now = datetime.combine(target_date, time(14, 40))
    with TestSessionLocal() as db:
        db.add(ClassScheduleChangeRequest(
            routine_id=routine_id,
            teacher_id=teacher_id,
            target_date=target_date,
            requested_start_time="02:30 PM",
            requested_end_time="03:20 PM",
            status="approved",
        ))
        db.commit()
        routine = db.get(ClassRoutine, routine_id)
        course = db.get(Course, course_id)

        class_session = _get_or_create_session_for_routine(
            db, course, teacher_id, now, routine=routine
        )

        assert class_session.start_at == datetime.combine(target_date, time(14, 30))
        assert class_session.end_at == now
        assert db.query(ClassSession).filter_by(course_id=course_id).count() == 1


def test_student_dashboard_uses_approved_rescheduled_time_for_today():
    target_date, routine_id, student_id, course_id, teacher_id, _ = reset_db(date.today())
    start_at = datetime.combine(target_date, time(14, 30))
    end_at = datetime.combine(target_date, time(15, 20))
    with TestSessionLocal() as db:
        db.add(ClassScheduleChangeRequest(
            routine_id=routine_id,
            teacher_id=teacher_id,
            target_date=target_date,
            requested_start_time="02:30 PM",
            requested_end_time="03:20 PM",
            status="approved",
        ))
        class_session = ClassSession(
            course_id=course_id,
            teacher_id=teacher_id,
            start_at=start_at,
            end_at=end_at,
            status="completed",
        )
        db.add(class_session)
        db.commit()
        class_session_id = class_session.id
        db.add(Attendance(
            session_id=class_session_id,
            student_id=student_id,
            status="present",
            method="face",
        ))
        db.commit()
        student = db.get(User, student_id)
        dashboard_data = student_dashboard(semester=None, user=student, db=db)
    today_class = next(item for item in dashboard_data["today"] if item["routine_id"] == routine_id)
    assert today_class["session_id"] == class_session_id
    assert today_class["status"] == "present"
    assert today_class["start_time"] == "02:30 PM"
    assert today_class["end_time"] == "03:20 PM"
