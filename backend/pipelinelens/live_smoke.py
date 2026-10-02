"""Opt-in live smoke test for the real, configured provider.

This module is intentionally **not** collected by pytest (it does not live under
``tests/`` and is not named ``test_*``), so ordinary offline test runs never make
network calls. Run it explicitly instead:

    LLM_API_KEY=... LLM_MODEL=... python -m pipelinelens.live_smoke

It:
- requires credentials supplied through the environment (it does NOT read .env),
- sends the synthetic examples through the real analysis pipeline (redaction,
  prompt preparation, the provider call, schema and evidence-citation validation),
- reports whether each diagnosis matches the expected scenario, comparing the
  returned ``status`` only (it does not require identical wording), and
- exits non-zero on any mismatch or failure so it can gate a release check.

Exit codes: 0 = all scenarios matched, 1 = a mismatch/failure, 2 = not configured.
"""

import asyncio
import sys

from . import analysis, provider
from .config import get_settings
from .example_data import Example, load_all_examples
from .models import AnalysisRequest, AnalysisResponse


def _summarize(report: AnalysisResponse) -> str:
    # Synthetic examples contain no secrets; keep output short regardless.
    cause = report.likely_cause or "(none)"
    return (
        f"status={report.status.value} "
        f"evidence={len(report.evidence)} "
        f"suggested_changes={len(report.suggested_changes)}\n"
        f"      summary: {report.summary}\n"
        f"      likely_cause: {cause}"
    )


async def _analyze(example: Example, settings) -> AnalysisResponse:
    request = AnalysisRequest(logs=example.logs, workflow_yaml=example.workflow_yaml)

    async def call(messages: list[dict[str, str]]) -> str:
        # Use the environment-only settings; never fall back to .env here.
        return await provider.generate_report(messages, settings=settings)

    # analysis.analyze performs schema validation and evidence-citation checks.
    return await analysis.analyze(request, provider_call=call)


async def _run() -> int:
    settings = get_settings(load_env=False)
    if not settings.api_key or not settings.model:
        print(
            "Live smoke test NOT RUN: export LLM_API_KEY and LLM_MODEL in the "
            "environment to enable it (this command does not read .env)."
        )
        return 2

    examples = load_all_examples()
    print(f"Running live smoke test against {len(examples)} synthetic example(s)...\n")

    failures = 0
    for example in examples:
        expected_status = example.expected_report["status"]
        try:
            report = await _analyze(example, settings)
        except provider.ProviderConfigurationError as exc:
            print(f"[CONFIG] {example.name}: {exc}")
            return 2
        except (
            provider.ProviderTimeoutError,
            provider.ProviderFailureError,
            provider.InvalidProviderResponseError,
        ) as exc:
            failures += 1
            print(f"[FAIL]  {example.name}: provider error: {exc}\n")
            continue

        matched = report.status.value == expected_status
        marker = "PASS" if matched else "FAIL"
        if not matched:
            failures += 1
        print(f"[{marker}]  {example.name}: expected scenario '{expected_status}'")
        print(f"      {_summarize(report)}\n")

    if failures:
        print(f"Live smoke test FAILED: {failures} example(s) did not match.")
        return 1
    print("Live smoke test PASSED: every diagnosis matched the expected scenario.")
    return 0


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    sys.exit(main())
