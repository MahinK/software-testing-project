import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

HARNESS = Path(__file__).with_name("harness.py")


class RunnerError(Exception):
    pass


def run_cases(source: str, cases: list[dict[str, Any]], timeout: float = 30) -> dict[str, Any]:
    """Execute cases ({id, function, inputs}) against source in a subprocess.

    Returns {"results": [{id, outcome, detail} | {id, error}], "coverage": float | None,
    "error": str | None}.

    Uploaded code runs with the server's permissions. That's acceptable for a
    local prototype, but it needs a real sandbox (container, seccomp) before
    the platform accepts untrusted uploads.
    """
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp, "module_under_test.py")
        cases_file = Path(tmp, "cases.json")
        results_file = Path(tmp, "results.json")
        src.write_text(source)
        cases_file.write_text(json.dumps(cases))
        try:
            proc = subprocess.run(
                [sys.executable, str(HARNESS), str(src), str(cases_file), str(results_file)],
                cwd=tmp,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            raise RunnerError(f"test run timed out after {timeout:g}s")
        if proc.returncode != 0 or not results_file.exists():
            raise RunnerError(proc.stderr.strip()[-2000:] or "test harness crashed")
        return json.loads(results_file.read_text())
