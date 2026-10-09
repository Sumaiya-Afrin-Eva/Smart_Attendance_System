import io
import os

os.environ['DATABASE_URL'] = 'sqlite:///./test_attendance.db'

from fastapi.testclient import TestClient

from app.main import app, ensure_seed_settings
from app.database import Base, engine, SessionLocal
from app.models import Course, User
from sqlalchemy import select
from app.security import create_token


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()


def test_bulk_upload_image_inserts_courses(monkeypatch):
    """End-to-end test: upload a synthetic curriculum-like text file (pretend OCR'd) and
    assert courses are inserted into DB via the bulk-upload endpoint.
    """
    reset_db()
    client = TestClient(app)

    # Ensure a seeded admin exists; create one if missing
    from sqlalchemy import select
    with SessionLocal() as db:
        admin_user = db.scalar(select(User).where(User.email == 'admin@kuet.ac.bd'))
        if not admin_user:
            # create minimal admin user
            u = User(email='admin@kuet.ac.bd', name='Admin', role='admin', password_hash='x', is_active=True)
            db.add(u)
            db.commit()
            db.refresh(u)
            admin_user = u
        token = create_token(admin_user)

    # Create a synthetic image payload that the parser can read as text
    sample_text = (
        "Course Code: CSE 1101\n"
        "Course Title: Structured Programming\n"
        "Credit: 1.5\n"
        "Department: CSE\n"
        "Semester: 1st Year 1st Term\n"
        "Type: Theory\n"
    )

    files = {"file": ("sample.txt", sample_text.encode('utf-8'), 'text/plain')}

    headers = {'Authorization': f'Bearer {token}'}

    response = client.post('/api/admin/courses/bulk-upload', files=files, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert 'added' in body

    # Verify DB via ORM
    with SessionLocal() as db:
        courses = db.scalars(select(Course)).all()
        assert any(c.code == 'CSE 1101' for c in courses)
