from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    CaseStatus,
    CaseType,
    DefectStatus,
    ExecutionResult,
    Priority,
    Severity,
    Technique,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Requirements & scenarios ---------------------------------------------


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    module: str = Field("general", min_length=1, max_length=100)


class RequirementRead(ORMModel):
    id: int
    code: str
    title: str
    description: str
    module: str


class ScenarioCreate(BaseModel):
    requirement_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str = ""


class ScenarioRead(ORMModel):
    id: int
    requirement_id: int
    title: str
    description: str


# --- Suites & test cases ---------------------------------------------------


class SuiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class SuiteRead(ORMModel):
    id: int
    name: str
    description: str


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    requirement_id: int
    scenario_id: int | None = None
    suite_id: int | None = None
    priority: Priority = Priority.P2
    test_type: CaseType = CaseType.UNIT
    technique: Technique = Technique.MANUAL
    # Defaults to the requirement's module when omitted.
    module: str | None = None
    function_under_test: str | None = None
    inputs: dict[str, Any] = {}
    expected_outcome: str = ""


class CaseUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = None
    requirement_id: int | None = None
    scenario_id: int | None = None
    suite_id: int | None = None
    priority: Priority | None = None
    status: CaseStatus | None = None
    test_type: CaseType | None = None
    technique: Technique | None = None
    module: str | None = None
    function_under_test: str | None = None
    inputs: dict[str, Any] | None = None
    expected_outcome: str | None = None


class CaseRead(ORMModel):
    id: int
    code: str
    title: str
    description: str
    requirement_id: int
    scenario_id: int | None
    suite_id: int | None
    upload_id: int | None
    priority: Priority
    status: CaseStatus
    test_type: CaseType
    technique: Technique
    module: str
    function_under_test: str | None
    inputs: dict[str, Any]
    expected_outcome: str


# --- Executions & defects --------------------------------------------------


class ExecutionCreate(BaseModel):
    result: ExecutionResult
    actual: str = ""
    run_label: str | None = None
    # Severity of the auto-opened defect; derived from priority when omitted.
    severity: Severity | None = None


class ExecutionRead(ORMModel):
    id: int
    test_case_id: int
    result: ExecutionResult
    actual: str
    run_label: str | None
    executed_at: datetime


class DefectRead(ORMModel):
    id: int
    code: str
    test_case_id: int
    test_case_code: str
    execution_id: int | None
    title: str
    severity: Severity
    priority: Priority
    expected: str
    actual: str
    status: DefectStatus
    module: str
    created_at: datetime


class DefectUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    severity: Severity | None = None
    priority: Priority | None = None
    status: DefectStatus | None = None


class ExecutionOutcome(BaseModel):
    execution: ExecutionRead
    defect: DefectRead | None
    defect_created: bool


# --- Automated generation --------------------------------------------------


class ParamSpecIn(BaseModel):
    type: Literal["int", "float"] = "int"
    min: int | float
    max: int | float
    step: int | float | None = Field(None, gt=0)

    @model_validator(mode="after")
    def _check_range(self) -> "ParamSpecIn":
        if self.min > self.max:
            raise ValueError("min must not be greater than max")
        return self


class GenerateRequest(BaseModel):
    signature: str = Field(examples=["withdraw(amount)"])
    params: dict[str, ParamSpecIn] = Field(
        examples=[{"amount": {"type": "int", "min": 1, "max": 10000}}]
    )
    # When true the cases are saved as test cases (requirement_id is then required).
    persist: bool = False
    # Uploaded module the function lives in; needed to run the cases automatically.
    upload_id: int | None = None
    requirement_id: int | None = None
    scenario_id: int | None = None
    suite_id: int | None = None
    priority: Priority = Priority.P2
    test_type: CaseType = CaseType.UNIT


class GeneratedCaseOut(BaseModel):
    inputs: dict[str, int | float]
    technique: Technique
    partition: str
    expected_outcome: str
    test_case_id: int | None = None
    code: str | None = None


class GenerateResponse(BaseModel):
    function: str
    parameters: list[str]
    cases: list[GeneratedCaseOut]


# --- Uploads & automated runs ----------------------------------------------


class UploadCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=1_000_000)


class FunctionInfo(BaseModel):
    name: str
    params: list[str]
    signature: str
    docstring: str


class UploadRead(BaseModel):
    id: int
    filename: str
    created_at: datetime
    functions: list[FunctionInfo]
    test_case_count: int


class RunRequest(BaseModel):
    run_label: str | None = None


class RunCaseResult(BaseModel):
    test_case_id: int
    code: str
    title: str
    inputs: dict[str, Any]
    expected: str
    actual: str
    result: ExecutionResult
    defect_code: str | None
    defect_created: bool


class RunSummary(BaseModel):
    upload_id: int
    total: int
    passed: int
    failed: int
    blocked: int
    coverage: float | None
    defects_created: int
    results: list[RunCaseResult]


# --- Dashboard, coverage, traceability -------------------------------------


class CoverageCreate(BaseModel):
    percent: float = Field(ge=0, le=100)
    source: str = "coverage.py"


class CoverageRead(ORMModel):
    id: int
    percent: float
    source: str
    recorded_at: datetime


class RegressionSummary(BaseModel):
    total: int
    passed: int
    failed: int
    blocked: int
    not_run: int


class Dashboard(BaseModel):
    total_test_cases: int
    passed: int
    failed: int
    blocked: int
    not_run: int
    # Passed / executed (pass + fail + blocked), as a percentage.
    pass_percentage: float
    code_coverage: float | None
    open_defects: int
    defects_by_severity: dict[str, int]
    defects_by_module: dict[str, int]
    regression: RegressionSummary


class TraceExecution(BaseModel):
    id: int
    result: ExecutionResult
    actual: str
    executed_at: datetime


class TraceCase(BaseModel):
    id: int
    code: str
    title: str
    status: CaseStatus
    test_type: CaseType
    technique: Technique
    inputs: dict[str, Any]
    expected_outcome: str
    executions: list[TraceExecution]
    defects: list[DefectRead]


class TraceScenario(BaseModel):
    id: int | None
    title: str
    test_cases: list[TraceCase]


class Trace(BaseModel):
    requirement: RequirementRead
    # VERIFIED: every test case passes; FAILED: any fails; else NOT_VERIFIED.
    verification_status: Literal["VERIFIED", "FAILED", "NOT_VERIFIED"]
    scenarios: list[TraceScenario]


class Report(BaseModel):
    generated_at: datetime
    summary: Dashboard
    requirements: list[Trace]
