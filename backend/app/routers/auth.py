import logging

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import DevLoginIn, GoogleLoginIn, PasswordLoginIn
from ..security import create_token, get_current_user, verify_password
from ..services import onboarding_status, user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _session_response(db: Session, user: User) -> dict:
    return {
        "access_token": create_token(user),
        "user": user_out(user),
        "onboarding": onboarding_status(db, user),
    }


def _login_or_register_student(db: Session, email: str, name: str, picture: str | None) -> User:
    """Existing account -> log in. New account -> register as student, but ONLY with a varsity email."""
    email = email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        if not user.is_active:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact the admin.")
        if picture and user.picture != picture:
            user.picture = picture
            db.commit()
        return user

    domain = settings.student_email_domain.lower()
    if not email.endswith("@" + domain):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Please sign in with your KUET student email (@{domain}).",
        )
    user = User(email=email, name=name or email.split("@")[0], role="student", picture=picture)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login_or_register_staff(db: Session, email: str, name: str, picture: str | None) -> User:
    """Allow staff (teacher/admin) to sign in via Google, but ONLY if their
    account was pre-created by the admin. We do NOT auto-register new teachers.
    """
    email = email.lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account has not been registered by the admin yet. "
            "Contact the system administrator to get access.",
        )
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact the admin.")
    if user.role not in {"teacher", "admin"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This login method is for faculty and staff only.")
    if picture and user.picture != picture:
        user.picture = picture
        db.commit()
    return user


def _verify_google_access_token(access_token: str) -> dict:
    """Exchange a Google OAuth2 access token for user info via Google's userinfo API.

    This is used by the popup-based login flow (useGoogleLogin) which returns an
    access token instead of an ID token. The access token cannot be verified
    cryptographically like an ID token, but calling Google's userinfo endpoint
    with it is the standard way to authenticate.
    """
    try:
        resp = http_requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        info = resp.json()
    except http_requests.RequestException as exc:
        logger.error("Google userinfo request failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Could not verify your Google account right now. Please check your internet connection and try again.",
        )

    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This Google account has no verified email.")

    return info


def _verify_google_id_token(credential: str) -> dict:
    """Verify a Google ID token (JWT) using Google's public keys.

    This is the legacy flow used by the <GoogleLogin> component's iframe/One Tap
    approach. Kept for backward compatibility.
    """
    try:
        info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=10,
        )
    except ValueError as exc:
        logger.warning("Google ID token verification failed: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified. Please try again.")
    except Exception as exc:
        logger.error("Google token verification unexpected error: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Could not verify your Google account right now. Please check your internet connection and try again.",
        )

    if not info.get("email") or not info.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This Google account has no verified email.")

    return info


@router.post("/google")
def google_login(body: GoogleLoginIn, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google login is not configured on the server.")

    credential = body.credential

    # Detect whether we received an access token or an ID token (JWT).
    # JWTs have 3 dot-separated base64 segments; access tokens are opaque strings.
    is_jwt = credential.count(".") == 2 and len(credential) > 100

    if is_jwt:
        # Legacy: ID token from the <GoogleLogin> iframe / One Tap flow
        info = _verify_google_id_token(credential)
    else:
        # New: access token from the useGoogleLogin popup flow
        info = _verify_google_access_token(credential)

    email = info["email"].lower()
    if email.endswith("@" + settings.student_email_domain.lower()):
        user = _login_or_register_student(db, email, info.get("name", ""), info.get("picture"))
    elif email.endswith("@kuet.ac.bd"):
        user = _login_or_register_staff(db, email, info.get("name", ""), info.get("picture"))
    else:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only KUET academic emails or student emails are allowed to sign in.",
        )

    return _session_response(db, user)


@router.post("/dev-login")
def dev_login(body: DevLoginIn, db: Session = Depends(get_db)):
    """Testing only: behaves like Google login without contacting Google."""
    if not settings.dev_login_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    user = _login_or_register_student(db, body.email, body.name or "", None)
    return _session_response(db, user)


@router.post("/login")
def password_login(body: PasswordLoginIn, db: Session = Depends(get_db)):
    """Email + password login — for teachers and admins only.
    The account must:
      1. Exist in the database (pre-created by admin).
      2. Have role 'teacher' or 'admin'.
      3. Have a password set (admin must have assigned one).
      4. Match the stored bcrypt hash exactly.
    """
    user = db.scalar(select(User).where(User.email == body.email.lower()))

    # Reject if account doesn't exist, wrong role, no password set, or wrong password.
    # We deliberately use the same generic error for all cases to prevent
    # user-enumeration attacks.
    if (
        not user
        or user.role not in {"teacher", "admin"}
        or not user.password_hash
        or not verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact the admin.")

    return _session_response(db, user)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": user_out(user), "onboarding": onboarding_status(db, user)}
