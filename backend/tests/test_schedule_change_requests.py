from datetime import date, datetime, time, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import (
    ClassRoutine,
    Course,
    CourseRosterAssignment,
    Enrollment,
    StudentProfile,
    User,
)
from app.routers.face import _resolve_active_class_for_student
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


def reset_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    target_date = next_sunday()
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
        student = User(
            email="student@kuet.ac.bd",
            name="Test Student",
            role="student",
        )
        db.add_all([admin, teacher, student])
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
        return target_date, routine.id, student.id


def login(email, password, access_code=None):
    payload = {"email": email, "password": password}
    if access_code:
        payload["access_code"] = access_code
    response = TestClient(app).post("/api/auth/login", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_teacher_request_admin_approval_reschedules_only_that_date_and_kiosk_window():
    target_date, routine_id, student_id = reset_db()
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
        before_class = datetime.combine(target_date, time(10, 10))
        during_class = datetime.combine(target_date, time(14, 40))
        after_class = datetime.combine(target_date, time(15, 21))

        assert _resolve_active_class_for_student(db, student, before_class)[0] is None
        assert _resolve_active_class_for_student(db, student, during_class)[0].code == "CSE 3101"
        assert _resolve_active_class_for_student(db, student, after_class)[0] is None
