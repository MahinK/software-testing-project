from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import check_case_refs, get_or_404
from app.db import get_db
from app.services import record_execution
from app.models import CaseStatus, CaseType, TestCase, TestSuite
from app.schemas import (
    CaseCreate,
    CaseRead,
    CaseUpdate,
    DefectRead,
    ExecutionCreate,
    ExecutionOutcome,
    ExecutionRead,
    SuiteCreate,
    SuiteRead,
)

router = APIRouter(tags=["test cases"])


# --- Suites ----------------------------------------------------------------


@router.post("/suites", response_model=SuiteRead, status_code=201)
def create_suite(body: SuiteCreate, db: Session = Depends(get_db)):
    suite = TestSuite(**body.model_dump())
    db.add(suite)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(409, f"suite {body.name!r} already exists")
    return suite


@router.get("/suites", response_model=list[SuiteRead])
def list_suites(db: Session = Depends(get_db)):
    return db.scalars(select(TestSuite).order_by(TestSuite.id)).all()


# --- Test cases ------------------------------------------------------------


@router.post("/test-cases", response_model=CaseRead, status_code=201)
def create_test_case(body: CaseCreate, db: Session = Depends(get_db)):
    requirement = check_case_refs(db, body.requirement_id, body.scenario_id, body.suite_id)
    data = body.model_dump()
    data["module"] = data["module"] or requirement.module
    tc = TestCase(**data)
    db.add(tc)
    db.commit()
    return tc


@router.get("/test-cases", response_model=list[CaseRead])
def list_test_cases(
    requirement_id: int | None = None,
    suite_id: int | None = None,
    status: CaseStatus | None = None,
    test_type: CaseType | None = None,
    db: Session = Depends(get_db),
):
    q = select(TestCase).order_by(TestCase.id)
    if requirement_id is not None:
        q = q.where(TestCase.requirement_id == requirement_id)
    if suite_id is not None:
        q = q.where(TestCase.suite_id == suite_id)
    if status is not None:
        q = q.where(TestCase.status == status)
    if test_type is not None:
        q = q.where(TestCase.test_type == test_type)
    return db.scalars(q).all()


@router.get("/test-cases/{case_id}", response_model=CaseRead)
def get_test_case(case_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, TestCase, case_id)


@router.patch("/test-cases/{case_id}", response_model=CaseRead)
def update_test_case(case_id: int, body: CaseUpdate, db: Session = Depends(get_db)):
    tc = get_or_404(db, TestCase, case_id)
    changes = body.model_dump(exclude_unset=True)
    for non_nullable in ("title", "requirement_id", "priority", "status", "test_type",
                         "technique", "module", "inputs", "description", "expected_outcome"):
        if non_nullable in changes and changes[non_nullable] is None:
            raise HTTPException(422, f"{non_nullable} cannot be null")
    check_case_refs(
        db,
        changes.get("requirement_id", tc.requirement_id),
        changes.get("scenario_id", tc.scenario_id),
        changes.get("suite_id", tc.suite_id),
    )
    for field, value in changes.items():
        setattr(tc, field, value)
    db.commit()
    return tc


@router.delete("/test-cases/{case_id}", status_code=204)
def delete_test_case(case_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, TestCase, case_id))
    db.commit()
    return Response(status_code=204)


# --- Executions ------------------------------------------------------------


@router.post("/test-cases/{case_id}/executions", response_model=ExecutionOutcome, status_code=201)
def create_execution(case_id: int, body: ExecutionCreate, db: Session = Depends(get_db)):
    """Record a manual or externally run result for a test case."""
    tc = get_or_404(db, TestCase, case_id)
    execution, defect, created = record_execution(
        db, tc, body.result, body.actual, body.run_label, body.severity
    )
    db.commit()
    return ExecutionOutcome(
        execution=ExecutionRead.model_validate(execution),
        defect=DefectRead.model_validate(defect) if defect else None,
        defect_created=created,
    )


@router.get("/test-cases/{case_id}/executions", response_model=list[ExecutionRead])
def list_executions(case_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, TestCase, case_id).executions
