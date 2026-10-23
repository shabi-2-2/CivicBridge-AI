from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration, loaded from the backend .env file when present."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        # Empty values in .env (e.g. GEMINI_MODEL=) must not become empty strings.
        env_ignore_empty=True,
    )

    app_name: str = "CivicBridge AI API"
    app_env: str = "development"

    # Explicit origins only. No wildcard CORS.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Phase 2 seam. Both stay None until explicitly configured.
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    prompt_version: str | None = None
    gemini_timeout_seconds: float = 15.0
    demo_mode: bool = True

    @field_validator("gemini_timeout_seconds")
    @classmethod
    def validate_gemini_timeout(cls, value: float) -> float:
        if not 1.0 <= value <= 60.0:
            raise ValueError("GEMINI_TIMEOUT_SECONDS must be between 1 and 60 seconds")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: str) -> str:
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if not origins:
            raise ValueError("CORS_ORIGINS must list at least one origin")
        if "*" in origins:
            raise ValueError("CORS_ORIGINS must list explicit origins; '*' is not allowed")
        return ",".join(origins)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
