from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import (
    Attendance,
    ClassRoutine,
    ClassSession,
    Course,
    CourseRosterAssignment,
    Enrollment,
    StudentProfile,
    StudentRoster,
    User,
)
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


def test_teacher_dashboard_returns_stats_with_checkins_on_windows():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    with TestSessionLocal() as db:
        teacher = User(
            email="dashboard.teacher@kuet.ac.bd",
            name="Dashboard Teacher",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        student = User(
            email="dashboard.student@kuet.ac.bd",
            name="Dashboard Student",
            role="student",
        )
        db.add_all([teacher, student])
        db.commit()

        course = Course(
            code="CSE 3101",
            title="Database Systems",
            department="CSE",
            semester="3-1",
            teacher_id=teacher.id,
        )
        db.add(course)
        db.commit()

        tomorrow = datetime.now().date() + timedelta(days=1)
        db.add_all([
            ClassRoutine(
                department=course.department,
                semester=course.semester,
                section=course.section,
                day=tomorrow.strftime("%A"),
                start_time="02:30 PM",
                end_time="03:20 PM",
                course_code=course.code,
                course_title=course.title,
                teacher_name=teacher.name,
            ),
            ClassRoutine(
                department=course.department,
                semester=course.semester,
                section=course.section,
                day=tomorrow.strftime("%A"),
                start_time="10:00 AM",
                end_time="10:50 AM",
                course_code=course.code,
                course_title=course.title,
                teacher_name=teacher.name,
            ),
        ])
        class_session = ClassSession(
            course_id=course.id,
            teacher_id=teacher.id,
            start_at=datetime.now() - timedelta(days=1),
            end_at=datetime.now() - timedelta(days=1) + timedelta(minutes=50),
            students=1,
        )
        db.add(class_session)
        db.commit()
        db.add_all([
            Enrollment(student_id=student.id, course_id=course.id, semester=course.semester),
            Attendance(
                session_id=class_session.id,
                student_id=student.id,
                status="present",
                method="face",
                confidence=0.95,
            ),
        ])
        db.commit()

    client = TestClient(app)
    login_response = client.post(
        "/api/auth/login",
        json={"email": "dashboard.teacher@kuet.ac.bd", "password": "teacher123"},
    )
    assert login_response.status_code == 200, login_response.text

    response = client.get(
        "/api/teacher/stats",
        headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["active_courses"] == "01"
    assert data["total_classes"] == "1"
    assert len(data["recent"]) == 1
    assert len(data["recent_checkins"]) == 1
    assert data["recent_checkins"][0]["student_name"] == "Dashboard Student"
    assert [item["time"] for item in data["upcoming"]] == [
        "10:00 AM - 10:50 AM",
        "02:30 PM - 03:20 PM",
    ]
    assert all(
        item["date"] == (datetime.now().date() + timedelta(days=1)).strftime("%A, %B %d, %Y").replace(" 0", " ")
        for item in data["upcoming"]
    )


def test_teacher_history_includes_absent_roster_students_and_course_percentages():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    with TestSessionLocal() as db:
        teacher = User(
            email="history.teacher@kuet.ac.bd",
            name="History Teacher",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        students = [
            User(email=f"history.student{index}@kuet.ac.bd", name=f"Student {index}", role="student")
            for index in (1, 2)
        ]
        db.add_all([teacher, *students])
        db.commit()

        course = Course(
            code="CSE 3101",
            title="Database Systems",
            department="CSE",
            semester="3-1",
            teacher_id=teacher.id,
        )
        db.add(course)
        db.commit()

        rosters = [
            StudentRoster(
                roll=f"220700{index}",
                full_name=f"Student {index}",
                department="CSE",
                session="2022-2023",
            )
            for index in (1, 2)
        ]
        db.add_all(rosters)
        db.commit()
        for index, student in enumerate(students, start=1):
            db.add(StudentProfile(
                user_id=student.id,
                roster_id=rosters[index - 1].id,
                roll=rosters[index - 1].roll,
                full_name=rosters[index - 1].full_name,
                department="CSE",
                series="2022",
                session="2022-2023",
                current_semester="3-1",
                section="A",
            ))
        db.commit()

        db.add_all([
            CourseRosterAssignment(course_id=course.id, roster_id=roster.id)
            for roster in rosters
        ])
        db.add_all([
            Enrollment(student_id=student.id, course_id=course.id, semester=course.semester)
            for student in students
        ])
        latest_start = datetime.now() - timedelta(days=1)
        latest_session = ClassSession(
            course_id=course.id,
            teacher_id=teacher.id,
            start_at=latest_start,
            end_at=latest_start + timedelta(minutes=50),
            students=2,
        )
        duplicate_latest_session = ClassSession(
            course_id=course.id,
            teacher_id=None,
            start_at=latest_start,
            end_at=latest_start + timedelta(minutes=50),
            students=2,
        )
        previous_session = ClassSession(
            course_id=course.id,
            teacher_id=teacher.id,
            start_at=datetime.now() - timedelta(days=2),
            end_at=datetime.now() - timedelta(days=2) + timedelta(minutes=50),
            students=2,
        )
        db.add_all([latest_session, duplicate_latest_session, previous_session])
        db.commit()
        db.add_all([
            Attendance(session_id=latest_session.id, student_id=students[0].id, status="present", method="face"),
            Attendance(session_id=previous_session.id, student_id=students[0].id, status="present", method="face"),
            Attendance(session_id=previous_session.id, student_id=students[1].id, status="present", method="face"),
        ])
        db.commit()

    client = TestClient(app)
    login_response = client.post(
        "/api/auth/login",
        json={"email": "history.teacher@kuet.ac.bd", "password": "teacher123"},
    )
    assert login_response.status_code == 200, login_response.text

    response = client.get(
        "/api/teacher/history",
        headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
    )
    assert response.status_code == 200, response.text
    latest = response.json()[0]
    assert latest["present"] == 1
    assert latest["total"] == 2
    assert latest["percent"] == 50.0
    assert [student["roll"] for student in latest["attendees"]] == ["2207001", "2207002"]
    assert [student["status"] for student in latest["attendees"]] == ["Present", "Absent"]
    assert [student["attendancePercent"] for student in latest["attendees"]] == [100.0, 50.0]

    sheet_response = client.get(
        "/api/teacher/attendance-sheets",
        headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
    )
    assert sheet_response.status_code == 200, sheet_response.text
    sheets = sheet_response.json()
    assert len(sheets) == 1
    sheet = sheets[0]
    assert sheet["classesHeld"] == 2
    assert len(sheet["classes"]) == 15
    assert sheet["classes"][2:] == [None] * 13
    assert [student["roll"] for student in sheet["students"]] == ["2207001", "2207002"]
    assert sheet["students"][0]["attendance"][:2] == ["Present", "Present"]
    assert sheet["students"][1]["attendance"][:2] == ["Present", "Absent"]
    assert [student["attendedCount"] for student in sheet["students"]] == [2, 1]
    assert [student["attendancePercent"] for student in sheet["students"]] == [100.0, 50.0]
    assert sheet["percent"] == 75.0
    assert [point["percent"] for point in sheet["attendanceTrend"]] == [100.0, 50.0]
    assert [point["presentCount"] for point in sheet["attendanceTrend"]] == [2, 1]
