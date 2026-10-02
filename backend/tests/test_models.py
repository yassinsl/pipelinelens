"""Tests for the request/response data contract."""

import pytest
from pydantic import ValidationError

from pipelinelens.models import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
    Evidence,
    EvidenceSource,
    SuggestedChange,
)


# --- AnalysisRequest -------------------------------------------------------

def test_valid_request():
    req = AnalysisRequest(logs="boom", workflow_yaml="name: CI")
    assert req.logs == "boom"
    assert req.workflow_yaml == "name: CI"


@pytest.mark.parametrize(
    "logs, workflow_yaml",
    [
        ("", "name: CI"),
        ("   ", "name: CI"),
        ("\n\t ", "name: CI"),
        ("boom", ""),
        ("boom", "   "),
        ("", ""),
    ],
)
def test_empty_input_is_rejected(logs, workflow_yaml):
    with pytest.raises(ValidationError):
        AnalysisRequest(logs=logs, workflow_yaml=workflow_yaml)


def test_request_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        AnalysisRequest(logs="x", workflow_yaml="y", confidence=0.9)


def test_request_requires_both_fields():
    with pytest.raises(ValidationError):
        AnalysisRequest(logs="only logs")  # type: ignore[call-arg]


# --- Evidence --------------------------------------------------------------

def test_evidence_line_number_must_be_positive():
    with pytest.raises(ValidationError):
        Evidence(source=EvidenceSource.LOGS, line_number=0, quoted_text="x")


def test_evidence_quoted_text_required():
    with pytest.raises(ValidationError):
        Evidence(source=EvidenceSource.LOGS, line_number=1, quoted_text="")


# --- AnalysisResponse ------------------------------------------------------

def test_diagnosed_response_is_valid():
    resp = AnalysisResponse(
        status=AnalysisStatus.DIAGNOSED,
        summary="Python version mismatch.",
        likely_cause="Workflow pins 3.9 but project needs >=3.11.",
        evidence=[
            Evidence(
                source=EvidenceSource.WORKFLOW,
                line_number=17,
                quoted_text='          python-version: "3.9"',
            )
        ],
        suggested_changes=[SuggestedChange(description="Bump Python to 3.11.")],
        verification_steps=["Re-run the workflow."],
    )
    assert resp.status is AnalysisStatus.DIAGNOSED
    assert resp.likely_cause


def test_diagnosed_requires_likely_cause():
    with pytest.raises(ValidationError):
        AnalysisResponse(
            status=AnalysisStatus.DIAGNOSED,
            summary="x",
            likely_cause=None,
            evidence=[Evidence(source=EvidenceSource.LOGS, line_number=1, quoted_text="err")],
        )


def test_diagnosed_requires_evidence():
    with pytest.raises(ValidationError):
        AnalysisResponse(
            status=AnalysisStatus.DIAGNOSED,
            summary="x",
            likely_cause="something concrete",
            evidence=[],
        )


def test_needs_more_context_allows_unknown_cause():
    resp = AnalysisResponse(
        status=AnalysisStatus.NEEDS_MORE_CONTEXT,
        summary="Not enough info to decide.",
        likely_cause=None,
        missing_information=["Full build output."],
    )
    assert resp.likely_cause is None
    assert resp.missing_information


def test_needs_more_context_requires_missing_information():
    with pytest.raises(ValidationError):
        AnalysisResponse(
            status=AnalysisStatus.NEEDS_MORE_CONTEXT,
            summary="x",
            missing_information=[],
        )


def test_contract_has_no_confidence_and_no_verified_flag():
    # Guardrail: never invent confidence percentages.
    assert "confidence" not in AnalysisResponse.model_fields
    # Guardrail: a suggested change must not claim it has been verified.
    assert "verified" not in SuggestedChange.model_fields
