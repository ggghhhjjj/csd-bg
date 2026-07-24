"""Pipeline step parsing and execution for the Free Float app."""

from typing import Callable, Dict, List

KNOWN_STEPS = ("scrape", "download", "extract")


class PipelineError(Exception):
    """Raised when pipeline step configuration is invalid."""

    pass


def parse_steps(raw: str) -> List[str]:
    """
    Parse a comma-separated step list into ordered unique step names.

    Args:
        raw: Comma-separated steps, e.g. "scrape,download,extract"

    Returns:
        Ordered list of step names

    Raises:
        PipelineError: If empty, unknown, or duplicate steps
    """
    if raw is None or not str(raw).strip():
        raise PipelineError("Steps argument is required (e.g. scrape,download,extract)")

    parts = [part.strip() for part in str(raw).split(",")]
    steps = [part for part in parts if part]

    if not steps:
        raise PipelineError("Steps argument is required (e.g. scrape,download,extract)")

    known = set(KNOWN_STEPS)
    unknown = [step for step in steps if step not in known]
    if unknown:
        raise PipelineError(
            f"Unknown step(s): {', '.join(unknown)}. " f"Known steps: {', '.join(KNOWN_STEPS)}"
        )

    if len(steps) != len(set(steps)):
        raise PipelineError(f"Duplicate steps are not allowed: {raw}")

    return steps


def run_pipeline(steps: List[str], handlers: Dict[str, Callable[[], int]]) -> int:
    """
    Run pipeline steps in order.

    Args:
        steps: Ordered step names from parse_steps()
        handlers: Mapping of step name to callable returning exit code

    Returns:
        0 if all steps succeed; first non-zero exit code otherwise

    Raises:
        PipelineError: If a step has no registered handler
    """
    for step in steps:
        handler = handlers.get(step)
        if handler is None:
            raise PipelineError(f"No handler registered for step: {step}")
        exit_code = handler()
        if exit_code != 0:
            return exit_code
    return 0
