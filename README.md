# PipelineLens

AI-assisted troubleshooting for failed GitHub Actions runs.

Give PipelineLens a failed workflow's **logs** and its **workflow YAML**, and
(once Phase 2 lands) it will return a likely cause, supporting evidence,
suggested changes, and verification steps — or honestly tell you it needs more
context.

## Status

**Phase 1 — backend foundation (current).** This repository currently contains:

- A FastAPI app with a `GET /health` check (and an informational root).
- The Pydantic request/response data contract for the *future* analysis endpoint.
- Clearly labeled **synthetic** example data (a Python version mismatch, and a
  generic failure with insufficient evidence) with their expected reports.
- Tests for the health check, empty-input rejection, response-model validation,
  and example-data integrity.

There is **no LLM integration and no analysis endpoint yet** — by design. The app
will never execute uploaded logs, shell commands, or YAML.

## Project layout

```text
backend/
  pyproject.toml                 # dependencies + tooling
  pipelinelens/
    main.py                      # FastAPI app (health check only)
    models.py                    # request/response data contract
    example_data.py              # loader for the synthetic examples
    examples/                    # synthetic, clearly-labeled sample data
      python_version_mismatch/
      insufficient_evidence/
  tests/
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

## Run the backend

```bash
cd backend
uvicorn pipelinelens.main:app --reload
```

Then open:

- Health check: http://127.0.0.1:8000/health
- API docs: http://127.0.0.1:8000/docs

## Run the tests

```bash
cd backend
pytest
```

## The analysis contract (preview)

The future analysis endpoint will accept `logs` and `workflow_yaml`, and return a
report with:

- `status`: `diagnosed` or `needs_more_context`
- `summary`
- `likely_cause` (nullable — the analyzer may answer "unknown")
- `evidence` (each item cites `source` = `logs`/`workflow`, a `line_number`, and the `quoted_text`)
- `suggested_changes`
- `verification_steps`
- `missing_information`

By design the contract has **no confidence percentage** and **no "verified" flag**:
PipelineLens offers suggestions; it does not claim a fix is proven.

## Configuration

Copy `.env.example` to `.env` for local configuration. The LLM-related values are
placeholders for Phase 2 and are not read yet. Never commit a real `.env`.

## Roadmap

- **Phase 1 (done):** Backend foundation, data contract, synthetic examples, tests.
- **Phase 2:** Integrate an existing LLM via API to produce real analysis behind the
  documented contract. No model training.
- **Phase 3:** React + TypeScript frontend.
