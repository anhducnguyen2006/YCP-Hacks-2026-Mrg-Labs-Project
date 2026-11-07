from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://mrg:mrg_local_dev@localhost:5432/mrg_scanner"
    redis_url: str = "redis://localhost:6379/0"
    frontend_origins: str = "http://localhost:5173"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_fallback_model: str | None = None
    gemini_input_mode: str = "frames"
    gemini_video_fps: str | None = None
    gemini_frame_fps: float = 6
    gemini_max_frames: int = 12
    gemini_max_attempts: int = 3
    gemini_max_retry_wait_seconds: float = 30
    media_root: str = "/data/media"
    max_video_duration_seconds: int = 15
    max_video_size_bytes: int = 50 * 1024 * 1024
    processing_stale_seconds: int = 300

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
