import io
import pandas as pd
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import ClassRoutine, Course, TeacherProfile, User
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

    # 5. Create another slot and test clearing all via /api/admin/routine/all
    client.post(
        "/api/admin/routine",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "department": "CSE",
            "semester": "3-1",
            "section": "A",
            "day": "Monday",
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
    clear_res = client.delete(
        "/api/admin/routine/all",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["detail"] == "Selected routine slots cleared."

    # Verify 0 slots remaining
    list_after = client.get(
        "/api/admin/routine",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_after.status_code == 200
    assert len(list_after.json()) == 0



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


def get_teacher_token(email: str):
    client = TestClient(app)
    response = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": "teacher123",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_routine_upload_with_faculty_sheet_and_teacher_dashboard_sync():
    reset_db()
    with TestSessionLocal() as db:
        # Pre-create teacher accounts matching the spreadsheet names
        teacher_hashem = User(
            email="hashem@kuet.ac.bd",
            name="Dr. M. M. A. Hashem",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        teacher_hasan = User(
            email="az@kuet.ac.bd",
            name="Dr. K. M. Azharul Hasan",
            role="teacher",
            password_hash=hash_password("teacher123"),
        )
        db.add_all([teacher_hashem, teacher_hasan])
        db.commit()

    sysadmin_token = get_sysadmin_token()
    client = TestClient(app)

    # 1. Create spreadsheet with EXACT columns from User's uploaded Excel routine
    df = pd.DataFrame([
        {
            "Teacher / Lab / Class": "Dr. M. M. A. Hashem",
            "Day": "Sunday",
            "Start Time": "10:40",
            "End Time": "11:30",
            "Course": "CSE 1107",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. M. M. A. Hashem",
            "Day": "Wednesday",
            "Start Time": "09:40",
            "End Time": "10:30",
            "Course": "CSE 1107",
            "Slot Type": "Theory (1 period)",
        },
        {
            "Teacher / Lab / Class": "Dr. K. M. Azharul Hasan",
            "Day": "Sunday",
            "Start Time": "10:40",
            "End Time": "13:10",
            "Course": "CSE 4122",
            "Slot Type": "Sessional / Lab (3 periods)",
        },
        {
            "Teacher / Lab / Class": "Dr. K. M. Azharul Hasan",
            "Day": "Tuesday",
            "Start Time": "08:50",
            "End Time": "09:40",
            "Course": "CSE 4121c",
            "Slot Type": "Theory (1 period)",
        },
    ])
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    # 2. Upload spreadsheet
    upload_res = client.post(
        "/api/admin/routine/bulk-upload",
        headers={"Authorization": f"Bearer {sysadmin_token}"},
        files={"file": ("faculty_routine.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert upload_res.status_code == 200, upload_res.text
    res_data = upload_res.json()
    assert res_data["added"] == 4

    # 3. Verify semester and time normalization in routine slots
    slots_res = client.get(
        "/api/admin/routine",
        headers={"Authorization": f"Bearer {sysadmin_token}"},
    )
    assert slots_res.status_code == 200
    all_slots = slots_res.json()
    assert len(all_slots) == 4

    # Dr. Hashem's CSE 1107 should have derived semester "1-1" and 12-hr AM/PM times
    hashem_slot = next(s for s in all_slots if s["courseCode"] == "CSE 1107" and s["day"] == "Sunday")
    assert hashem_slot["semester"] == "1-1"
    assert hashem_slot["startTime"] == "10:40 AM"
    assert hashem_slot["endTime"] == "11:30 AM"
    assert hashem_slot["courseType"] == "Theory"

    # Dr. Hasan's CSE 4121c should be considered as CSE 4121 and NEVER auto-detect section as "C"
    hasan_theory = next(s for s in all_slots if s["courseCode"] == "CSE 4121")
    assert hasan_theory["semester"] == "4-1"
    assert hasan_theory["section"] == "A"

    # 4. Verify teacher course assignment in Database
    with TestSessionLocal() as db:
        c1107 = db.scalar(select(Course).where(Course.code == "CSE 1107"))
        assert c1107 is not None
        hashem_user = db.scalar(select(User).where(User.email == "hashem@kuet.ac.bd"))
        assert c1107.teacher_id == hashem_user.id

        c4122 = db.scalar(select(Course).where(Course.code == "CSE 4122"))
        assert c4122 is not None
        hasan_user = db.scalar(select(User).where(User.email == "az@kuet.ac.bd"))
        assert c4122.teacher_id == hasan_user.id

    # 5. Verify Dr. Hashem logs in and views their own routine and stats
    hashem_token = get_teacher_token("hashem@kuet.ac.bd")
    hashem_routine_res = client.get(
        "/api/teacher/routine",
        headers={"Authorization": f"Bearer {hashem_token}"},
    )
    assert hashem_routine_res.status_code == 200
    hashem_slots = hashem_routine_res.json()
    assert len(hashem_slots) == 2
    assert all(s["courseCode"] == "CSE 1107" for s in hashem_slots)
    assert all(s["teacherName"] == "Dr. M. M. A. Hashem" for s in hashem_slots)

    # 6. Verify Dr. Hasan logs in and views their own routine
    hasan_token = get_teacher_token("az@kuet.ac.bd")
    hasan_routine_res = client.get(
        "/api/teacher/routine",
        headers={"Authorization": f"Bearer {hasan_token}"},
    )
    assert hasan_routine_res.status_code == 200
    hasan_slots = hasan_routine_res.json()
    assert len(hasan_slots) == 2
    hasan_codes = {s["courseCode"] for s in hasan_slots}
    assert "CSE 4122" in hasan_codes
    assert "CSE 4121" in hasan_codes

