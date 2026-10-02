# PipelineLens

AI-assisted troubleshooting for failed GitHub Actions runs.

Give PipelineLens a failed workflow's **logs** and its **workflow YAML**, and it
calls an existing LLM to return a likely cause, supporting evidence (traceable to
specific lines), suggested changes, and verification steps — or honestly reports
that it needs more context.

## Status

**Phase 2 — real AI analysis via `POST /analyze` (current).**

- `GET /health` → `{"status": "ok"}` and an informational root. Both start
  **without** any API key.
- `POST /analyze` accepts the `AnalysisRequest` contract, redacts recognizable
  secrets, calls an OpenAI-compatible LLM for structured output, and validates the
  response — including that every evidence citation really exists in the submitted
  (redacted) input. Until a provider is configured it returns a clear `503`.
- Clearly labeled **synthetic** examples (a Python version mismatch, and a generic
  failure with insufficient evidence) plus an opt-in live smoke test.

The app **never executes** uploaded logs, shell commands, or YAML, and never runs
suggested fixes.

## Project layout

```text
backend/
  pyproject.toml                 # dependencies + tooling
  pipelinelens/
    main.py                      # FastAPI app: /health, /, POST /analyze, sanitized errors
    models.py                    # request/response data contract (unchanged from Phase 1)
    config.py                    # lazy LLM_* settings; loads .env, env vars override
    redaction.py                 # best-effort secret redaction (preserves line breaks)
    analysis.py                  # prepare inputs, build prompt, validate citations
    provider.py                  # the only boundary to the OpenAI-compatible API
    live_smoke.py                # opt-in live test (NOT collected by pytest)
    example_data.py              # loader for the synthetic examples
    examples/                    # synthetic, clearly-labeled sample data
  tests/                         # offline tests; mock the provider boundary
```

## Requirements

- Python 3.11+

## Local setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## Configuration

Copy `.env.example` to `.env` (in the repository root) and set the provider values,
or export them as environment variables. Real environment variables take precedence
over `.env`.

| Variable              | Required | Purpose                                                               |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `LLM_API_KEY`         | yes¹     | Provider API key. Stays on the backend; never sent to the browser.    |
| `LLM_MODEL`           | yes¹     | Model identifier (e.g. `gpt-4o-mini`).                                |
| `LLM_BASE_URL`        | no       | OpenAI-compatible base URL. Defaults to the OpenAI API.               |
| `LLM_API_BASE_URL`    | no       | Legacy alias for `LLM_BASE_URL` (`LLM_BASE_URL` wins if both are set). |
| `LLM_RESPONSE_FORMAT` | no       | `json_schema` (default) or `json_object`.                             |

¹ Required only to use `POST /analyze`. The app and `GET /health` start without
them; `POST /analyze` returns `503` until both are set. **Never commit real secrets.**

## Run the backend

```bash
cd backend
uvicorn pipelinelens.main:app --reload
```

- Health check: http://127.0.0.1:8000/health
- API docs: http://127.0.0.1:8000/docs

## Request example

```bash
curl -s http://127.0.0.1:8000/analyze \
  -H 'Content-Type: application/json' \
  -d '{
        "logs": "ERROR: Package requires a different Python: 3.9.18 not in '\''>=3.11'\''\n##[error]Process completed with exit code 1.",
        "workflow_yaml": "name: CI\njobs:\n  test:\n    steps:\n      - uses: actions/setup-python@v5\n        with:\n          python-version: \"3.9\""
      }'
```

Successful response (`200`, shape — exact wording comes from the model):

```json
{
  "status": "diagnosed",
  "summary": "The workflow runs on Python 3.9 but the project requires >=3.11.",
  "likely_cause": "setup-python pins 3.9, which fails the requires-python constraint.",
  "evidence": [
    {"source": "logs", "line_number": 1, "quoted_text": "ERROR: Package requires a different Python: 3.9.18 not in '>=3.11'"},
    {"source": "workflow", "line_number": 7, "quoted_text": "          python-version: \"3.9\""}
  ],
  "suggested_changes": [
    {"description": "Set python-version to 3.11 or newer.", "file": null, "details": null}
  ],
  "verification_steps": ["Re-run the workflow and confirm the install step passes."],
  "missing_information": []
}
```

Error responses are sanitized (no credentials, response bodies, or stack traces):

| Status | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| `422`  | Invalid request fields (empty/whitespace, wrong types, extra). |
| `413`  | `logs` + `workflow_yaml` exceed 100,000 characters combined.   |
| `503`  | Provider not configured (`LLM_API_KEY`/`LLM_MODEL` missing).   |
| `504`  | Provider timed out.                                            |
| `502`  | Provider failure or an invalid/unverifiable model response.    |

## Tests

Offline tests mock the provider boundary and never touch the network:

```bash
cd backend
pytest
```

The live smoke test is **opt-in** and separate from `pytest`. It calls the real
configured provider with the synthetic examples, validates the schema and evidence
references, and reports whether each diagnosis matches the expected scenario
(status only — not identical wording). It reads credentials **only** from the
environment (not `.env`):

```bash
cd backend
LLM_API_KEY=sk-... LLM_MODEL=gpt-4o-mini python -m pipelinelens.live_smoke
# exit code: 0 = all matched, 1 = mismatch/failure, 2 = not configured
```

## What is sent to the provider

When you call `POST /analyze`, the submitted logs and workflow YAML are
**redacted** (best effort) and then sent to the configured LLM provider for
analysis. The redacted, line-numbered content is included in the prompt as
untrusted data.

## Limitations

- **Redaction is best-effort.** It targets recognizable private keys,
  `Authorization: Bearer` values, and common credential assignments; it is not a
  guarantee that all secrets are removed. Review your inputs.
- **Diagnoses can be wrong.** Matching a quoted line only proves the citation is
  traceable to your input — it does not prove the diagnosis is correct.
- **Fixes are suggestions.** PipelineLens never applies or verifies them; a
  developer must review and verify every suggested change. There is no confidence
  score and no "verified" flag by design.

## Roadmap

- **Phase 1 (done):** Backend foundation, data contract, synthetic examples, tests.
- **Phase 2 (done):** Real analysis via an existing LLM behind the documented
  contract, with redaction, citation validation, sanitized errors, and an opt-in
  live smoke test. No model training.
- **Phase 3:** React + TypeScript frontend.

