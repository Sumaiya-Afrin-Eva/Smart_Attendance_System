import os

os.environ['DATABASE_URL'] = 'sqlite:///./test_attendance.db'

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal, Base, engine
from app.main import app, ensure_seed_settings
from app.models import Attendance, ClassSession, Course, Enrollment, StudentProfile, User
from app.security import create_token


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ensure_seed_settings()
    with SessionLocal() as db:
        admin = User(email='admin@kuet.ac.bd', name='Admin User', role='admin', password_hash='x')
        teacher = User(email='teacher1@kuet.ac.bd', name='Teacher One', role='teacher', password_hash='x')
        student = User(email='student1@stud.kuet.ac.bd', name='Student One', role='student', password_hash='x')
        db.add_all([admin, teacher, student])
        db.flush()
        db.add(StudentProfile(
            user_id=student.id,
            roll='2107001',
            full_name='Student One',
            department='CSE',
            series='2021',
            section='A',
            current_semester='3-1',
            face_status='approved',
        ))
        db.commit()


def get_admin_token():
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == 'admin@kuet.ac.bd'))
        return create_token(user)


def test_admin_can_create_and_list_courses():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    response = client.post(
        '/api/admin/courses',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'code': 'CSE 4101',
            'title': 'Artificial Intelligence',
            'department': 'CSE',
            'semester': '4-1',
            'course_type': 'Theory',
            'credit': 3.0,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()['code'] == 'CSE 4101'

    list_response = client.get('/api/admin/courses', headers={'Authorization': f'Bearer {token}'})
    assert list_response.status_code == 200, list_response.text
    courses = list_response.json()
    assert any(course['code'] == 'CSE 4101' for course in courses)


def test_admin_can_create_teacher_with_department():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    response = client.post(
        '/api/admin/teachers',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'name': 'Dept Teacher',
            'email': 'deptteacher@kuet.ac.bd',
            'department': 'EEE',
            'designation': 'Lecturer',
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['email'] == 'deptteacher@kuet.ac.bd'

    list_response = client.get('/api/admin/teachers', headers={'Authorization': f'Bearer {token}'})
    assert list_response.status_code == 200, list_response.text
    teacher = next(item for item in list_response.json() if item['email'] == 'deptteacher@kuet.ac.bd')
    assert teacher['department'] == 'EEE'


def test_admin_can_create_teacher_with_password():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    response = client.post(
        '/api/admin/teachers',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'name': 'Password Teacher',
            'email': 'passwordteacher@kuet.ac.bd',
            'department': 'CSE',
            'password': 'SecurePass123',
            'designation': 'Lecturer',
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['email'] == 'passwordteacher@kuet.ac.bd'

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == 'passwordteacher@kuet.ac.bd'))
        assert user is not None
        assert user.password_hash is not None
        assert user.password_hash != 'SecurePass123'


def test_admin_can_assign_teacher_and_student_enrollments():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    with SessionLocal() as db:
        teacher = db.scalar(select(User).where(User.email == 'teacher1@kuet.ac.bd'))
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        db.add_all([
            Course(code='CSE 3101', title='Theory of Computation', department='CSE', semester='3-1', course_type='Theory', credit=3.0),
        ])
        db.commit()
        course = db.scalar(select(Course).where(Course.code == 'CSE 3101'))

    assign_teacher = client.patch(
        f'/api/admin/courses/{course.id}/teacher',
        headers={'Authorization': f'Bearer {token}'},
        json={'teacher_id': teacher.id},
    )
    assert assign_teacher.status_code == 200, assign_teacher.text
    assert assign_teacher.json()['teacher_id'] == teacher.id

    enroll = client.post(
        '/api/admin/student-enrollments',
        headers={'Authorization': f'Bearer {token}'},
        json={'course_id': course.id, 'semester': '3-1', 'student_ids': [student.id]},
    )
    assert enroll.status_code == 200, enroll.text
    assert enroll.json()['saved'] == 1


def test_admin_can_create_student_with_core_details():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    response = client.post(
        '/api/admin/students',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'name': 'New Student',
            'roll': '2107002',
            'email': 'newstudent@stud.kuet.ac.bd',
            'session': '2021-2022',
            'department': 'CSE',
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['email'] == 'newstudent@stud.kuet.ac.bd'
    assert payload['roll'] == '2107002'
    assert payload['department'] == 'CSE'


def test_admin_can_upload_student_photo_after_creation():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    create_response = client.post(
        '/api/admin/students',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'name': 'Photo Student',
            'roll': '2107003',
            'email': 'photostudent@stud.kuet.ac.bd',
            'session': '2021-2022',
            'department': 'CSE',
        },
    )
    student_id = create_response.json()['id']

    photo_bytes = b'\xff\xd8\xff\xe0\x00\x10JFIF' + b'\x00' * 20
    upload_response = client.post(
        f'/api/admin/students/{student_id}/photo',
        headers={'Authorization': f'Bearer {token}'},
        files={'photo': ('student.jpg', photo_bytes, 'image/jpeg')},
    )
    assert upload_response.status_code == 200, upload_response.text
    assert upload_response.json()['count'] == 1


def test_admin_directory_and_security_endpoints_use_live_db_data():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    with SessionLocal() as db:
        teacher = db.scalar(select(User).where(User.email == 'teacher1@kuet.ac.bd'))
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        course = Course(code='CSE 3101', title='Theory of Computation', department='CSE', semester='3-1', course_type='Theory', credit=3.0, teacher_id=teacher.id)
        db.add(course)
        db.flush()
        db.add(Enrollment(student_id=student.id, course_id=course.id, semester='3-1'))
        session = ClassSession(course_id=course.id, start_at='2024-01-15T09:00:00', end_at='2024-01-15T10:00:00', room='CSE 201', status='completed')
        db.add(session)
        db.flush()
        db.add(Attendance(session_id=session.id, student_id=student.id, status='present', method='face'))
        db.commit()

    teachers = client.get('/api/admin/teachers', headers={'Authorization': f'Bearer {token}'})
    assert teachers.status_code == 200, teachers.text
    teacher_payload = teachers.json()
    assert any(item['email'] == 'teacher1@kuet.ac.bd' and item['courses'] >= 1 for item in teacher_payload)
    assert any(item['status'] in {'Active', 'Pending'} for item in teacher_payload)

    students = client.get('/api/admin/students', headers={'Authorization': f'Bearer {token}'})
    assert students.status_code == 200, students.text
    student_payload = students.json()
    assert any(item['roll'] == '2107001' and item['attendance'] in {'0%', '100%'} for item in student_payload)

    alerts = client.get('/api/admin/security-alerts', headers={'Authorization': f'Bearer {token}'})
    assert alerts.status_code == 200, alerts.text
    assert isinstance(alerts.json(), list)

    settings = client.get('/api/admin/settings', headers={'Authorization': f'Bearer {token}'})
    assert settings.status_code == 200, settings.text
    payload = settings.json()
    assert isinstance(payload, list)
    assert any(item['key'] == 'googleLogin' for item in payload)
