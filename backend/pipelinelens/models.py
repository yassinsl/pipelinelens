"""Pydantic models for the PipelineLens API.

These models define the request/response contract for POST /analyze.

Design notes / guardrails:
- There is intentionally **no** confidence score / percentage field. The system
  must not invent confidence numbers.
- There is intentionally **no** "verified" flag on suggested changes. A fix is a
  *suggestion*; the service does not execute anything to verify it.
- ``likely_cause`` is optional so the analyzer can honestly answer "unknown"
  (status ``needs_more_context``) when the evidence is insufficient.
"""

from enum import Enum
from typing import List, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class HealthResponse(BaseModel):
    """Response body for ``GET /health``."""

    status: str = Field(default="ok", description="Service health indicator.")


class AnalysisStatus(str, Enum):
    """Outcome of an analysis."""

    DIAGNOSED = "diagnosed"
    NEEDS_MORE_CONTEXT = "needs_more_context"


class EvidenceSource(str, Enum):
    """Which input a piece of evidence was found in."""

    LOGS = "logs"
    WORKFLOW = "workflow"


class Evidence(BaseModel):
    """A single, traceable piece of evidence.

    Every claim the analyzer makes should be backed by evidence that points to a
    specific line in either the uploaded logs or the workflow YAML, with the
    exact text quoted so a human can verify it independently.
    """

    source: EvidenceSource = Field(description="Which input this evidence came from.")
    line_number: int = Field(ge=1, description="1-based line number within the source.")
    quoted_text: str = Field(min_length=1, description="Exact text quoted from that line.")


class SuggestedChange(BaseModel):
    """A proposed change. This is a suggestion only; it is not verified."""

    description: str = Field(min_length=1, description="What to change and why.")
    file: Optional[str] = Field(default=None, description="File the change applies to, if known.")
    details: Optional[str] = Field(default=None, description="Concrete before/after or snippet.")


class AnalysisRequest(BaseModel):
    """Request body for POST /analyze."""

    model_config = ConfigDict(extra="forbid")

    logs: str = Field(description="Raw failed GitHub Actions logs.")
    workflow_yaml: str = Field(description="The workflow YAML file contents.")

    @field_validator("logs", "workflow_yaml")
    @classmethod
    def _must_not_be_blank(cls, value: str, info) -> str:
        if value is None or not value.strip():
            raise ValueError(f"{info.field_name} must not be empty")
        return value


class AnalysisResponse(BaseModel):
    """Structured analysis report returned to the user."""

    status: AnalysisStatus = Field(
        description="Whether a cause was diagnosed or more context is needed."
    )
    summary: str = Field(min_length=1, description="Short, plain-language summary of the outcome.")
    likely_cause: Optional[str] = Field(
        default=None,
        description="The most likely root cause, or null when it cannot be determined.",
    )
    evidence: List[Evidence] = Field(
        default_factory=list, description="Supporting evidence for the conclusion."
    )
    suggested_changes: List[SuggestedChange] = Field(
        default_factory=list, description="Proposed (unverified) changes."
    )
    verification_steps: List[str] = Field(
        default_factory=list, description="Steps a human can take to confirm the fix."
    )
    missing_information: List[str] = Field(
        default_factory=list,
        description="What additional context is needed when the cause is unknown.",
    )

    @model_validator(mode="after")
    def _check_consistency(self) -> "AnalysisResponse":
        if self.status is AnalysisStatus.DIAGNOSED:
            if not (self.likely_cause and self.likely_cause.strip()):
                raise ValueError("likely_cause is required when status is 'diagnosed'")
            if not self.evidence:
                raise ValueError(
                    "at least one evidence item is required when status is 'diagnosed'"
                )
        elif self.status is AnalysisStatus.NEEDS_MORE_CONTEXT:
            if not self.missing_information:
                raise ValueError(
                    "missing_information must not be empty when status is 'needs_more_context'"
                )
        return self
