import os
import json
os.environ['DATABASE_URL'] = 'sqlite:///./test_attendance.db'

from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal, Base, engine
from app.main import app, ensure_seed_settings
from app.models import ClassSession, Course, StudentProfile, StudentRoster, User, Attendance


def test_kiosk_scan_with_matched_rolls():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()

    with SessionLocal() as db:
        user = User(email='teststudent@kuet.ac.bd', name='Test Student', role='student', password_hash='x')
        db.add(user)
        db.commit()
        db.refresh(user)
        u_id = user.id

        roster = StudentRoster(
            roll='2207039',
            full_name='Sumaiya Afrin Eva',
            department='CSE',
            session='2022-2023',
            is_active=True,
            photo_path='picture/CSE/2207039.jpg'
        )
        db.add(roster)
        db.commit()
        db.refresh(roster)

        profile = StudentProfile(
            user_id=user.id,
            roster_id=roster.id,
            full_name='Sumaiya Afrin Eva',
            roll='2207039',
            department='CSE',
            series='22',
            session='2022-2023',
            current_semester='3-2',
            section='A'
        )
        db.add(profile)

        course = Course(
            code='CSE 3200',
            title='System Development Project',
            department='CSE',
            semester='3-2',
            course_type='Lab',
            credit=1.5,
            is_active=True
        )
        db.add(course)
        db.commit()
        db.refresh(course)

        session = ClassSession(
            course_id=course.id,
            room='CL-1',
            status='active',
            start_at=datetime.now(),
            end_at=datetime.now(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        s_id = session.id

    client = TestClient(app)

    # Call kiosk scan with matched_rolls (as sent by local Mac edge recognition)
    res = client.post(
        "/api/face/kiosk/scan",
        data={
            "kiosk_id": "CSE",
            "session_id": s_id,
            "matched_rolls": json.dumps(["2207039"]),
            "confidence": 0.88,
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["matched"] is True
    assert data["student"]["roll"] == "2207039"
    assert data["student"]["name"] == "Sumaiya Afrin Eva"
    assert data["attendance"]["status"] in ["present", "late"]

    # Verify record was created in DB
    with SessionLocal() as db:
        att = db.scalar(select(Attendance).where(Attendance.session_id == s_id, Attendance.student_id == u_id))
        assert att is not None
        assert att.method == "face"
