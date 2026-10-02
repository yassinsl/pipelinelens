"""Best-effort redaction; never removes or adds a line break."""

import re

REDACTED = "[REDACTED]"

# Include truncated PEM blocks: failure logs can end before the closing marker.
_PRIVATE_KEY = re.compile(
    r"-----BEGIN (?P<kind>(?:[A-Z0-9]+ )*PRIVATE KEY)-----"
    r".*?(?:-----END (?P=kind)-----|\Z)",
    re.DOTALL,
)
_BEARER = re.compile(
    r"(?i)(\bauthorization[\"']?[ \t]*[:=][ \t]*[\"']?[ \t]*bearer[ \t]+)"
    # Recognize an already-redacted value so re-running redaction is idempotent
    # (otherwise the character class below stops at the closing ']').
    r"(?:\[REDACTED\]|[^\s\"',;}\]]+)"
)
_CREDENTIAL = re.compile(
    r"(?P<prefix>(?<![\w.-])[\"']?"
    r"[a-z0-9_.-]*(?:password|passwd|pwd|secret|token|credential|"
    r"api[_-]?key|access[_-]?key|private[_-]?key)[a-z0-9_.-]*"
    r"[\"']?[ \t]*[:=][ \t]*)"
    r'''(?P<value>"(?:\\[^\r\n]|[^"\\\r\n])*"|'(?:\\[^\r\n]|[^'\\\r\n])*'|\[REDACTED\]|[^\s,;}\]"']+)''',
    re.IGNORECASE,
)


def _redact_key(match: re.Match[str]) -> str:
    # Retain blank lines and the original LF/CRLF/CR separators inside a block.
    return re.sub(r"[^\r\n]+", REDACTED, match.group())


def _redact_credential(match: re.Match[str]) -> str:
    value = match["value"]
    replacement = REDACTED
    if value[0] in "\"'":
        replacement = value[0] + REDACTED + value[0]
    return match["prefix"] + replacement


def redact(text: str) -> str:
    """Mask recognizable private keys, bearer headers and credential assignments.

    This is deliberately not a guarantee that all secrets have been identified.
    No submitted text is logged here or in the analysis pipeline.
    """
    text = _PRIVATE_KEY.sub(_redact_key, text)
    text = _BEARER.sub(lambda match: match[1] + REDACTED, text)
    return _CREDENTIAL.sub(_redact_credential, text)
