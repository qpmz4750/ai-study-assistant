"""Environment-backed application settings."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = BASE_DIR / "data"


def _path_from_env(name: str, default: Path) -> Path:
    return Path(os.getenv(name, str(default))).expanduser().resolve()


def _cors_origins() -> tuple[str, ...]:
    defaults = "http://localhost:3000,http://127.0.0.1:3000"
    raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", defaults)
    return tuple(origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    data_dir: Path = _path_from_env("DATA_DIR", DEFAULT_DATA_DIR)
    db_path: Path = _path_from_env("DB_PATH", DEFAULT_DATA_DIR / "app.db")
    chroma_dir: Path = _path_from_env("CHROMA_DIR", DEFAULT_DATA_DIR / "chroma")
    upload_dir: Path = _path_from_env("UPLOAD_DIR", DEFAULT_DATA_DIR / "uploads")
    cors_allowed_origins: tuple[str, ...] = _cors_origins()
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expire_minutes: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))


settings = Settings()
