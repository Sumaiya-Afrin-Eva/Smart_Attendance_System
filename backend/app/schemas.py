import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

DEPARTMENTS = ["CSE", "EEE", "ECE", "ME", "CE", "IEM", "BME", "MSE", "URP", "ARCH", "BECM", "LE", "TE", "ChE", "MTE", "PHY", "CHEM", "MATH", "HUM"]
SEMESTERS = [f"{y}-{t}" for y in range(1, 5) for t in (1, 2)]


class GoogleLoginIn(BaseModel):
    credential: str


class DevLoginIn(BaseModel):
    email: EmailStr
    name: str | None = None


class PasswordLoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    roll: str
    department: str
    series: str
    section: str | None = None
    current_semester: str
    phone: str | None = None

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("roll")
    @classmethod
    def check_roll(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{7}", v):
            raise ValueError("Roll must be 7 digits, e.g. 2107001")
        return v

    @field_validator("department")
    @classmethod
    def check_dept(cls, v: str) -> str:
        if v not in DEPARTMENTS:
            raise ValueError("Unknown department")
        return v

    @field_validator("series")
    @classmethod
    def check_series(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"20\d{2}", v):
            raise ValueError("Series must be a year, e.g. 2021")
        return v

    @field_validator("section")
    @classmethod
    def check_section(cls, v: str | None) -> str | None:
        v = (v or "").strip().upper()
        if v and not re.fullmatch(r"[A-Z]", v):
            raise ValueError("Section must be a single letter, e.g. A")
        return v or None

    @field_validator("current_semester")
    @classmethod
    def check_semester(cls, v: str) -> str:
        if v not in SEMESTERS:
            raise ValueError("Semester must look like 3-2")
        return v

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        v = (v or "").strip().replace(" ", "")
        if v and not re.fullmatch(r"(\+?88)?01\d{9}", v):
            raise ValueError("Enter a valid Bangladeshi mobile number")
        return v or None


class EnrollmentIn(BaseModel):
    semester: str
    course_ids: list[int]

    @field_validator("semester")
    @classmethod
    def check_semester(cls, v: str) -> str:
        if v not in SEMESTERS:
            raise ValueError("Semester must look like 3-2")
        return v


class CourseCreateIn(BaseModel):
    code: str = Field(min_length=3, max_length=20)
    title: str = Field(min_length=3, max_length=150)
    department: str
    semester: str
    course_type: str = "Theory"
    credit: float = 3.0
    session: str = "Default"

    @field_validator("session", mode="before")
    @classmethod
    def default_session(cls, v: str | None) -> str:
        v = (v or "").strip()
        return v if v else "Default"

    @field_validator("code")
    @classmethod
    def clean_code(cls, v: str) -> str:
        value = " ".join(v.strip().split()).upper()
        if not re.fullmatch(r"[A-Z]{2,6}\s?\d{3,5}", value):
            raise ValueError("Course code should look like CSE 3101 or MATH2201")
        return value

    @field_validator("title")
    @classmethod
    def clean_title(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("department")
    @classmethod
    def check_department(cls, v: str) -> str:
        if v not in DEPARTMENTS:
            raise ValueError("Unknown department")
        return v

    @field_validator("semester")
    @classmethod
    def check_semester(cls, v: str) -> str:
        if v not in SEMESTERS:
            raise ValueError("Semester must look like 3-2")
        return v

    @field_validator("course_type")
    @classmethod
    def check_type(cls, v: str) -> str:
        value = v.strip().title()
        if value not in {"Theory", "Lab"}:
            raise ValueError("Course type must be Theory or Lab")
        return value

    @field_validator("credit")
    @classmethod
    def check_credit(cls, v: float) -> float:
        if not 0.5 <= v <= 6.0:
            raise ValueError("Credit should be between 0.5 and 6.0")
        return v


class CourseTeacherAssignmentIn(BaseModel):
    teacher_id: int | None = None
    section: str = "A"


class StudentCourseEnrollmentIn(BaseModel):
    course_id: int
    semester: str
    student_ids: list[int]

    @field_validator("semester")
    @classmethod
    def check_semester(cls, v: str) -> str:
        if v not in SEMESTERS:
            raise ValueError("Semester must look like 3-2")
        return v


class AdminStudentCreateIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    roll: str
    email: EmailStr
    session: str
    department: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return " ".join(v.split())

    @field_validator("roll")
    @classmethod
    def check_roll(cls, v: str) -> str:
        value = v.strip()
        if not re.fullmatch(r"\d{7}", value):
            raise ValueError("Roll must be 7 digits, e.g. 2107001")
        return value

    @field_validator("department")
    @classmethod
    def check_department(cls, v: str) -> str:
        if v not in DEPARTMENTS:
            raise ValueError("Unknown department")
        return v

    @field_validator("session")
    @classmethod
    def check_session(cls, v: str) -> str:
        value = v.strip()
        if not re.fullmatch(r"\d{4}-\d{4}", value):
            raise ValueError("Session must look like 2021-2022")
        return value

class ClassSessionCreateIn(BaseModel):
    course_id: int
    start_at: datetime
    end_at: datetime
    room: str | None = None
    students: int | None = 0
    roll_start: str | None = ""
    roll_end: str | None = ""
