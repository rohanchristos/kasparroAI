"""
Kasparro AI Agent — Application Settings (Pydantic BaseSettings).

All environment variables are typed, validated, and documented.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Strongly-typed application configuration loaded from .env."""

    # ── LLM Providers ────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    GROK_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""

    # ── Gmail OAuth ──────────────────────────────────────────
    GMAIL_CLIENT_ID: str = ""
    GMAIL_CLIENT_SECRET: str = ""
    GMAIL_REFRESH_TOKEN: str = ""

    # ── JWT (must match Node.js backend) ─────────────────────
    JWT_SECRET: str = "change-me-in-production"

    # ── Database ─────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/kasparro_db"

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ── Application ──────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost"

    # ── Email Poller ─────────────────────────────────────────
    EMAIL_POLL_INTERVAL: int = 60
    BACKEND_URL: str = "http://nodejs:5000"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
