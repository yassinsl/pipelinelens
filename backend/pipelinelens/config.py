"""Small, lazy provider configuration for local and deployed environments."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


@dataclass(frozen=True, slots=True)
class Settings:
    api_key: str | None = field(default=None, repr=False)
    model: str | None = None
    base_url: str | None = field(default=None, repr=False)
    response_format: str = "json_schema"


def _env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def get_settings(*, load_env: bool = True) -> Settings:
    """Read settings without requiring credentials or making any API calls.

    The repository-root .env is independent of the server's working directory.
    An exported base URL (including the legacy alias) takes precedence over it.
    The live smoke command disables .env loading explicitly.
    """
    exported_base_url = _env("LLM_BASE_URL") or _env("LLM_API_BASE_URL")
    if load_env:
        load_dotenv(ENV_FILE, override=False)
    return Settings(
        api_key=_env("LLM_API_KEY"),
        model=_env("LLM_MODEL"),
        base_url=exported_base_url or _env("LLM_BASE_URL") or _env("LLM_API_BASE_URL"),
        response_format=_env("LLM_RESPONSE_FORMAT") or "json_schema",
    )
