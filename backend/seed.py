"""Fill the database with starting data.

    python seed.py            courses + teacher/admin accounts
    python seed.py --demo     ...plus a demo student with 7 weeks of attendance
    python seed.py --reset    delete EVERYTHING first, then seed (add --demo if you want)

The course list below is SAMPLE data. Replace it with the real KUET course list.
"""
import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, select

from app.database import Base, SessionLocal, engine
from app.models import (
    Attendance, ClassSession, Course, Enrollment, FaceSample, StudentProfile, User,
)
from app.security import hash_password

# (code, title, credit, department, semester, type)
COURSES = [
    ("CSE 3101", "Theory of Computation", 3.0, "CSE", "3-1", "Theory"),
    ("CSE 3103", "Microprocessors and Microcontrollers", 3.0, "CSE", "3-1", "Theory"),
    ("CSE 3104", "Microprocessors Lab", 1.5, "CSE", "3-1", "Lab"),
    ("CSE 3105", "Software Engineering", 3.0, "CSE", "3-1", "Theory"),
    ("CSE 3107", "Computer Architecture", 3.0, "CSE", "3-1", "Theory"),
    ("CSE 3200", "System Development Project", 1.5, "CSE", "3-2", "Lab"),
    ("CSE 3211", "Computer Networks", 3.0, "CSE", "3-2", "Theory"),
    ("CSE 3212", "Computer Networks Lab", 1.5, "CSE", "3-2", "Lab"),
    ("CSE 3221", "Operating Systems", 3.0, "CSE", "3-2", "Theory"),
    ("CSE 3231", "Database Management Systems", 3.0, "CSE", "3-2", "Theory"),
    ("MATH 3201", "Numerical Methods", 3.0, "CSE", "3-2", "Theory"),
    ("CSE 4101", "Artificial Intelligence", 3.0, "CSE", "4-1", "Theory"),
    ("CSE 4103", "Compiler Design", 3.0, "CSE", "4-1", "Theory"),
    ("EEE 3201", "Power Electronics", 3.0, "EEE", "3-2", "Theory"),
    ("EEE 3203", "Control Systems", 3.0, "EEE", "3-2", "Theory"),
]

STAFF = [
    ("admin@kuet.ac.bd", "System Admin", "admin", "admin123"),
    ("teacher@kuet.ac.bd", "Sk Md Masudul Ahsan", "teacher", "teacher123"),
]

DEMO_EMAIL = "demo@stud.kuet.ac.bd"
# course code -> (target attendance rate, weekday 0=Mon, hour, room)
DEMO_PLAN = {
    "CSE 3200": (0.94, 6, 14, "Lab 2"),        # full marks
    "CSE 3211": (0.86, 0, 9, "Room 301"),      # partial
    "CSE 3212": (0.92, 1, 14, "Lab 4"),        # full
    "CSE 3221": (0.55, 2, 10, "Room 302"),     # incomplete
    "CSE 3231": (0.73, 3, 9, "Room 105"),      # partial
    "MATH 3201": (0.97, 0, 11, "Room 204"),    # full
}
PAST_WEEKS, FUTURE_WEEKS = 7, 2


def seed_basics(db):
    for code, title, credit, dept, sem, kind in COURSES:
        if not db.scalar(select(Course).where(Course.code == code)):
            db.add(Course(code=code, title=title, credit=credit, department=dept, semester=sem, course_type=kind))
    for email, name, role, password in STAFF:
        if not db.scalar(select(User).where(User.email == email)):
            db.add(User(email=email, name=name, role=role, password_hash=hash_password(password)))
    db.commit()
    teacher = db.scalar(select(User).where(User.role == "teacher"))
    for course in db.scalars(select(Course).where(Course.teacher_id.is_(None))):
        course.teacher_id = teacher.id
    db.commit()
    print(f"Courses: {len(COURSES)}  Staff accounts: {len(STAFF)}")


def seed_demo(db):
    rng = random.Random(42)
    student = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if student:  # start fresh each time
        db.execute(delete(Attendance).where(Attendance.student_id == student.id))
        db.execute(delete(Enrollment).where(Enrollment.student_id == student.id))
        db.execute(delete(FaceSample).where(FaceSample.student_id == student.id))
        db.execute(delete(StudentProfile).where(StudentProfile.user_id == student.id))
    else:
        student = User(email=DEMO_EMAIL, name="Demo Student", role="student")
        db.add(student)
        db.flush()
    db.add(StudentProfile(
        user_id=student.id, roll="2107001", full_name="Demo Student", department="CSE",
        series="2021", section="A", current_semester="3-2", face_status="submitted",
    ))

    today = date.today()
    this_monday = today - timedelta(days=today.weekday())
    for code, (rate, weekday, hour, room) in DEMO_PLAN.items():
        course = db.scalar(select(Course).where(Course.code == code))
        db.add(Enrollment(
            student_id=student.id, course_id=course.id, semester="3-2",
            created_at=datetime.combine(this_monday - timedelta(weeks=PAST_WEEKS, days=1), time(9)),
        ))
        db.execute(delete(ClassSession).where(ClassSession.course_id == course.id))

        past = []
        for w in range(-PAST_WEEKS, FUTURE_WEEKS + 1):
            day = this_monday + timedelta(weeks=w, days=weekday)
            start = datetime.combine(day, time(hour))
            finished = start + timedelta(hours=1) < datetime.now()
            session = ClassSession(
                course_id=course.id, start_at=start, end_at=start + timedelta(hours=1),
                room=room, status="completed" if finished else "scheduled",
            )
            db.add(session)
            if finished:
                past.append(session)
        db.flush()

        attend_count = round(rate * len(past))
        attended = rng.sample(past, attend_count)
        for s in attended:
            late = rng.random() < 0.15
            db.add(Attendance(
                session_id=s.id, student_id=student.id,
                status="late" if late else "present",
                marked_at=s.start_at + timedelta(minutes=rng.randint(12, 20) if late else rng.randint(0, 6)),
                method="face", confidence=round(rng.uniform(0.62, 0.9), 2),
            ))
    db.commit()
    print(f"Demo student: {DEMO_EMAIL} (use Dev login), {PAST_WEEKS} weeks of attendance")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_basics(db)
        if "--demo" in sys.argv:
            seed_demo(db)
