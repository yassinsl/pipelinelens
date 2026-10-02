"""PipelineLens API. Submitted content and suggested commands are never executed."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import analysis, provider
from .models import AnalysisRequest, AnalysisResponse, HealthResponse

app = FastAPI(
    title="PipelineLens API",
    version="0.2.0",
    description=(
        "AI-assisted GitHub Actions troubleshooting. "
        "Submit failed logs and workflow YAML for an evidence-linked analysis."
    ),
)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default response includes rejected input values. Never echo them.
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {
                    "loc": ["body", error["loc"][1]]
                    if len(error["loc"]) > 1 and error["loc"][1] in ("logs", "workflow_yaml")
                    else ["body"],
                    "msg": "Invalid request field.",
                    "type": error["type"],
                }
                for error in exc.errors()
            ]
        },
    )


@app.post("/analyze", response_model=AnalysisResponse, tags=["analysis"])
async def analyze(request: AnalysisRequest) -> AnalysisResponse:
    """Analyze at most 100,000 combined characters and verify every citation."""
    try:
        return await analysis.analyze(request)
    except analysis.InputTooLargeError:
        raise HTTPException(413, "logs and workflow_yaml must total at most 100,000 characters.") from None
    except provider.ProviderConfigurationError:
        raise HTTPException(
            503,
            "Analysis provider is not configured. Set LLM_API_KEY and LLM_MODEL; "
            "check optional LLM_BASE_URL and LLM_RESPONSE_FORMAT settings.",
        ) from None
    except provider.ProviderTimeoutError:
        raise HTTPException(504, "Analysis provider timed out. Please try again later.") from None
    except provider.InvalidProviderResponseError:
        raise HTTPException(502, "Analysis provider returned an invalid report or evidence citation.") from None
    except provider.ProviderFailureError:
        raise HTTPException(502, "Analysis provider request failed. Please try again later.") from None


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Liveness probe. Returns ``{"status": "ok"}``."""
    return HealthResponse(status="ok")


@app.get("/", tags=["system"])
def root() -> dict:
    """Basic service metadata."""
    return {
        "name": "PipelineLens API",
        "version": "0.2.0",
        "status": "ok",
        "phase": 2,
        "message": "Submit failed logs and workflow YAML to POST /analyze.",
        "docs": "/docs",
    }
