"""Runs test cases against an uploaded module, in a separate process from the API.

Usage: python harness.py <source.py> <cases.json> <results.json>

A call is classified as:
* Reject: it raises an exception or returns False
* Accept: anything else

Branch coverage of the uploaded module is measured with coverage.py.
This file must stay standalone (stdlib + coverage only): it runs by path,
outside the app package.
"""

import contextlib
import importlib.util
import io
import json
import sys

import coverage


def _quiet():
    stack = contextlib.ExitStack()
    stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
    stack.enter_context(contextlib.redirect_stderr(io.StringIO()))
    return stack


def _call(fn, inputs):
    try:
        with _quiet():
            value = fn(**inputs)
    except Exception as e:  # the code under test may raise anything
        return "Reject", f"raised {type(e).__name__}: {e}"
    if value is False:
        return "Reject", "returned False"
    return "Accept", f"returned {value!r}"


def main(source_path: str, cases_path: str, results_path: str) -> None:
    with open(cases_path) as f:
        cases = json.load(f)

    cov = coverage.Coverage(branch=True, include=[source_path], data_file=None)
    results, error = [], None
    cov.start()
    try:
        spec = importlib.util.spec_from_file_location("module_under_test", source_path)
        module = importlib.util.module_from_spec(spec)
        with _quiet():
            spec.loader.exec_module(module)
        for case in cases:
            fn = getattr(module, case["function"], None)
            if not callable(fn):
                results.append({"id": case["id"], "error": f"function {case['function']!r} not found"})
                continue
            outcome, detail = _call(fn, case["inputs"])
            results.append({"id": case["id"], "outcome": outcome, "detail": detail})
    except Exception as e:
        error = f"could not import module: {type(e).__name__}: {e}"
    finally:
        cov.stop()

    try:
        percent = round(cov.report(file=io.StringIO()), 1)
    except coverage.CoverageException:
        percent = None

    with open(results_path, "w") as f:
        json.dump({"results": results, "coverage": percent, "error": error}, f)


if __name__ == "__main__":
    main(*sys.argv[1:4])
