"""Application settings, validated at startup. ZENT stores nothing: there is no database, no
cache and no key material. Everything here is plain runtime configuration."""

import os
from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # Wraps every API request and response body in AES-GCM (see app/core/payload.py). Unset = plain JSON.
    encryption_key: SecretStr = SecretStr("")

    public_url: str = "http://localhost:3000"
    # Comma-separated in the environment; NoDecode stops pydantic-settings expecting JSON.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])
    cookie_secure: bool | None = None  # default: on everywhere except plain-HTTP local development
    trusted_proxy_count: int = 0  # number of reverse proxies whose X-Forwarded-For is trusted
    max_request_bytes: int = 64 * 1024

    # Login sessions live in this process's memory only, so a restart signs everyone out.
    session_idle_seconds: int = 30 * 60
    session_max_seconds: int = 8 * 3600
    max_sessions: int = 50
    login_max_attempts: int = 10
    login_window_seconds: int = 15 * 60

    ssh_connect_timeout_seconds: int = 10
    ssh_command_timeout_seconds: int = 30
    # Targets on loopback / link-local (incl. cloud metadata 169.254.169.254) are refused so ZENT
    # cannot be aimed at its own host or the metadata service. Tests and local dev may opt in.
    ssh_allow_loopback: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def _validate(self):
        if "*" in self.cors_origins and self.app_env == "production":
            raise ValueError("CORS_ORIGINS must list explicit origins, not '*', in production")
        if self.cookie_secure is None:
            self.cookie_secure = self.app_env != "development"
        if self.app_env == "production":
            if len(self.encryption_key.get_secret_value()) < 16:
                raise ValueError("ENCRYPTION_KEY must be set (16+ characters) in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE cannot be disabled in production")
            if not self.public_url.startswith("https://"):
                raise ValueError("PUBLIC_URL must be https:// in production")
        return self


@lru_cache
def get_settings() -> Settings:
    env_file = None if os.environ.get("APP_ENV") == "test" else ".env"
    return Settings(_env_file=env_file)
