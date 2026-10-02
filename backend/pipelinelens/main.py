"""PipelineLens FastAPI application (Phase 1).

Phase 1 intentionally exposes only a health check and an informational root.
The analysis endpoint is *not* implemented yet: there is no LLM integration, and
we deliberately do not ship a fake analysis endpoint that returns canned results.
The service also never executes uploaded logs, shell commands, or YAML.
"""

from fastapi import FastAPI

from .models import HealthResponse

app = FastAPI(
    title="PipelineLens API",
    version="0.1.0",
    description=(
        "AI-assisted GitHub Actions troubleshooting. "
        "Phase 1 provides the backend foundation (health check + data contract) only."
    ),
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Liveness probe. Returns ``{"status": "ok"}``."""
    return HealthResponse(status="ok")


@app.get("/", tags=["system"])
def root() -> dict:
    """Basic service metadata. Analysis is not available until a later phase."""
    return {
        "name": "PipelineLens API",
        "version": "0.1.0",
        "status": "ok",
        "phase": 1,
        "message": "Backend foundation only. Analysis arrives in Phase 2.",
        "docs": "/docs",
    }
