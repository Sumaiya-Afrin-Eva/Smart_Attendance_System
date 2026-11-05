import os
from pathlib import Path

# Ensure tests always use test_attendance.db and never touch production/dev attendance.db
test_db_path = Path(__file__).resolve().parent.parent / "test_attendance.db"
os.environ["DATABASE_URL"] = f"sqlite:///{test_db_path}"

# Force app.config.settings to use test_attendance.db if loaded
try:
    from app.config import settings
    settings.database_url = f"sqlite:///{test_db_path}"
    from app import database
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    database.engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )
    database.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=database.engine)
except Exception:
    pass
