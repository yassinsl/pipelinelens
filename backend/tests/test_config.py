"""Provider configuration stays lazy, local, and safe to inspect."""

import os

import pytest

from pipelinelens import config


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(os, "environ", os.environ.copy())
    for name in (
        "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_API_BASE_URL", "LLM_RESPONSE_FORMAT"
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / ".env")


def test_missing_configuration_is_allowed_until_analysis():
    settings = config.get_settings()
    assert settings.api_key is None
    assert settings.model is None
    assert settings.base_url is None
    assert settings.response_format == "json_schema"


def test_dotenv_loads_without_overriding_environment(monkeypatch):
    config.ENV_FILE.write_text(
        "LLM_API_KEY=dotenv-key\nLLM_MODEL=dotenv-model\nLLM_BASE_URL=https://local.example/v1\n"
    )
    monkeypatch.setenv("LLM_API_KEY", "environment-key")
    settings = config.get_settings()
    assert settings.api_key == "environment-key"
    assert settings.model == "dotenv-model"
    assert settings.base_url == "https://local.example/v1"


def test_environment_only_mode_does_not_read_dotenv():
    config.ENV_FILE.write_text("LLM_API_KEY=dotenv-key\nLLM_MODEL=dotenv-model\n")
    settings = config.get_settings(load_env=False)
    assert settings.api_key is None
    assert settings.model is None


def test_settings_trim_whitespace_and_support_legacy_base_url(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", " test-key ")
    monkeypatch.setenv("LLM_MODEL", " test-model ")
    monkeypatch.setenv("LLM_API_BASE_URL", " https://legacy.example/v1 ")
    settings = config.get_settings()
    assert settings.api_key == "test-key"
    assert settings.model == "test-model"
    assert settings.base_url == "https://legacy.example/v1"


def test_primary_base_url_wins_when_both_are_exported(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://primary.example/v1")
    monkeypatch.setenv("LLM_API_BASE_URL", "https://legacy.example/v1")
    assert config.get_settings().base_url == "https://primary.example/v1"


def test_exported_legacy_url_overrides_dotenv_primary_url(monkeypatch):
    config.ENV_FILE.write_text("LLM_BASE_URL=https://dotenv.example/v1\n")
    monkeypatch.setenv("LLM_API_BASE_URL", "https://environment.example/v1")
    assert config.get_settings().base_url == "https://environment.example/v1"


def test_settings_do_not_show_credentials_in_repr():
    settings = config.Settings(
        api_key="private-api-key", model="test-model", base_url="https://private-url.example/v1"
    )
    assert "private-api-key" not in repr(settings)
    assert "private-url" not in repr(settings)


def test_json_mode_is_explicit(monkeypatch):
    monkeypatch.setenv("LLM_RESPONSE_FORMAT", "json_object")
    assert config.get_settings().response_format == "json_object"
