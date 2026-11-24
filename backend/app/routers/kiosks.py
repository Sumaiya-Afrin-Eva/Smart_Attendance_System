import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DepartmentKiosk, User
from ..security import get_current_user, require_role, hash_password
from ..config import settings

router = APIRouter(prefix="/api/admin/kiosks", tags=["kiosks"])
super_admin_only = require_role("super_admin")
admin_or_super = require_role("admin", "system_admin", "eee_system_admin", "eee_admin", "super_admin")


class CreateKioskIn(BaseModel):
    dept_code: str = Field(min_length=2, max_length=15)
    dept_name: str = Field(min_length=2, max_length=120)
    location: str | None = None
    system_admin_email: EmailStr
    system_admin_password: str = Field(min_length=6, max_length=128)
    system_admin_name: str | None = None
    student_admin_email: EmailStr
    student_admin_password: str = Field(min_length=6, max_length=128)
    student_admin_name: str | None = None
    access_code: str | None = None
    notes: str | None = None


def _ensure_default_kiosks(db: Session):
    """Seed default CSE and EEE kiosk entries if not already in department_kiosks."""
    defaults = [
        {
            "dept_code": "CSE",
            "dept_name": "Department of Computer Science and Engineering",
            "kiosk_id": "CSE",
            "location": "CSE Building, Ground Floor Lab 103",
            "system_admin_email": "sysadmin@kuet.ac.bd",
            "student_admin_email": "admin@kuet.ac.bd",
            "status": "Active",
            "access_code": "sysadmin123",
        },
        {
            "dept_code": "EEE",
            "dept_name": "Department of Electrical and Electronic Engineering",
            "kiosk_id": "EEE",
            "location": "EEE Building, Ground Floor Entrance",
            "system_admin_email": "eee.system.admin@kuet.ac.bd",
            "student_admin_email": "eee.student.admin@kuet.ac.bd",
            "status": "Active",
            "access_code": "eeesysadmin123",
        },
    ]
    for d in defaults:
        existing = db.scalar(select(DepartmentKiosk).where(DepartmentKiosk.dept_code == d["dept_code"]))
        if not existing:
            db.add(DepartmentKiosk(
                dept_code=d["dept_code"],
                dept_name=d["dept_name"],
                kiosk_id=d["kiosk_id"],
                location=d["location"],
                system_admin_email=d["system_admin_email"],
                student_admin_email=d["student_admin_email"],
                status=d["status"],
                access_code=d["access_code"],
            ))
    db.commit()


def _format_kiosk_out(kiosk: DepartmentKiosk, db: Session) -> dict:
    dept_upper = kiosk.dept_code.strip().upper()
    dept_slug = dept_upper.lower()

    sys_user = None
    if kiosk.system_admin_email:
        sys_user = db.scalar(select(User).where(User.email == kiosk.system_admin_email.strip().lower()))

    std_user = None
    if kiosk.student_admin_email:
        std_user = db.scalar(select(User).where(User.email == kiosk.student_admin_email.strip().lower()))

    sys_role = "system_admin" if dept_upper == "CSE" else (
        "eee_system_admin" if dept_upper == "EEE" else f"{dept_slug}_system_admin"
    )
    std_role = "admin" if dept_upper == "CSE" else (
        "eee_admin" if dept_upper == "EEE" else f"{dept_slug}_admin"
    )

    sys_path = "/admin/system-admin" if dept_upper == "CSE" else (
        "/admin/eee-system-admin" if dept_upper == "EEE" else f"/admin/{dept_slug}-system-admin"
    )
    std_path = "/admin/student-admin" if dept_upper == "CSE" else (
        "/admin/eee-student-admin" if dept_upper == "EEE" else f"/admin/{dept_slug}-student-admin"
    )

    return {
        "id": kiosk.id,
        "dept_code": dept_upper,
        "dept_name": kiosk.dept_name,
        "kiosk_id": kiosk.kiosk_id or dept_upper,
        "location": kiosk.location or f"{dept_upper} Academic Building",
        "status": kiosk.status or "Configured",
        "kiosk_url": f"/kiosk/{dept_slug}",
        "access_code": kiosk.access_code or "admin123",
        "notes": kiosk.notes,
        "system_admin_email": kiosk.system_admin_email,
        "student_admin_email": kiosk.student_admin_email,
        "system_admin_dashboard": sys_path,
        "student_admin_dashboard": std_path,
        "system_admin": {
            "email": kiosk.system_admin_email,
            "name": sys_user.name if sys_user else f"{dept_upper} System Administrator",
            "role": sys_role,
            "path": sys_path,
            "is_active": sys_user.is_active if sys_user else True,
        },
        "student_admin": {
            "email": kiosk.student_admin_email,
            "name": std_user.name if std_user else f"{dept_upper} Student Administrator",
            "role": std_role,
            "path": std_path,
            "is_active": std_user.is_active if std_user else True,
        },
        "created_at": kiosk.created_at.isoformat() if kiosk.created_at else None,
        "updated_at": kiosk.updated_at.isoformat() if kiosk.updated_at else None,
    }


@router.get("")
def list_kiosks(db: Session = Depends(get_db), user: User = Depends(admin_or_super)):
    """List all registered department kiosks and associated admin dashboard access."""
    _ensure_default_kiosks(db)
    kiosks = db.scalars(select(DepartmentKiosk).order_by(DepartmentKiosk.id)).all()
    return [_format_kiosk_out(k, db) for k in kiosks]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_department_kiosk(
    body: CreateKioskIn,
    db: Session = Depends(get_db),
    user: User = Depends(super_admin_only),
):
    """Super Admin creates a new department kiosk and automatically provisions
    independent System Admin and Student Admin dashboards.
    """
    _ensure_default_kiosks(db)

    # 1. Normalize department code (e.g. ME, CE, ECE)
    raw_dept = re.sub(r"[^A-Za-z0-9]", "", body.dept_code.strip()).upper()
    if not raw_dept:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid department code.")
    dept_slug = raw_dept.lower()

    # 2. Check if department kiosk already exists
    existing_kiosk = db.scalar(select(DepartmentKiosk).where(DepartmentKiosk.dept_code == raw_dept))
    if existing_kiosk:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Kiosk for department '{raw_dept}' already exists.")

    sys_email = body.system_admin_email.strip().lower()
    std_email = body.student_admin_email.strip().lower()

    if sys_email == std_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System Admin and Student Admin emails must be different.")

    # 3. Check if emails already exist in users
    if db.scalar(select(User.id).where(User.email == sys_email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"User with email '{sys_email}' already exists.")

    if db.scalar(select(User.id).where(User.email == std_email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"User with email '{std_email}' already exists.")

    # 4. Provision System Admin user
    sys_role = f"{dept_slug}_system_admin"
    sys_name = body.system_admin_name.strip() if body.system_admin_name else f"{raw_dept} System Administrator"
    sys_user = User(
        email=sys_email,
        name=sys_name,
        role=sys_role,
        password_hash=hash_password(body.system_admin_password),
        is_active=True,
    )
    db.add(sys_user)

    # 5. Provision Student Admin user
    std_role = f"{dept_slug}_admin"
    std_name = body.student_admin_name.strip() if body.student_admin_name else f"{raw_dept} Student Administrator"
    std_user = User(
        email=std_email,
        name=std_name,
        role=std_role,
        password_hash=hash_password(body.student_admin_password),
        is_active=True,
    )
    db.add(std_user)

    # 6. Create DepartmentKiosk record
    access_code = body.access_code.strip() if body.access_code else "admin123"
    kiosk = DepartmentKiosk(
        dept_code=raw_dept,
        dept_name=body.dept_name.strip(),
        kiosk_id=raw_dept,
        location=body.location.strip() if body.location else f"{raw_dept} Academic Building",
        system_admin_email=sys_email,
        student_admin_email=std_email,
        status="Configured",
        access_code=access_code,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(kiosk)
    db.commit()
    db.refresh(kiosk)

    return {
        "message": f"Successfully created {raw_dept} Kiosk and provisioned {raw_dept} System Admin and Student Admin dashboards.",
        "kiosk": _format_kiosk_out(kiosk, db),
    }


@router.delete("/{dept_code}")
def delete_department_kiosk(
    dept_code: str,
    db: Session = Depends(get_db),
    user: User = Depends(super_admin_only),
):
    """Delete a custom department kiosk and deactivate associated admins. Default CSE and EEE cannot be removed."""
    clean_dept = dept_code.strip().upper()
    if clean_dept in {"CSE", "EEE"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Default core department kiosk '{clean_dept}' cannot be deleted.")

    kiosk = db.scalar(select(DepartmentKiosk).where(DepartmentKiosk.dept_code == clean_dept))
    if not kiosk:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Department kiosk '{clean_dept}' not found.")

    if kiosk.system_admin_email:
        sys_u = db.scalar(select(User).where(User.email == kiosk.system_admin_email))
        if sys_u:
            db.delete(sys_u)
    if kiosk.student_admin_email:
        std_u = db.scalar(select(User).where(User.email == kiosk.student_admin_email))
        if std_u:
            db.delete(std_u)

    db.delete(kiosk)
    db.commit()

    return {"message": f"Department kiosk '{clean_dept}' and its admin accounts have been deleted."}
