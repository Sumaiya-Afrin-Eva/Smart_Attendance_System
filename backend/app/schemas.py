import re

from pydantic import BaseModel, EmailStr, Field, field_validator

DEPARTMENTS = ["CSE", "EEE", "ECE", "ME", "CE", "IEM", "BME", "MSE", "URP", "ARCH", "BECM", "LE", "TE", "ChE", "MTE"]
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
