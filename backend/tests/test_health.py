"""Tests for the health check and the Phase 1 no-analysis-endpoint guarantee."""

from fastapi.testclient import TestClient

from pipelinelens.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_is_informational():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_no_analysis_endpoint_exposed():
    # Phase 1 must not expose a (fake) analysis endpoint.
    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/analyze" not in paths
    assert "/analysis" not in paths
