from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CaseType, ExecutionResult, Priority, Requirement, TestCase
from app.routers.dashboard import dashboard
from app.routers.generator import generate
from app.routers.requirements import create_requirement, create_scenario, trace_requirement
from app.routers.test_cases import create_execution, create_suite, create_test_case
from app.routers.uploads import create_upload, run_upload
from app.schemas import (
    CaseCreate,
    ExecutionCreate,
    GenerateRequest,
    ParamSpecIn,
    Report,
    RequirementCreate,
    ScenarioCreate,
    SuiteCreate,
    UploadCreate,
)

router = APIRouter(tags=["report"])

SAMPLE = Path(__file__).resolve().parents[2] / "samples" / "bank.py"


@router.get("/report", response_model=Report)
def report(db: Session = Depends(get_db)):
    """Verification report: overall metrics plus the trace of every requirement."""
    ids = db.scalars(select(Requirement.id).order_by(Requirement.id)).all()
    return Report(
        generated_at=datetime.now(UTC),
        summary=dashboard(db),
        requirements=[trace_requirement(i, db) for i in ids],
    )


@router.get("/sample")
def sample() -> dict[str, str]:
    """The demo's sample module, so it can be uploaded from the UI."""
    return {"filename": SAMPLE.name, "source": SAMPLE.read_text()}


@router.post("/demo", status_code=201)
def load_demo(db: Session = Depends(get_db)) -> dict[str, int]:
    """Seed an empty database with the banking sample: upload, requirements,
    generated EP/BVA cases, an automated run and a blocked manual UI test."""
    if db.scalar(select(func.count()).select_from(Requirement)):
        raise HTTPException(409, "demo data can only be loaded into an empty database")

    upload = create_upload(UploadCreate(filename="bank.py", source=SAMPLE.read_text()), db)
    suite = create_suite(SuiteCreate(name="Core banking", description="Account operations"), db)

    specs = [
        ("Withdrawals are limited to ₹1 – account balance (₹10,000)", "accounts",
         "withdraw(amount)", {"amount": ParamSpecIn(min=1, max=10_000)}, Priority.P1, CaseType.UNIT),
        ("Deposits are limited to ₹1 – ₹50,000 per transaction", "deposits",
         "deposit(amount)", {"amount": ParamSpecIn(min=1, max=50_000)}, Priority.P2, CaseType.REGRESSION),
        ("Transfers charge a fee between 0% and 5%", "transfers",
         "transfer(amount, fee_percent)",
         {"amount": ParamSpecIn(min=1, max=10_000),
          "fee_percent": ParamSpecIn(type="float", min=0, max=5, step=0.01)},
         Priority.P2, CaseType.INTEGRATION),
    ]
    for title, module, signature, params, priority, test_type in specs:
        req = create_requirement(RequirementCreate(title=title, module=module), db)
        scenario = create_scenario(
            ScenarioCreate(requirement_id=req.id, title=f"Input validation for {signature}"), db
        )
        generate(
            GenerateRequest(
                signature=signature, params=params, persist=True, upload_id=upload.id,
                requirement_id=req.id, scenario_id=scenario.id, suite_id=suite.id,
                priority=priority, test_type=test_type,
            ),
            db,
        )

    login = create_requirement(
        RequirementCreate(title="Users can sign in from the web app", module="auth"), db
    )
    ui_case = create_test_case(
        CaseCreate(
            title="Login page renders and accepts valid credentials", requirement_id=login.id,
            priority=Priority.P1, test_type=CaseType.UI, expected_outcome="Dashboard is shown",
        ),
        db,
    )
    create_execution(
        ui_case.id,
        ExecutionCreate(result=ExecutionResult.BLOCKED, actual="Staging environment unavailable"),
        db,
    )

    summary = run_upload(upload.id, None, db)
    return {
        "test_cases": db.scalar(select(func.count()).select_from(TestCase)),
        "failed": summary.failed,
        "defects_created": summary.defects_created,
    }
