from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CaseStatus, CaseType, CoverageSnapshot, Defect, DefectStatus, TestCase
from app.schemas import CoverageCreate, CoverageRead, Dashboard, RegressionSummary

router = APIRouter(tags=["dashboard"])


def _status_counts(db: Session, test_type: CaseType | None = None) -> dict[CaseStatus, int]:
    q = select(TestCase.status, func.count()).group_by(TestCase.status)
    if test_type is not None:
        q = q.where(TestCase.test_type == test_type)
    counts = dict(db.execute(q).all())
    return {s: counts.get(s, 0) for s in CaseStatus}


@router.get("/dashboard", response_model=Dashboard)
def dashboard(db: Session = Depends(get_db)):
    counts = _status_counts(db)
    passed, failed, blocked = counts[CaseStatus.PASS], counts[CaseStatus.FAIL], counts[CaseStatus.BLOCKED]
    executed = passed + failed + blocked

    # Latest snapshot per source (one per uploaded module), averaged.
    latest: dict[str, float] = {}
    for snap in db.scalars(select(CoverageSnapshot).order_by(CoverageSnapshot.id)):
        latest[snap.source] = snap.percent
    coverage = round(sum(latest.values()) / len(latest), 1) if latest else None

    by_severity = dict(
        db.execute(select(Defect.severity, func.count()).group_by(Defect.severity)).all()
    )
    by_module = dict(
        db.execute(select(Defect.module, func.count()).group_by(Defect.module)).all()
    )
    open_defects = db.scalar(
        select(func.count()).select_from(Defect).where(
            Defect.status.in_([DefectStatus.OPEN, DefectStatus.IN_PROGRESS])
        )
    )

    regression = _status_counts(db, CaseType.REGRESSION)

    return Dashboard(
        total_test_cases=sum(counts.values()),
        passed=passed,
        failed=failed,
        blocked=blocked,
        not_run=counts[CaseStatus.NOT_RUN],
        pass_percentage=round(100 * passed / executed, 1) if executed else 0.0,
        code_coverage=coverage,
        open_defects=open_defects or 0,
        defects_by_severity={str(k): v for k, v in by_severity.items()},
        defects_by_module=by_module,
        regression=RegressionSummary(
            total=sum(regression.values()),
            passed=regression[CaseStatus.PASS],
            failed=regression[CaseStatus.FAIL],
            blocked=regression[CaseStatus.BLOCKED],
            not_run=regression[CaseStatus.NOT_RUN],
        ),
    )


@router.post("/coverage", response_model=CoverageRead, status_code=201)
def record_coverage(body: CoverageCreate, db: Session = Depends(get_db)):
    snapshot = CoverageSnapshot(**body.model_dump())
    db.add(snapshot)
    db.commit()
    return snapshot
