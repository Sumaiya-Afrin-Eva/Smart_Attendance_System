from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR.parent / 'attendance.db'}"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    admin_access_code: str = ""
    google_client_id: str = ""
    gemini_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    student_email_domain: str = "stud.kuet.ac.bd"
    dev_login_enabled: bool = True
    frontend_origin: str = "http://localhost:5173"
    frontend_origins: str = ""
    storage_dir: Path = BASE_DIR / "storage"
    picture_dir: Path = BASE_DIR.parent / "picture"

    @field_validator("database_url", mode="after")
    @classmethod
    def resolve_sqlite_path(cls, v: str) -> str:
        prefix = "sqlite:///"
        if v.startswith(prefix):
            raw_path = v[len(prefix):]
            if raw_path == ":memory:":
                return v
            db_path = Path(raw_path)
            if not db_path.is_absolute():
                db_path = BASE_DIR / db_path
            return f"{prefix}{db_path.resolve()}"
        return v


settings = Settings()
