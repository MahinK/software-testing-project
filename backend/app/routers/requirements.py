from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import get_or_404
from app.db import get_db
from app.models import CaseStatus, Requirement, TestCase, TestScenario
from app.schemas import (
    DefectRead,
    RequirementCreate,
    RequirementRead,
    ScenarioCreate,
    ScenarioRead,
    Trace,
    TraceCase,
    TraceExecution,
    TraceScenario,
)

router = APIRouter(tags=["requirements"])


@router.post("/requirements", response_model=RequirementRead, status_code=201)
def create_requirement(body: RequirementCreate, db: Session = Depends(get_db)):
    requirement = Requirement(**body.model_dump())
    db.add(requirement)
    db.commit()
    return requirement


@router.get("/requirements", response_model=list[RequirementRead])
def list_requirements(db: Session = Depends(get_db)):
    return db.scalars(select(Requirement).order_by(Requirement.id)).all()


@router.get("/requirements/{requirement_id}", response_model=RequirementRead)
def get_requirement(requirement_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Requirement, requirement_id)


@router.post("/scenarios", response_model=ScenarioRead, status_code=201)
def create_scenario(body: ScenarioCreate, db: Session = Depends(get_db)):
    get_or_404(db, Requirement, body.requirement_id)
    scenario = TestScenario(**body.model_dump())
    db.add(scenario)
    db.commit()
    return scenario


@router.get("/requirements/{requirement_id}/scenarios", response_model=list[ScenarioRead])
def list_scenarios(requirement_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Requirement, requirement_id).scenarios


def _trace_case(tc: TestCase) -> TraceCase:
    return TraceCase(
        id=tc.id,
        code=tc.code,
        title=tc.title,
        status=tc.status,
        test_type=tc.test_type,
        technique=tc.technique,
        inputs=tc.inputs,
        expected_outcome=tc.expected_outcome,
        executions=[
            TraceExecution(id=e.id, result=e.result, actual=e.actual, executed_at=e.executed_at)
            for e in tc.executions
        ],
        defects=[DefectRead.model_validate(d) for d in tc.defects],
    )


@router.get("/requirements/{requirement_id}/trace", response_model=Trace)
def trace_requirement(requirement_id: int, db: Session = Depends(get_db)):
    """Requirement -> Test Scenario -> Test Case -> Execution/Result -> Defect."""
    requirement = get_or_404(db, Requirement, requirement_id)
    cases = sorted(requirement.test_cases, key=lambda tc: tc.id)

    scenarios = [
        TraceScenario(
            id=s.id,
            title=s.title,
            test_cases=[_trace_case(tc) for tc in cases if tc.scenario_id == s.id],
        )
        for s in requirement.scenarios
    ]
    unassigned = [_trace_case(tc) for tc in cases if tc.scenario_id is None]
    if unassigned:
        scenarios.append(TraceScenario(id=None, title="(no scenario)", test_cases=unassigned))

    statuses = {tc.status for tc in cases}
    if CaseStatus.FAIL in statuses:
        verification = "FAILED"
    elif statuses == {CaseStatus.PASS}:
        verification = "VERIFIED"
    else:
        verification = "NOT_VERIFIED"

    return Trace(
        requirement=RequirementRead.model_validate(requirement),
        verification_status=verification,
        scenarios=scenarios,
    )
