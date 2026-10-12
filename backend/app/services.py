from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    CaseStatus,
    Defect,
    DefectStatus,
    ExecutionResult,
    Priority,
    Severity,
    TestCase,
    TestExecution,
)

DEFAULT_SEVERITY = {
    Priority.P0: Severity.CRITICAL,
    Priority.P1: Severity.HIGH,
    Priority.P2: Severity.MEDIUM,
    Priority.P3: Severity.LOW,
}


def describe_call(tc: TestCase) -> str:
    """e.g. "withdraw(amount=0)", or "" for a test case without inputs."""
    if not tc.inputs:
        return ""
    name = (tc.function_under_test or "").split("(")[0].strip() or "call"
    args = ", ".join(f"{k}={v!r}" for k, v in tc.inputs.items())
    return f"{name}({args})"


def record_execution(
    db: Session,
    tc: TestCase,
    result: ExecutionResult,
    actual: str = "",
    run_label: str | None = None,
    severity: Severity | None = None,
) -> tuple[TestExecution, Defect | None, bool]:
    """Record a run of tc and update its status. A failure opens a defect
    linked to the test case, unless one is already open for it.

    Returns (execution, defect, defect_created). The caller commits.
    """
    execution = TestExecution(test_case=tc, result=result, actual=actual, run_label=run_label)
    db.add(execution)
    tc.status = CaseStatus(result.value)

    if result != ExecutionResult.FAIL:
        return execution, None, False

    defect = db.scalars(
        select(Defect).where(
            Defect.test_case_id == tc.id,
            Defect.status.in_([DefectStatus.OPEN, DefectStatus.IN_PROGRESS]),
        )
    ).first()
    if defect is not None:
        return execution, defect, False

    db.flush()  # assigns execution.id
    call = describe_call(tc)
    defect = Defect(
        test_case_id=tc.id,
        execution_id=execution.id,
        title=f"{tc.code} failed: {tc.title}",
        severity=severity or DEFAULT_SEVERITY[tc.priority],
        priority=tc.priority,
        expected=f"{tc.expected_outcome}: {call}" if call else tc.expected_outcome,
        actual=actual,
        module=tc.module,
    )
    db.add(defect)
    db.flush()  # assigns defect.id, so defect.code is usable
    return execution, defect, True
