"""The live smoke test must stay opt-in: never collected, never calls out offline."""

import os

import pytest

from pipelinelens import live_smoke, provider


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.setattr(os, "environ", os.environ.copy())
    for name in ("LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_API_BASE_URL"):
        monkeypatch.delenv(name, raising=False)


def test_live_module_is_not_collected_by_pytest():
    # It lives in the package (pipelinelens.live_smoke), not under tests/, and its
    # file is not named test_*, so ordinary pytest runs never import or run it.
    from pathlib import Path

    module_file = Path(live_smoke.__file__)
    assert module_file.parent.name == "pipelinelens"
    assert not module_file.name.startswith("test_")


def test_unconfigured_run_reports_not_run_without_calling_provider(monkeypatch):
    def forbidden(*_args, **_kwargs):  # pragma: no cover - must never run
        raise AssertionError("provider must not be called when unconfigured")

    monkeypatch.setattr(provider, "generate_report", forbidden)

    # Exit code 2 == "not configured", and nothing is sent to a provider.
    assert live_smoke.main() == 2


def test_live_run_does_not_read_dotenv(monkeypatch):
    # Even if a .env existed, the live command must rely on real env vars only.
    captured = {}

    def fake_get_settings(*, load_env=True):
        captured["load_env"] = load_env
        from pipelinelens.config import Settings

        return Settings(api_key=None, model=None)

    monkeypatch.setattr(live_smoke, "get_settings", fake_get_settings)
    assert live_smoke.main() == 2
    assert captured["load_env"] is False
