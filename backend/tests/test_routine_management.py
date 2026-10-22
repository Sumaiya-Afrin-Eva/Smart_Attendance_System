import io
import pandas as pd
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import ClassRoutine, User
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


def reset_db():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    with TestSessionLocal() as db:
        sysadmin = User(
            email="sysadmin@kuet.ac.bd",
            name="System Administrator",
            role="system_admin",
            password_hash=hash_password("sysadmin123"),
        )
        db.add(sysadmin)
        db.commit()


def get_sysadmin_token():
    client = TestClient(app)
    response = client.post(
        "/api/auth/login",
        json={
            "email": "sysadmin@kuet.ac.bd",
            "password": "sysadmin123",
            "access_code": "admin123",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_sysadmin_can_manage_routine_manually():
    reset_db()
    token = get_sysadmin_token()
    client = TestClient(app)

    # 1. Create a routine slot
    create_res = client.post(
        "/api/admin/routine",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "department": "CSE",
            "semester": "3-1",
            "section": "A",
            "day": "Sunday",
            "start_time": "08:00 AM",
            "end_time": "08:50 AM",
            "course_code": "CSE 3101",
            "course_title": "Theory of Computation",
            "course_type": "Theory",
            "teacher_name": "Dr. M. M. A. Hashem",
            "room": "Room 301",
            "session": "2025-2026",
        },
    )
    assert create_res.status_code == 200, create_res.text
    slot_id = create_res.json()["id"]
    assert create_res.json()["courseCode"] == "CSE 3101"

    # 2. List routine slots
    list_res = client.get(
        "/api/admin/routine",
        headers={"Authorization": f"Bearer {token}"},
        params={"department": "CSE", "semester": "3-1"},
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Update routine slot
    patch_res = client.patch(
        f"/api/admin/routine/{slot_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"room": "Room 305"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["room"] == "Room 305"

    # 4. Delete routine slot
    del_res = client.delete(
        f"/api/admin/routine/{slot_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 200


def test_sysadmin_can_bulk_upload_routine_excel():
    reset_db()
    token = get_sysadmin_token()
    client = TestClient(app)

    df = pd.DataFrame([
        {
            "Day": "Monday",
            "Start Time": "09:50 AM",
            "End Time": "10:40 AM",
            "Course Code": "CSE 3105",
            "Course Title": "Software Engineering",
            "Course Type": "Theory",
            "Teacher": "Dr. Kazi Md. Rokibul Alam",
            "Room": "Room 302",
            "Department": "CSE",
            "Semester": "3-1",
            "Section": "A",
        }
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    upload_res = client.post(
        "/api/admin/routine/bulk-upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("routine.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert upload_res.status_code == 200, upload_res.text
    assert upload_res.json()["added"] == 1
