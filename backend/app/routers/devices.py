from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import DeviceReset, StudentProfile, User
from ..security import require_role

router = APIRouter(prefix="/api/admin/students", tags=["admin"])
admin_only = require_role("admin", "system_admin")


@router.post("/{roster_id}/reset-device")
def reset_student_device(
    roster_id: int,
    admin: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    profile = db.scalar(select(StudentProfile).where(StudentProfile.roster_id == roster_id))
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student profile not found.")
    if profile.device_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This student has no registered device.")

    db.add(
        DeviceReset(
            student_id=profile.user_id,
            old_device_id=profile.device_id,
            reset_by=admin.email,
        )
    )
    profile.device_id = None
    profile.device_bound_at = None
    db.commit()
    return {"status": "reset", "student_id": roster_id}
