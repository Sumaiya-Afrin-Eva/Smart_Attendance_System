import os
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite:///./test_attendance.db"

import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select

from app.config import settings
from app.database import Base, SessionLocal, engine
from app import main as main_module
from app.main import app, ensure_seed_settings
from app.models import (
    Attendance,
    ClassSession,
    Course,
    CourseRosterAssignment,
    Enrollment,
    FaceSample,
    StudentProfile,
    StudentRoster,
    User,
)
from app.security import create_token


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()
    with SessionLocal() as db:
        admin = User(email="admin@kuet.ac.bd", name="Admin User", role="admin", password_hash="x")
        student = User(
            email="student1@stud.kuet.ac.bd",
            name="Student One",
            role="student",
            password_hash=None,
        )
        db.add_all([admin, student])
        db.commit()


def token_for(email):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        return create_token(user)


def headers_for(email):
    return {"Authorization": f"Bearer {token_for(email)}"}


def create_roster(client, headers, photo_bytes, phone=None):
    response = client.post(
        "/api/admin/students",
        headers=headers,
        json={
            "name": "Student One",
            "roll": "2107001",
            "email": "student1@stud.kuet.ac.bd",
            "session": "2021-2022",
            "department": "CSE",
            "phone": phone,
        },
    )
    assert response.status_code == 200, response.text
    roster_id = response.json()["id"]
    uploaded = client.post(
        f"/api/admin/students/{roster_id}/photo",
        headers=headers,
        files={"photo": ("official.jpg", photo_bytes, "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text
    return roster_id


def test_admin_roster_is_separate_from_student_account_and_supports_crud(tmp_path, monkeypatch):
    reset_db()
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    client = TestClient(app)
    admin_headers = headers_for("admin@kuet.ac.bd")
    photo_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20

    roster_id = create_roster(client, admin_headers, photo_bytes, phone="01558082363")
    with SessionLocal() as db:
        roster = db.get(StudentRoster, roster_id)
        assert roster is not None
        assert roster.photo_data == photo_bytes
        assert roster.phone == "01558082363"
        assert db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd")).profile is None

    listed = client.get("/api/admin/students", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    student_record = next(row for row in listed.json() if row["id"] == roster_id)
    assert student_record["name"] == "Student One"
    assert not {"status", "attendance", "risk", "photo_available"} & student_record.keys()

    update = client.put(
        f"/api/admin/students/{roster_id}",
        headers=admin_headers,
        json={
            "name": "Updated Student",
            "roll": "2107001",
            "email": "student1@stud.kuet.ac.bd",
            "session": "2021-2022",
            "department": "CSE",
            "phone": "+8801558082363",
        },
    )
    assert update.status_code == 200, update.text
    assert update.json()["name"] == "Updated Student"
    assert update.json()["phone"] == "+8801558082363"

    deleted = client.delete(f"/api/admin/students/{roster_id}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text
    with SessionLocal() as db:
        assert db.get(StudentRoster, roster_id) is None


def test_admin_approved_email_can_sign_in_before_official_photo_is_uploaded(monkeypatch):
    reset_db()
    monkeypatch.setattr(settings, "dev_login_enabled", True)
    client = TestClient(app)

    missing_roster = client.post(
        "/api/auth/dev-login",
        json={"email": "student1@stud.kuet.ac.bd", "name": "Student One"},
    )
    assert missing_roster.status_code == 403

    admin_headers = headers_for("admin@kuet.ac.bd")
    created = client.post(
        "/api/admin/students",
        headers=admin_headers,
        json={
            "name": "Student One",
            "roll": "2107001",
            "email": "student1@stud.kuet.ac.bd",
            "session": "2021-2022",
            "department": "CSE",
        },
    )
    assert created.status_code == 200, created.text
    approved_email_login = client.post(
        "/api/auth/dev-login",
        json={"email": "student1@stud.kuet.ac.bd", "name": "Student One"},
    )
    assert approved_email_login.status_code == 200, approved_email_login.text
    assert approved_email_login.json()["onboarding"]["complete"] is False

    uploaded = client.post(
        f"/api/admin/students/{created.json()['id']}/photo",
        headers=admin_headers,
        files={"photo": ("official.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20, "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text


def test_completed_student_login_reports_dashboard_ready_state(monkeypatch):
    reset_db()
    monkeypatch.setattr(settings, "dev_login_enabled", True)
    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd"))
        roster = StudentRoster(
            full_name="Student One",
            roll="2107001",
            email=student.email,
            department="CSE",
            session="2021-2022",
            photo_data=b"official-photo",
            photo_mime_type="image/jpeg",
            is_active=True,
        )
        course = Course(
            code="CSE 3101",
            title="Course for registered student",
            department="CSE",
            semester="3-1",
            session="2021-2022",
            course_type="Theory",
            credit=3.0,
        )
        db.add_all([roster, course])
        db.flush()
        profile = StudentProfile(
            user_id=student.id,
            roster_id=roster.id,
            roll=roster.roll,
            full_name=roster.full_name,
            department=roster.department,
            series="2021",
            session=roster.session,
            section="A",
            current_semester="3-1",
        )
        db.add(profile)
        db.flush()
        db.add(Enrollment(student_id=student.id, course_id=course.id, semester="3-1"))
        db.commit()

    response = TestClient(app).post(
        "/api/auth/dev-login",
        json={"email": "student1@stud.kuet.ac.bd", "name": "Student One"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["onboarding"]["complete"] is True


def test_student_registration_can_complete_before_course_assignment(monkeypatch):
    reset_db()
    monkeypatch.setattr(settings, "dev_login_enabled", True)
    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd"))
        roster = StudentRoster(
            full_name="Student One",
            roll="2107001",
            email=student.email,
            department="CSE",
            session="2021-2022",
            is_active=True,
        )
        db.add(roster)
        db.flush()
        db.add(StudentProfile(
            user_id=student.id,
            roster_id=roster.id,
            roll=roster.roll,
            full_name=roster.full_name,
            department=roster.department,
            series="2021",
            session=roster.session,
            current_semester="3-1",
        ))
        db.commit()

    response = TestClient(app).post(
        "/api/auth/dev-login",
        json={"email": "student1@stud.kuet.ac.bd", "name": "Student One"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["onboarding"]["complete"] is True
    assert response.json()["onboarding"] == {"profile": True, "complete": True}


def test_kiosk_matches_admin_roster_photo_not_student_face_samples(monkeypatch):
    reset_db()
    client = TestClient(app)
    official_photo = b"admin-official-photo"
    kiosk_frame = b"kiosk-camera-frame"
    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd"))
        roster = StudentRoster(
            full_name="Student One",
            roll="2107001",
            email=student.email,
            department="CSE",
            session="2021-2022",
            photo_data=official_photo,
            photo_mime_type="image/jpeg",
            is_active=True,
        )
        db.add(roster)
        db.flush()
        db.add(StudentProfile(
            user_id=student.id,
            roster_id=roster.id,
            roll=roster.roll,
            full_name=roster.full_name,
            department=roster.department,
            series="2021",
            session=roster.session,
            current_semester="3-1",
        ))
        db.add(FaceSample(student_id=student.id, file_path="student-submitted-face.jpg"))
        db.commit()

    class TestFaceService:
        def extract_embedding(self, image):
            assert image in {official_photo, kiosk_frame}
            return np.array([1.0, 0.0], dtype=np.float32)

    monkeypatch.setattr("app.routers.face.get_face_service", TestFaceService)
    response = client.post(
        "/api/face/recognize",
        files={"image": ("kiosk.jpg", kiosk_frame, "image/jpeg")},
    )

    assert response.status_code == 200, response.text
    assert response.json()["matched"] is True
    assert response.json()["student"]["roll"] == "2107001"


def test_kiosk_open_and_face_scan_record_attendance_for_course_enrollees(monkeypatch):
    reset_db()
    client = TestClient(app)
    admin_headers = headers_for("admin@kuet.ac.bd")
    official_photo = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"official-student-one"
    roster_id = create_roster(client, admin_headers, official_photo)

    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd"))
        student.profile = StudentProfile(
            user_id=student.id,
            roster_id=roster_id,
            roll="2107001",
            full_name="Student One",
            department="CSE",
            series="2021",
            session="2021-2022",
            current_semester="3-1",
        )
        absent_student = User(email="student2@stud.kuet.ac.bd", name="Student Two", role="student")
        db.add(absent_student)
        db.flush()
        absent_roster = StudentRoster(
            full_name="Student Two",
            roll="2107002",
            email=absent_student.email,
            department="CSE",
            session="2021-2022",
            photo_data=b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"official-student-two",
            photo_mime_type="image/jpeg",
            is_active=True,
        )
        db.add(absent_roster)
        db.flush()
        absent_student.profile = StudentProfile(
            user_id=absent_student.id,
            roster_id=absent_roster.id,
            roll=absent_roster.roll,
            full_name=absent_roster.full_name,
            department=absent_roster.department,
            series="2021",
            session=absent_roster.session,
            current_semester="3-1",
        )
        course = Course(
            code="CSE 3200",
            title="System Development Project",
            department="CSE",
            semester="3-1",
            session="2021-2022",
            course_type="Lab",
            credit=1.5,
        )
        db.add(course)
        db.flush()
        db.add_all([
            CourseRosterAssignment(course_id=course.id, roster_id=roster_id),
            CourseRosterAssignment(course_id=course.id, roster_id=absent_roster.id),
            Enrollment(student_id=student.id, course_id=course.id, semester="3-1"),
            Enrollment(student_id=absent_student.id, course_id=course.id, semester="3-1"),
        ])
        course_id = course.id
        db.commit()
        student_token = create_token(student)
        absent_student_token = create_token(absent_student)

    opened = client.post("/api/face/kiosk/open", json={"course_code": " cse 3200 "})
    assert opened.status_code == 200, opened.text
    kiosk_session_id = opened.json()["session_id"]
    assert opened.json()["course"]["title"] == "System Development Project"
    assert opened.json()["student_count"] == 2

    with SessionLocal() as db:
        class_session = db.get(ClassSession, kiosk_session_id)
        assert class_session.course_id == course_id
        assert class_session.status == "completed"
        assert class_session.start_at.date() == datetime.now().date()

    class TestFaceService:
        def extract_embedding(self, image):
            if image in {official_photo, b"kiosk-student-one"}:
                return np.array([1.0, 0.0], dtype=np.float32)
            if image == b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"official-student-two":
                return np.array([0.0, 1.0], dtype=np.float32)
            return np.array([-1.0, 0.0], dtype=np.float32)

    monkeypatch.setattr("app.routers.face.get_face_service", TestFaceService)
    rejected = client.post(
        "/api/face/kiosk/scan",
        data={"session_id": str(kiosk_session_id)},
        files={"image": ("camera.jpg", b"unrecognized-face", "image/jpeg")},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["matched"] is False
    with SessionLocal() as db:
        assert db.query(Attendance).filter_by(session_id=kiosk_session_id).count() == 0

    marked = client.post(
        "/api/face/kiosk/scan",
        data={"session_id": str(kiosk_session_id)},
        files={"image": ("camera.jpg", b"kiosk-student-one", "image/jpeg")},
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["matched"] is True
    assert marked.json()["attendance"]["status"] == "present"
    assert marked.json()["attendance"]["already_marked"] is False

    repeated = client.post(
        "/api/face/kiosk/scan",
        data={"session_id": str(kiosk_session_id)},
        files={"image": ("camera.jpg", b"kiosk-student-one", "image/jpeg")},
    )
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["attendance"]["already_marked"] is True
    with SessionLocal() as db:
        assert db.query(Attendance).filter_by(session_id=kiosk_session_id).count() == 1

    present_dashboard = client.get(
        "/api/students/me/dashboard",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert present_dashboard.status_code == 200, present_dashboard.text
    assert present_dashboard.json()["today"] == [{
        "session_id": kiosk_session_id,
        "course_code": "CSE 3200",
        "course_title": "System Development Project",
        "start_at": present_dashboard.json()["today"][0]["start_at"],
        "status": "present",
    }]

    absent_dashboard = client.get(
        "/api/students/me/dashboard",
        headers={"Authorization": f"Bearer {absent_student_token}"},
    )
    assert absent_dashboard.status_code == 200, absent_dashboard.text
    assert absent_dashboard.json()["today"][0]["status"] == "absent"


def test_kiosk_rejects_unknown_course_code():
    reset_db()
    response = TestClient(app).post("/api/face/kiosk/open", json={"course_code": "CSE 9999"})
    assert response.status_code == 404


def test_meta_lists_all_current_academic_sessions_independent_of_course_offerings():
    reset_db()

    response = TestClient(app).get("/api/meta")

    assert response.status_code == 200, response.text
    assert response.json()["sessions"] == [
        "2022-2023",
        "2023-2024",
        "2024-2025",
        "2025-2026",
        "2026-2027",
    ]


def test_registration_requires_matching_roster_photo_and_offered_session_term():
    reset_db()
    client = TestClient(app)
    admin_headers = headers_for("admin@kuet.ac.bd")
    student_headers = headers_for("student1@stud.kuet.ac.bd")
    official_photo = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20
    roster_id = create_roster(client, admin_headers, official_photo, phone="+8801558082363")

    body = {
        "full_name": "Student One",
        "roll": "2107001",
        "department": "CSE",
        "series": "2021",
        "session": "2021-2022",
        "current_semester": "3-2",
        "section": "B",
        "phone": "+8801999999999",
    }
    rejected = client.put("/api/students/me/profile", headers=student_headers, json=body)
    assert rejected.status_code == 403
    assert "not offered" in rejected.json()["detail"]

    with SessionLocal() as db:
        course = Course(
            code="CSE 3101",
            title="Course for eligible term",
            department="CSE",
            semester="3-1",
            session="2021-2022",
            course_type="Theory",
            credit=3.0,
        )
        db.add(course)
        db.flush()
        db.add(CourseRosterAssignment(course_id=course.id, roster_id=roster_id))
        db.commit()

    body["current_semester"] = "3-1"
    accepted = client.put("/api/students/me/profile", headers=student_headers, json=body)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["onboarding"]["complete"] is True
    assert accepted.json()["profile"]["session"] == "2021-2022"
    assert accepted.json()["profile"]["phone"] == "+8801558082363"
    assert "section" not in accepted.json()["profile"]
    with SessionLocal() as db:
        profile = db.scalar(select(StudentProfile).where(StudentProfile.roll == "2107001"))
        assert profile.roster_id == roster_id
        assert profile.phone == "+8801558082363"
        assert profile.section is None
        student = db.scalar(select(User).where(User.email == "student1@stud.kuet.ac.bd"))
        assert db.scalar(
            select(Enrollment.id).where(
                Enrollment.student_id == student.id,
                Enrollment.course_id == course.id,
            )
        ) is not None


def test_admin_bootstrap_and_login_require_server_access_code(monkeypatch):
    reset_db()
    monkeypatch.setattr(settings, "admin_access_code", "private-test-code")
    with SessionLocal() as db:
        db.query(User).filter(User.role == "admin").delete()
        db.commit()

    client = TestClient(app)
    payload = {
        "email": "newadmin@kuet.ac.bd",
        "name": "First Admin",
        "password": "VerySecurePassword123!",
        "access_code": "wrong-code",
    }
    denied = client.post("/api/auth/bootstrap-admin", json=payload)
    assert denied.status_code == 403

    payload["access_code"] = "private-test-code"
    created = client.post("/api/auth/bootstrap-admin", json=payload)
    assert created.status_code == 200, created.text
    assert created.json()["user"]["role"] == "admin"

    login_payload = {"email": payload["email"], "password": payload["password"]}
    denied_login = client.post("/api/auth/login", json=login_payload)
    assert denied_login.status_code == 401
    login_payload["access_code"] = "private-test-code"
    allowed_login = client.post("/api/auth/login", json=login_payload)
    assert allowed_login.status_code == 200, allowed_login.text


def test_legacy_roster_photo_path_is_migrated_to_sqlite_blob(tmp_path, monkeypatch):
    legacy_photo = tmp_path / "official.jpg"
    photo_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20
    legacy_photo.write_bytes(photo_bytes)
    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy_engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql(
            "CREATE TABLE student_profiles (id INTEGER PRIMARY KEY, user_id INTEGER, face_status TEXT)"
        )
        conn.exec_driver_sql("CREATE TABLE admin_settings (id INTEGER PRIMARY KEY, key TEXT, label TEXT, description TEXT, enabled BOOLEAN)")
        conn.exec_driver_sql("CREATE TABLE courses (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE class_sessions (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE student_roster (id INTEGER PRIMARY KEY, photo_path TEXT)")
        conn.exec_driver_sql("INSERT INTO student_roster (id, photo_path) VALUES (1, ?)", (str(legacy_photo),))

    monkeypatch.setattr(main_module, "engine", legacy_engine)
    monkeypatch.setattr(settings, "database_url", "sqlite:///legacy.db")
    main_module.ensure_database_schema()

    with legacy_engine.connect() as conn:
        migrated_data, mime_type = conn.exec_driver_sql(
            "SELECT photo_data, photo_mime_type FROM student_roster WHERE id = 1"
        ).one()
        profile_columns = {
            column[1] for column in conn.exec_driver_sql("PRAGMA table_info(student_profiles)").fetchall()
        }
    assert migrated_data == photo_bytes
    assert mime_type == "image/jpeg"
    assert "face_status" not in profile_columns
