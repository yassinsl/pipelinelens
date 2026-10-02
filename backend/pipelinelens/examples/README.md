# Synthetic examples

**These files are synthetic.** They were hand-written to exercise the data
contract and the tests. They are not captured from real repositories or real CI
runs, and PipelineLens never executes any of this content.

Each example directory contains:

- `workflow.yml` — a sample GitHub Actions workflow.
- `logs.txt` — sample failed-run logs.
- `expected_report.json` — the report we would expect the analyzer to produce,
  validated against `pipelinelens.models.AnalysisResponse`.

## Examples

- `python_version_mismatch/` — a clearly diagnosable failure: the workflow pins
  Python 3.9 while the project requires 3.11+. Expected status: `diagnosed`.
- `insufficient_evidence/` — a generic build failure with no underlying error in
  the logs. Expected status: `needs_more_context` (cause intentionally unknown).
