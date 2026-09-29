from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'attendance.db'}"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 720
    google_client_id: str = ""
    student_email_domain: str = "stud.kuet.ac.bd"
    dev_login_enabled: bool = True
    frontend_origin: str = "http://localhost:5173"
    storage_dir: Path = BASE_DIR / "storage"


settings = Settings()
