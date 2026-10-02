"""Tests for health, service metadata, and analysis route availability."""

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


def test_analysis_endpoint_is_exposed_as_post():
    routes = [route for route in app.routes if getattr(route, "path", None) == "/analyze"]
    assert len(routes) == 1
    assert routes[0].methods == {"POST"}
