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
    Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # student | teacher | admin
    picture: Mapped[str | None] = mapped_column(String(500))
    password_hash: Mapped[str | None] = mapped_column(String(200))  # staff only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

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
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    user: Mapped[User] = relationship(back_populates="profile")


class FaceSample(Base):
    __tablename__ = "face_samples"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    title: Mapped[str] = mapped_column(String(150))
    credit: Mapped[float] = mapped_column(Float, default=3.0)
    department: Mapped[str] = mapped_column(String(40), index=True)
    semester: Mapped[str] = mapped_column(String(5), index=True)  # "3-2"
    course_type: Mapped[str] = mapped_column(String(10), default="Theory")  # Theory | Lab
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "course_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    semester: Mapped[str] = mapped_column(String(5))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    course: Mapped[Course] = relationship()


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    room: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled | ongoing | completed | cancelled

    course: Mapped[Course] = relationship()


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("class_sessions.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(10))  # present | late
    marked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    method: Mapped[str] = mapped_column(String(10), default="face")  # face | manual | backup
    confidence: Mapped[float | None] = mapped_column(Float)
