import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Base, engine
from app import models
from app.security import hash_password, create_token

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Ensure super admin exists
        sa = db.query(models.User).filter(models.User.email == "superadmin@kuet.ac.bd").first()
        if not sa:
            sa = models.User(
                email="superadmin@kuet.ac.bd",
                password_hash=hash_password("super123"),
                role="super_admin",
                name="Super Administrator"
            )
            db.add(sa)
            db.commit()

        # Ensure CSE sys admin exists
        cse_sa = db.query(models.User).filter(models.User.email == "sysadmin@kuet.ac.bd").first()
        if not cse_sa:
            cse_sa = models.User(
                email="sysadmin@kuet.ac.bd",
                password_hash=hash_password("admin123"),
                role="system_admin",
                name="CSE System Administrator"
            )
            db.add(cse_sa)
            db.commit()
    finally:
        db.close()
    yield

def get_auth_headers_for_user(email: str):
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        token = create_token(user)
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()

def test_get_kiosks_seeds_defaults():
    headers = get_auth_headers_for_user("superadmin@kuet.ac.bd")
    resp = client.get("/api/admin/kiosks", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    codes = [k["dept_code"] for k in data]
    assert "CSE" in codes
    assert "EEE" in codes

def test_create_custom_kiosk_and_login():
    headers = get_auth_headers_for_user("superadmin@kuet.ac.bd")
    payload = {
        "dept_name": "Civil Engineering",
        "dept_code": "CE",
        "location": "Civil Complex Room 101",
        "access_code": "ceadmin123",
        "system_admin_email": "ce_sysadmin@kuet.ac.bd",
        "system_admin_password": "cepwd123password",
        "system_admin_name": "CE System Administrator",
        "student_admin_email": "ce_admin@kuet.ac.bd",
        "student_admin_password": "cepwd123password",
        "student_admin_name": "CE Student Administrator",
        "notes": "CE Test Kiosk"
    }

    # Delete if left over from previous run
    client.delete("/api/admin/kiosks/CE", headers=headers)

    create_resp = client.post("/api/admin/kiosks", json=payload, headers=headers)
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    kiosk_data = created["kiosk"]
    assert kiosk_data["dept_code"] == "CE"
    assert kiosk_data["system_admin_dashboard"] == "/admin/ce-system-admin"
    assert kiosk_data["student_admin_dashboard"] == "/admin/ce-student-admin"
    assert kiosk_data["kiosk_url"] == "/kiosk/ce"

    # Verify CE System Admin can login
    login_sys = client.post("/api/auth/login", json={
        "email": "ce_sysadmin@kuet.ac.bd",
        "password": "cepwd123password",
        "access_code": "ceadmin123"
    })
    assert login_sys.status_code == 200, login_sys.text
    sys_body = login_sys.json()
    assert sys_body["user"]["role"] == "ce_system_admin"

    # Verify CE Student Admin can login
    login_stu = client.post("/api/auth/login", json={
        "email": "ce_admin@kuet.ac.bd",
        "password": "cepwd123password",
        "access_code": "ceadmin123"
    })
    assert login_stu.status_code == 200, login_stu.text
    stu_body = login_stu.json()
    assert stu_body["user"]["role"] == "ce_admin"

def test_data_isolation_between_departments():
    ce_headers = get_auth_headers_for_user("ce_sysadmin@kuet.ac.bd")
    cse_headers = get_auth_headers_for_user("sysadmin@kuet.ac.bd")

    # Add a course under CE
    add_resp = client.post("/api/admin/courses", json={
        "code": "CE 1101",
        "title": "Surveying and Leveling",
        "department": "CE",
        "credit": 3.0,
        "type": "Theory",
        "semester": "1-1"
    }, headers=ce_headers)
    assert add_resp.status_code in (200, 201, 409), add_resp.text

    # CE admin queries courses -> must see CE 1101, must not see CSE courses
    ce_courses_resp = client.get("/api/admin/courses", headers=ce_headers)
    assert ce_courses_resp.status_code == 200
    ce_codes = [c["code"] for c in ce_courses_resp.json()]
    assert "CE 1101" in ce_codes
    for code in ce_codes:
        assert not code.startswith("CSE"), f"CSE course {code} leaked to CE admin!"

    # CSE admin queries courses -> must NOT see CE 1101
    cse_courses_resp = client.get("/api/admin/courses", headers=cse_headers)
    assert cse_courses_resp.status_code == 200
    cse_codes = [c["code"] for c in cse_courses_resp.json()]
    assert "CE 1101" not in cse_codes, "CE course leaked to CSE admin!"

def test_delete_kiosk_and_guard_defaults():
    headers = get_auth_headers_for_user("superadmin@kuet.ac.bd")

    # Guard CSE from deletion
    del_cse = client.delete("/api/admin/kiosks/CSE", headers=headers)
    assert del_cse.status_code == 400

    # Guard EEE from deletion
    del_eee = client.delete("/api/admin/kiosks/EEE", headers=headers)
    assert del_eee.status_code == 400

    # Delete custom CE kiosk
    del_ce = client.delete("/api/admin/kiosks/CE", headers=headers)
    assert del_ce.status_code == 200

    # Verify CE admin can no longer login
    login_after_del = client.post("/api/auth/login", json={
        "email": "ce_sysadmin@kuet.ac.bd",
        "password": "cepwd123password",
        "access_code": "ceadmin123"
    })
    assert login_after_del.status_code == 401
