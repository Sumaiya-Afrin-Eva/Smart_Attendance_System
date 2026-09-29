from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..marks import RULE
from ..models import Course, User
from ..schemas import DEPARTMENTS, SEMESTERS
from ..security import get_current_user
from ..services import course_out

router = APIRouter(prefix="/api", tags=["courses"])


@router.get("/meta")
def meta():
    return {"departments": DEPARTMENTS, "semesters": SEMESTERS, "marking_rule": RULE}


@router.get("/courses")
def list_courses(
    department: str | None = None,
    semester: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Course).order_by(Course.code)
    if department:
        query = query.where(Course.department == department)
    if semester:
        query = query.where(Course.semester == semester)
    return [course_out(c) for c in db.scalars(query)]
