import ast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import get_or_404
from app.db import get_db
from app.generator import parse_signature
from app.models import CoverageSnapshot, ExecutionResult, Upload
from app.runner import RunnerError, run_cases
from app.schemas import (
    FunctionInfo,
    RunCaseResult,
    RunRequest,
    RunSummary,
    UploadCreate,
    UploadRead,
)
from app.services import record_execution

router = APIRouter(prefix="/uploads", tags=["uploads"])


def parse_functions(source: str) -> list[FunctionInfo]:
    """Public top-level (sync) functions of a Python module."""
    tree = ast.parse(source)
    functions = []
    for node in tree.body:
        if not isinstance(node, ast.FunctionDef) or node.name.startswith("_"):
            continue
        a = node.args
        params = [p.arg for p in a.posonlyargs + a.args + a.kwonlyargs]
        functions.append(
            FunctionInfo(
                name=node.name,
                params=params,
                signature=f"{node.name}({', '.join(params)})",
                docstring=ast.get_docstring(node) or "",
            )
        )
    return functions


def _read(upload: Upload) -> UploadRead:
    return UploadRead(
        id=upload.id,
        filename=upload.filename,
        created_at=upload.created_at,
        functions=parse_functions(upload.source),
        test_case_count=len(upload.test_cases),
    )


@router.post("", response_model=UploadRead, status_code=201)
def create_upload(body: UploadCreate, db: Session = Depends(get_db)):
    if not body.filename.endswith(".py"):
        raise HTTPException(422, "only Python (.py) modules are supported")
    try:
        functions = parse_functions(body.source)
    except SyntaxError as e:
        raise HTTPException(422, f"{body.filename} line {e.lineno}: {e.msg}")
    if not functions:
        raise HTTPException(422, f"{body.filename} has no public top-level functions")
    upload = Upload(filename=body.filename, source=body.source)
    db.add(upload)
    db.commit()
    return _read(upload)


@router.get("", response_model=list[UploadRead])
def list_uploads(db: Session = Depends(get_db)):
    return [_read(u) for u in db.scalars(select(Upload).order_by(Upload.id))]


@router.get("/{upload_id}", response_model=UploadRead)
def get_upload(upload_id: int, db: Session = Depends(get_db)):
    return _read(get_or_404(db, Upload, upload_id))


@router.get("/{upload_id}/source")
def get_upload_source(upload_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    upload = get_or_404(db, Upload, upload_id)
    return {"filename": upload.filename, "source": upload.source}


@router.post("/{upload_id}/run", response_model=RunSummary)
def run_upload(upload_id: int, body: RunRequest | None = None, db: Session = Depends(get_db)):
    """Execute every test case generated for this upload against its code,
    record the results and coverage, and open defects for failures."""
    upload = get_or_404(db, Upload, upload_id)
    cases = sorted(
        (tc for tc in upload.test_cases if tc.function_under_test), key=lambda tc: tc.id
    )
    if not cases:
        raise HTTPException(422, f"no test cases have been generated for {upload.filename}")

    try:
        run = run_cases(
            upload.source,
            [
                {"id": tc.id, "function": parse_signature(tc.function_under_test)[0], "inputs": tc.inputs}
                for tc in cases
            ],
        )
    except RunnerError as e:
        raise HTTPException(500, f"test run failed: {e}")
    if run["error"]:
        raise HTTPException(422, run["error"])

    label = (body.run_label if body else None) or f"auto run of {upload.filename}"
    by_id = {r["id"]: r for r in run["results"]}
    results = []
    for tc in cases:
        r = by_id[tc.id]
        if "error" in r:
            result, actual = ExecutionResult.BLOCKED, r["error"]
        else:
            result = ExecutionResult.PASS if r["outcome"] == tc.expected_outcome else ExecutionResult.FAIL
            actual = f"{r['outcome']} ({r['detail']})"
        _, defect, created = record_execution(db, tc, result, actual, label)
        results.append(
            RunCaseResult(
                test_case_id=tc.id,
                code=tc.code,
                title=tc.title,
                inputs=tc.inputs,
                expected=tc.expected_outcome,
                actual=actual,
                result=result,
                defect_code=defect.code if defect else None,
                defect_created=created,
            )
        )

    if run["coverage"] is not None:
        db.add(CoverageSnapshot(percent=run["coverage"], source=f"{upload.filename} (upload #{upload.id})"))
    db.commit()

    return RunSummary(
        upload_id=upload.id,
        total=len(results),
        passed=sum(r.result == ExecutionResult.PASS for r in results),
        failed=sum(r.result == ExecutionResult.FAIL for r in results),
        blocked=sum(r.result == ExecutionResult.BLOCKED for r in results),
        coverage=run["coverage"],
        defects_created=sum(r.defect_created for r in results),
        results=results,
    )
