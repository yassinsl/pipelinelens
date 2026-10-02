"""Tests for the synthetic example data and its integrity against the contract."""

import pytest

from pipelinelens.example_data import (
    available_examples,
    load_all_examples,
    load_example,
)
from pipelinelens.models import AnalysisResponse, AnalysisStatus, EvidenceSource


def test_both_examples_present():
    names = available_examples()
    assert "python_version_mismatch" in names
    assert "insufficient_evidence" in names


@pytest.mark.parametrize("example", load_all_examples(), ids=lambda e: e.name)
def test_expected_report_validates(example):
    # Every expected report must satisfy the response contract.
    report = AnalysisResponse.model_validate(example.expected_report)
    assert report.summary


def test_python_version_mismatch_is_diagnosed():
    example = load_example("python_version_mismatch")
    report = AnalysisResponse.model_validate(example.expected_report)
    assert report.status is AnalysisStatus.DIAGNOSED
    assert report.likely_cause
    assert report.evidence
    assert report.suggested_changes


def test_insufficient_evidence_needs_more_context():
    example = load_example("insufficient_evidence")
    report = AnalysisResponse.model_validate(example.expected_report)
    assert report.status is AnalysisStatus.NEEDS_MORE_CONTEXT
    assert report.likely_cause is None
    assert report.missing_information


@pytest.mark.parametrize("example", load_all_examples(), ids=lambda e: e.name)
def test_evidence_quotes_match_source_lines(example):
    """Each evidence item must quote the exact source line it points to."""
    report = AnalysisResponse.model_validate(example.expected_report)
    sources = {
        EvidenceSource.LOGS: example.logs.splitlines(),
        EvidenceSource.WORKFLOW: example.workflow_yaml.splitlines(),
    }
    for item in report.evidence:
        lines = sources[item.source]
        assert 1 <= item.line_number <= len(lines), (
            f"{example.name}: line {item.line_number} out of range for {item.source.value}"
        )
        actual = lines[item.line_number - 1]
        assert item.quoted_text == actual, (
            f"{example.name}: quoted_text mismatch at {item.source.value} "
            f"line {item.line_number}:\n  expected: {actual!r}\n  got:      {item.quoted_text!r}"
        )
