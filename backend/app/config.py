from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://mrg:mrg_local_dev@localhost:5432/mrg_scanner"
    redis_url: str = "redis://localhost:6379/0"
    frontend_origins: str = "http://localhost:5173"
    media_root: str = "media"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_thinking_level: str = "minimal"
    gemini_request_timeout_seconds: int = 120
    selected_frame_count: int = 8

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
