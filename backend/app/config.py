from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'attendance.db'}"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    admin_access_code: str = ""
    google_client_id: str = ""
    student_email_domain: str = "stud.kuet.ac.bd"
    dev_login_enabled: bool = True
    frontend_origin: str = "http://localhost:5173"
    frontend_origins: str = ""
    storage_dir: Path = BASE_DIR / "storage"

    @field_validator("database_url", mode="after")
    @classmethod
    def resolve_sqlite_path(cls, v: str) -> str:
        if v.startswith("sqlite:///.") or v == "sqlite:///attendance.db":
            db_name = v.split("///")[-1].lstrip("./")
            return f"sqlite:///{BASE_DIR / db_name}"
        return v


settings = Settings()
