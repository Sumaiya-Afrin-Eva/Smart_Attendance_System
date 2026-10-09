"""Database tables.

users            every account (student / teacher / admin)
student_profiles roll, department, semester... (one per student)
face_samples     face photos captured at registration
courses          courses offered per department and semester (e.g. CSE, 3-2)
enrollments      which student takes which course
class_sessions   each class held for a course (created by the teacher)
attendance       one row per student who was marked in a session
                 (a completed session with no row = absent)
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime as SQLDateTime, Float, ForeignKey, Integer, String,
    TypeDecorator, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class ISODateTime(TypeDecorator):
    impl = SQLDateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            value = value.strip()
            if value.endswith('Z'):
                value = value[:-1] + '+00:00'
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                return datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # student | teacher | admin
    department: Mapped[str | None] = mapped_column(String(40), default=None)
    designation: Mapped[str | None] = mapped_column(String(60), default=None)  # Lecturer | Assistant Professor | Professor
    education: Mapped[str | None] = mapped_column(String(500), default=None)
    professional_membership: Mapped[str | None] = mapped_column(String(500), default=None)
    research_fields: Mapped[str | None] = mapped_column(String(500), default=None)
    pabx_ext: Mapped[str | None] = mapped_column(String(20), default=None)
    phone: Mapped[str | None] = mapped_column(String(20), default=None)
    website: Mapped[str | None] = mapped_column(String(200), default=None)
    teacher_status: Mapped[str | None] = mapped_column(String(20), default=None)  # Active | On leave | Pending | Disabled
    picture: Mapped[str | None] = mapped_column(String(500), default=None)
    password_hash: Mapped[str | None] = mapped_column(String(200))  # staff only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now)

    profile: Mapped["StudentProfile | None"] = relationship(back_populates="user", uselist=False)


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    roll: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(40))
    series: Mapped[str] = mapped_column(String(10))  # batch year, e.g. "2021"
    section: Mapped[str | None] = mapped_column(String(5))
    current_semester: Mapped[str] = mapped_column(String(5))  # "3-2"
    phone: Mapped[str | None] = mapped_column(String(20))
    face_status: Mapped[str] = mapped_column(String(20), default="none")  # none | submitted | approved
    updated_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now, onupdate=datetime.now)

    user: Mapped[User] = relationship(back_populates="profile")


class FaceSample(Base):
    __tablename__ = "face_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now)


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(300), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    value: Mapped[str | None] = mapped_column(String(500), default=None)
    updated_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now, onupdate=datetime.now)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    title: Mapped[str] = mapped_column(String(150))
    credit: Mapped[float] = mapped_column(Float, default=3.0)
    department: Mapped[str] = mapped_column(String(40), index=True)
    semester: Mapped[str] = mapped_column(String(5), index=True)  # "3-2"
    course_type: Mapped[str] = mapped_column(String(10), default="Theory")  # Theory | Lab
    session: Mapped[str] = mapped_column(String(20), default="Default") # "2025-2026" or "Default"
    section: Mapped[str] = mapped_column(String(10), default="A") # "A", "B", etc.
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="Active") # "Active" or "Inactive"

class CourseStatusLog(Base):
    __tablename__ = "course_status_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_code: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20))
    timestamp: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now)



class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "course_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    semester: Mapped[str] = mapped_column(String(5))
    created_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now)

    course: Mapped[Course] = relationship()


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    start_at: Mapped[datetime] = mapped_column(ISODateTime())
    end_at: Mapped[datetime] = mapped_column(ISODateTime())
    room: Mapped[str | None] = mapped_column(String(40))
    students: Mapped[int | None] = mapped_column(Integer, default=0)
    roll_start: Mapped[str | None] = mapped_column(String(20), default="")
    roll_end: Mapped[str | None] = mapped_column(String(20), default="")
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled | ongoing | completed | cancelled

    course: Mapped[Course] = relationship()


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("class_sessions.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(10))  # present | late
    marked_at: Mapped[datetime] = mapped_column(ISODateTime(), default=datetime.now)
    method: Mapped[str] = mapped_column(String(10), default="face")  # face | manual | backup
    confidence: Mapped[float | None] = mapped_column(Float)
