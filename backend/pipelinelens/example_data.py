"""Loader for the synthetic example data shipped with PipelineLens.

The example files under ``examples/`` are **synthetic** (hand-written, not
captured from real runs). They exist to exercise the data contract and tests.
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List

EXAMPLES_DIR = Path(__file__).parent / "examples"


@dataclass(frozen=True)
class Example:
    """A single synthetic example: inputs plus the expected report."""

    name: str
    workflow_yaml: str
    logs: str
    expected_report: dict


def _load_example(directory: Path) -> Example:
    workflow_yaml = (directory / "workflow.yml").read_text(encoding="utf-8")
    logs = (directory / "logs.txt").read_text(encoding="utf-8")
    expected_report = json.loads(
        (directory / "expected_report.json").read_text(encoding="utf-8")
    )
    return Example(
        name=directory.name,
        workflow_yaml=workflow_yaml,
        logs=logs,
        expected_report=expected_report,
    )


def available_examples() -> List[str]:
    """Return the sorted names of the available example directories."""
    return sorted(p.name for p in EXAMPLES_DIR.iterdir() if p.is_dir())


def load_example(name: str) -> Example:
    """Load a single example by directory name."""
    directory = EXAMPLES_DIR / name
    if not directory.is_dir():
        raise FileNotFoundError(f"Unknown example: {name!r}")
    return _load_example(directory)


def load_all_examples() -> List[Example]:
    """Load every available example."""
    return [_load_example(EXAMPLES_DIR / name) for name in available_examples()]
