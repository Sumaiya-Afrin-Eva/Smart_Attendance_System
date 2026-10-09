import os

os.environ['DATABASE_URL'] = 'sqlite:///./test_attendance.db'

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import ai_extraction
from app.database import SessionLocal, Base, engine
from app.main import app, ensure_seed_settings
from app.models import Attendance, ClassSession, Course, CourseRosterAssignment, Enrollment, FaceSample, StudentProfile, StudentRoster, User
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
        ))
        db.commit()


def get_admin_token():
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == 'admin@kuet.ac.bd'))
        return create_token(user)


def test_extract_courses_uses_valid_multimodal_input_for_images(monkeypatch):
    seen = {}

    class FakeModel:
        def __init__(self, name):
            seen['model'] = name

        def generate_content(self, contents, generation_config=None):
            seen['contents'] = contents
            seen['generation_config'] = generation_config
            return type('Resp', (), {'text': '[{"code":"CSE 3101","title":"Data Structures","credit":3.0,"department":"CSE","semester":"3-2","course_type":"Theory","session":"2025-2026"}]'})()

    monkeypatch.setattr(ai_extraction.settings, 'gemini_api_key', 'fake-key')
    monkeypatch.setattr(ai_extraction.genai, 'configure', lambda api_key: seen.setdefault('key', api_key))
    monkeypatch.setattr(ai_extraction.genai, 'GenerativeModel', FakeModel)

    result = ai_extraction.extract_courses_from_file(b'img-bytes', 'image/png')

    assert result[0]['code'] == 'CSE 3101'
    assert seen['key'] == 'fake-key'
    assert seen['model'] == 'gemini-3.8-flash'
    assert seen['contents'][1] == {'inline_data': {'mime_type': 'image/png', 'data': b'img-bytes'}}


def test_fallback_parser_extracts_courses_from_text_content():
    text = (
        "1st Year 1st Term\n"
        "CSE 1101 Structured Programming 3-3 hrs/wk 3-1.5 Credit\n"
        "EEE 2107 Analog Electronics 3-3 hrs/wk 3-1.5 Credit\n"
        "2nd Year 1st Term\n"
        "CSE 2201 Digital Logic Design 3-3 hrs/wk 3-1.5 Credit\n"
        "EEE 2207 Fundamentals of Electronics Laboratory 3-3 hrs/wk 3-1.5 Credit"
    )
    result = ai_extraction._extract_courses_from_text(text)
    assert len(result) == 4
    values = {item["code"]: item for item in result}
    assert values["CSE 1101"]["semester"] == "1-1"
    assert values["EEE 2107"]["department"] == "EEE"
    assert values["EEE 2207"]["course_type"] == "Lab"
    assert values["CSE 2201"]["credit"] == 1.5


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
    assert 'teacher_name' not in response.json()
    assert 'teacher_email' not in response.json()
    course_id = response.json()['id']

    list_response = client.get('/api/admin/courses', headers={'Authorization': f'Bearer {token}'})
    assert list_response.status_code == 200, list_response.text
    courses = list_response.json()
    assert any(course['code'] == 'CSE 4101' for course in courses)
    assert any(course['id'] == course_id and course['is_active'] for course in courses)
    updated = client.put(
        f'/api/admin/courses/{course_id}',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'code': 'CSE 4101',
            'title': 'Updated Artificial Intelligence',
            'department': 'CSE',
            'semester': '4-1',
            'course_type': 'Theory',
            'credit': 3.0,
            'session': '2025-2026',
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()['title'] == 'Updated Artificial Intelligence'

    reused_code = client.post(
        '/api/admin/courses',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'code': 'CSE 4101',
            'title': 'Artificial Intelligence, next session',
            'department': 'CSE',
            'semester': '4-1',
            'course_type': 'Theory',
            'credit': 3.0,
            'session': '2026-2027',
        },
    )
    assert reused_code.status_code == 200, reused_code.text
    delete_response = client.delete(
        f'/api/admin/courses/{course_id}',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert delete_response.status_code == 200, delete_response.text
    assert delete_response.json()['history_preserved'] is True
    active_courses = client.get(
        '/api/admin/courses',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert not any(course['id'] == course_id for course in active_courses.json())
    archived = client.get(
        '/api/admin/courses',
        params={'include_archived': True},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert any(course['id'] == course_id and not course['is_active'] for course in archived.json())


def test_student_admin_cannot_manage_teacher_accounts():
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
    assert response.status_code == 403, response.text

    list_response = client.get('/api/admin/teachers', headers={'Authorization': f'Bearer {token}'})
    assert list_response.status_code == 403, list_response.text


def test_student_admin_cannot_create_teacher_with_password():
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
    assert response.status_code == 403, response.text

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == 'passwordteacher@kuet.ac.bd'))
        assert user is None


def test_student_admin_cannot_access_teacher_dashboard():
    reset_db()
    client = TestClient(app)

    response = client.get(
        '/api/teacher/stats',
        headers={'Authorization': f'Bearer {get_admin_token()}'},
    )
    assert response.status_code == 403, response.text


def test_student_admin_can_delete_legacy_student_and_only_their_records(tmp_path):
    reset_db()
    client = TestClient(app)
    token = get_admin_token()
    legacy_face = tmp_path / 'legacy-face.jpg'
    legacy_face.write_bytes(b'face-sample')

    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        course = Course(
            code='CSE 3101',
            title='Theory of Computation',
            department='CSE',
            semester='3-1',
            course_type='Theory',
            credit=3.0,
        )
        db.add(course)
        db.flush()
        session = ClassSession(
            course_id=course.id,
            start_at='2024-01-15T09:00:00',
            end_at='2024-01-15T10:00:00',
            room='CSE 201',
            status='completed',
        )
        db.add_all([
            Enrollment(student_id=student.id, course_id=course.id, semester='3-1'),
            FaceSample(student_id=student.id, file_path=str(legacy_face)),
        ])
        db.add(session)
        db.flush()
        db.add(Attendance(session_id=session.id, student_id=student.id, status='present', method='face'))
        db.commit()
        student_id = student.id

    response = client.delete(
        f'/api/admin/legacy-students/{student_id}',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert response.status_code == 200, response.text
    assert response.json()['deleted'] is True
    assert not legacy_face.exists()

    with SessionLocal() as db:
        assert db.get(User, student_id) is None
        assert db.scalar(select(Attendance.id).where(Attendance.student_id == student_id)) is None
        assert db.scalar(select(Enrollment.id).where(Enrollment.student_id == student_id)) is None
        assert db.scalar(select(FaceSample.id).where(FaceSample.student_id == student_id)) is None
        assert db.scalar(select(Course.id).where(Course.code == 'CSE 3101')) is not None
        assert db.scalar(select(User.id).where(User.email == 'admin@kuet.ac.bd')) is not None


def test_student_admin_can_manage_enrollments_but_not_teacher_assignments():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()

    with SessionLocal() as db:
        teacher = db.scalar(select(User).where(User.email == 'teacher1@kuet.ac.bd'))
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        roster = StudentRoster(
            full_name='Student One',
            roll='2107001',
            email=student.email,
            department='CSE',
            session='2025-2026',
            photo_data=b'\xff\xd8\xff\xe0\x00\x10JFIF' + b'\x00' * 20,
            photo_mime_type='image/jpeg',
        )
        db.add(roster)
        db.flush()
        student.profile.roster_id = roster.id
        student.profile.session = roster.session
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
    assert assign_teacher.status_code == 403, assign_teacher.text

    enroll = client.post(
        '/api/admin/student-enrollments',
        headers={'Authorization': f'Bearer {token}'},
        json={'course_id': course.id, 'semester': '3-1', 'student_ids': [student.id]},
    )
    assert enroll.status_code == 200, enroll.text
    assert enroll.json()['saved'] == 1
    with SessionLocal() as db:
        assert db.scalar(
            select(CourseRosterAssignment.id).where(
                CourseRosterAssignment.course_id == course.id,
                CourseRosterAssignment.roster_id == roster.id,
            )
        ) is not None

    course_students = client.get(
        f'/api/admin/courses/{course.id}/students',
        headers={'Authorization': f'Bearer {token}'},
    )
    assert course_students.status_code == 200, course_students.text
    assert course_students.json() == [{
        'roster_id': roster.id,
        'roll': '2107001',
        'enrolled': True,
    }]
    student_records = client.get('/api/admin/students', headers={'Authorization': f'Bearer {token}'})
    assert student_records.status_code == 200, student_records.text
    assert student_records.json()[0]['name'] == 'Student One'
    assert not {'attendance', 'risk', 'status'} & student_records.json()[0].keys()

    updated_assignments = client.put(
        f'/api/admin/courses/{course.id}/students',
        headers={'Authorization': f'Bearer {token}'},
        json={'semester': '3-1', 'roll_input': ''},
    )
    assert updated_assignments.status_code == 422, updated_assignments.text
    with SessionLocal() as db:
        assert db.scalar(select(Enrollment.id).where(Enrollment.course_id == course.id)) is not None
        assert db.scalar(select(CourseRosterAssignment.id).where(CourseRosterAssignment.course_id == course.id)) is not None
    add_registered = client.put(
        f'/api/admin/courses/{course.id}/students',
        headers={'Authorization': f'Bearer {token}'},
        json={'semester': '3-1', 'roll_input': '2107001'},
    )
    assert add_registered.status_code == 200, add_registered.text
    assert add_registered.json()['added'] == 0
    with SessionLocal() as db:
        assert db.scalar(select(Enrollment.id).where(Enrollment.course_id == course.id)) is not None
        assert db.scalar(select(CourseRosterAssignment.id).where(CourseRosterAssignment.course_id == course.id)) is not None


def test_admin_can_assign_only_active_roster_students_before_registration():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()
    with SessionLocal() as db:
        roster_student = StudentRoster(
            full_name='Roster Only Student',
            roll='2107002',
            email='rosteronly@stud.kuet.ac.bd',
            department='CSE',
            session='2025-2026',
            is_active=True,
        )
        course = Course(
            code='CSE 3200',
            title='System Development Project',
            department='CSE',
            semester='3-2',
            session='2025-2026',
            course_type='Theory',
            credit=3.0,
        )
        db.add_all([roster_student, course])
        first_roster_student = StudentRoster(
            full_name='Roster Only Student One',
            roll='2107001',
            email='rosteronly1@stud.kuet.ac.bd',
            department='CSE',
            session='2025-2026',
            is_active=True,
        )
        db.add(first_roster_student)
        db.flush()
        first_roster_id = first_roster_student.id
        db.commit()
        roster_id, course_id = roster_student.id, course.id

    headers = {'Authorization': f'Bearer {token}'}
    listed = client.get(f'/api/admin/courses/{course_id}/students', headers=headers)
    assert listed.status_code == 200, listed.text
    assert listed.json() == [
        {'roster_id': first_roster_id, 'roll': '2107001', 'enrolled': False},
        {'roster_id': roster_id, 'roll': '2107002', 'enrolled': False},
    ]

    assigned = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': '2107002'},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()['saved'] == 1
    assigned_rows = client.get(f'/api/admin/courses/{course_id}/students', headers=headers)
    assert assigned_rows.status_code == 200, assigned_rows.text
    assert assigned_rows.json() == [
        {'roster_id': first_roster_id, 'roll': '2107001', 'enrolled': False},
        {'roster_id': roster_id, 'roll': '2107002', 'enrolled': True},
    ]
    add_another = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': '2107001'},
    )
    assert add_another.status_code == 200, add_another.text
    assert add_another.json()['added'] == 1
    persisted_after_second_add = client.get(f'/api/admin/courses/{course_id}/students', headers=headers)
    assert persisted_after_second_add.status_code == 200, persisted_after_second_add.text
    assert persisted_after_second_add.json() == [
        {'roster_id': first_roster_id, 'roll': '2107001', 'enrolled': True},
        {'roster_id': roster_id, 'roll': '2107002', 'enrolled': True},
    ]
    range_assigned = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': '2107001 - 2107002'},
    )
    assert range_assigned.status_code == 200, range_assigned.text
    assert range_assigned.json()['saved'] == 2
    with SessionLocal() as db:
        assert db.scalar(
            select(CourseRosterAssignment.id).where(
                CourseRosterAssignment.course_id == course_id,
                CourseRosterAssignment.roster_id == roster_id,
            )
        ) is not None
        assert db.scalar(
            select(CourseRosterAssignment.id).where(
                CourseRosterAssignment.course_id == course_id,
                CourseRosterAssignment.roster_id == first_roster_id,
            )
        ) is not None
        assert db.query(Enrollment).filter_by(course_id=course_id).count() == 0

    non_roster_student = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': '9999999'},
    )
    assert non_roster_student.status_code == 400

    invalid_roll_format = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': 'not-a-roll'},
    )
    assert invalid_roll_format.status_code == 422
    invalid_roll_length = client.put(
        f'/api/admin/courses/{course_id}/students',
        headers=headers,
        json={'semester': '3-2', 'roll_input': '2207001-22070120'},
    )
    assert invalid_roll_length.status_code == 422


def test_student_courses_are_limited_to_admin_assignments():
    reset_db()
    client = TestClient(app)
    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        roster = StudentRoster(
            full_name='Student One',
            roll='2107001',
            email=student.email,
            department='CSE',
            session='2025-2026',
            is_active=True,
        )
        assigned_course = Course(
            code='CSE 3101',
            title='Assigned Course',
            department='CSE',
            semester='3-1',
            session='2025-2026',
            course_type='Theory',
            credit=3.0,
        )
        unassigned_course = Course(
            code='CSE 3102',
            title='Unassigned Course',
            department='CSE',
            semester='3-1',
            session='2025-2026',
            course_type='Theory',
            credit=3.0,
        )
        db.add_all([roster, assigned_course, unassigned_course])
        db.flush()
        student.profile.roster_id = roster.id
        student.profile.session = roster.session
        db.add_all([
            Enrollment(student_id=student.id, course_id=assigned_course.id, semester='3-1'),
            Enrollment(student_id=student.id, course_id=unassigned_course.id, semester='3-1'),
            CourseRosterAssignment(course_id=assigned_course.id, roster_id=roster.id),
        ])
        assigned_course_id = assigned_course.id
        db.commit()
        student_token = create_token(student)

    headers = {'Authorization': f'Bearer {student_token}'}
    listed = client.get('/api/students/me/enrollments', headers=headers)
    assert listed.status_code == 200, listed.text
    assert [course['id'] for group in listed.json() for course in group['courses']] == [assigned_course_id]

    dashboard = client.get('/api/students/me/dashboard', headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    assert [course['id'] for course in dashboard.json()['courses']] == [assigned_course_id]

    attempted_self_enrollment = client.put(
        '/api/students/me/enrollments',
        headers=headers,
        json={'semester': '3-1', 'course_ids': [assigned_course_id]},
    )
    assert attempted_self_enrollment.status_code == 403, attempted_self_enrollment.text


def test_admin_can_archive_all_courses_without_deleting_course_history():
    reset_db()
    client = TestClient(app)
    token = get_admin_token()
    with SessionLocal() as db:
        student = db.scalar(select(User).where(User.email == 'student1@stud.kuet.ac.bd'))
        course = Course(
            code='CSE 3101',
            title='Theory of Computation',
            department='CSE',
            semester='3-1',
            session='2025-2026',
            course_type='Theory',
            credit=3.0,
        )
        db.add(course)
        db.flush()
        class_session = ClassSession(
            course_id=course.id,
            start_at='2024-01-15T09:00:00',
            end_at='2024-01-15T10:00:00',
            room='CSE 201',
            status='completed',
        )
        db.add_all([
            Enrollment(student_id=student.id, course_id=course.id, semester='3-1'),
            class_session,
        ])
        db.flush()
        db.add(Attendance(session_id=class_session.id, student_id=student.id, status='present', method='face'))
        course_id = course.id
        db.commit()

    response = client.delete('/api/admin/courses', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200, response.text
    assert response.json() == {'archived': 1, 'history_preserved': True}
    with SessionLocal() as db:
        assert db.get(Course, course_id).is_active is False
        assert db.query(Enrollment).filter_by(course_id=course_id).count() == 1
        assert db.query(ClassSession).filter_by(course_id=course_id).count() == 1
        assert db.query(Attendance).count() == 1


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


def test_student_admin_can_read_student_records_but_not_system_data():
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
    assert teachers.status_code == 403, teachers.text

    students = client.get('/api/admin/students', headers={'Authorization': f'Bearer {token}'})
    assert students.status_code == 200, students.text
    student_payload = students.json()
    listed_student = next(item for item in student_payload if item['roll'] == '2107001')
    assert not {'attendance', 'risk', 'status'} & listed_student.keys()

    alerts = client.get('/api/admin/security-alerts', headers={'Authorization': f'Bearer {token}'})
    assert alerts.status_code == 403, alerts.text

    settings = client.get('/api/admin/settings', headers={'Authorization': f'Bearer {token}'})
    assert settings.status_code == 403, settings.text
