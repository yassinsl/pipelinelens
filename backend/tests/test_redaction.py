"""Recognizable secrets are masked without shifting evidence line references."""

import re

import pytest

from pipelinelens.redaction import REDACTED, redact


@pytest.mark.parametrize(
    "text, secret",
    [
        ("export LLM_API_KEY=synthetic-key", "synthetic-key"),
        ('{"apiKey": "synthetic key with spaces"}', "synthetic key with spaces"),
        ("password: 'synthetic password'", "synthetic password"),
        ("AWS_ACCESS_KEY_ID=synthetic-access-id", "synthetic-access-id"),
        ("AWS_SECRET_ACCESS_KEY=synthetic-access-secret", "synthetic-access-secret"),
        ("GITHUB_TOKEN=synthetic-token", "synthetic-token"),
        ("client-secret: synthetic-client-secret", "synthetic-client-secret"),
        ("Authorization: Bearer synthetic-bearer", "synthetic-bearer"),
        ('{"authorization": "Bearer synthetic-bearer"}', "synthetic-bearer"),
        ("curl -H 'Authorization: Bearer synthetic-bearer'", "synthetic-bearer"),
        ("run: echo TOKEN=synthetic-token", "synthetic-token"),
    ],
)
def test_recognizable_credentials(text, secret):
    result = redact(text)
    assert secret not in result
    assert REDACTED in result
    assert redact(result) == result


@pytest.mark.parametrize("key_type", ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "OPENSSH PRIVATE KEY", "ENCRYPTED PRIVATE KEY"])
@pytest.mark.parametrize("ending", ["\n", "\r\n", "\r"])
@pytest.mark.parametrize("truncated", [False, True])
def test_private_key_blocks_keep_line_breaks(key_type, ending, truncated):
    lines = ["before", f"-----BEGIN {key_type}-----", "synthetic-key-material", "", "more-material"]
    if not truncated:
        lines += [f"-----END {key_type}-----", "after"]
    text = ending.join(lines) + ending
    result = redact(text)
    assert "synthetic-key-material" not in result
    assert "more-material" not in result
    assert re.findall(r"\r\n|\r|\n", result) == re.findall(r"\r\n|\r|\n", text)
    assert result.splitlines()[3] == ""
    assert result.startswith("before" + ending)
    if not truncated:
        assert result.endswith("after" + ending)


def test_ordinary_failure_evidence_and_blanks_unchanged():
    text = '\nPython 3.9 does not satisfy >=3.11\n\n          python-version: "3.9"\n'
    assert redact(text) == text
