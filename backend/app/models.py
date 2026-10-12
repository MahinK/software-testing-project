"""Persistence model for the verification chain:

Requirement -> TestScenario -> TestCase -> TestExecution (result) -> Defect
"""

import enum
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


def code(prefix: str, id_: int) -> str:
    """Zero-padded artifact identifier, e.g. code("TC", 23) -> "TC-023"."""
    return f"{prefix}-{id_:03d}"


class Priority(enum.StrEnum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class Severity(enum.StrEnum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class CaseStatus(enum.StrEnum):
    NOT_RUN = "Not Run"
    PASS = "Pass"
    FAIL = "Fail"
    BLOCKED = "Blocked"


class ExecutionResult(enum.StrEnum):
    PASS = "Pass"
    FAIL = "Fail"
    BLOCKED = "Blocked"


class CaseType(enum.StrEnum):
    UNIT = "unit"
    API = "api"
    INTEGRATION = "integration"
    REGRESSION = "regression"
    UI = "ui"


class Technique(enum.StrEnum):
    MANUAL = "Manual"
    EP = "Equivalence Partitioning"
    BVA = "Boundary Value Analysis"


class DefectStatus(enum.StrEnum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


def _enum(e: type[enum.Enum]) -> Enum:
    # Store the human-readable values rather than member names.
    return Enum(e, values_callable=lambda members: [m.value for m in members], length=40)


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    module: Mapped[str] = mapped_column(String(100), default="general")

    scenarios: Mapped[list["TestScenario"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )
    test_cases: Mapped[list["TestCase"]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan"
    )

    @property
    def code(self) -> str:
        return code("REQ", self.id)


class Upload(Base):
    """Source code uploaded for automated test generation and execution."""

    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    test_cases: Mapped[list["TestCase"]] = relationship(back_populates="upload")


class TestScenario(Base):
    __tablename__ = "test_scenarios"
    __test__ = False

    id: Mapped[int] = mapped_column(primary_key=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")

    requirement: Mapped[Requirement] = relationship(back_populates="scenarios")
    test_cases: Mapped[list["TestCase"]] = relationship(back_populates="scenario")


class TestSuite(Base):
    __tablename__ = "test_suites"
    __test__ = False

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")

    test_cases: Mapped[list["TestCase"]] = relationship(back_populates="suite")


class TestCase(Base):
    __tablename__ = "test_cases"
    __test__ = False

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id"))
    scenario_id: Mapped[int | None] = mapped_column(ForeignKey("test_scenarios.id"))
    suite_id: Mapped[int | None] = mapped_column(ForeignKey("test_suites.id"))
    upload_id: Mapped[int | None] = mapped_column(ForeignKey("uploads.id"))
    priority: Mapped[Priority] = mapped_column(_enum(Priority), default=Priority.P2)
    status: Mapped[CaseStatus] = mapped_column(_enum(CaseStatus), default=CaseStatus.NOT_RUN)
    test_type: Mapped[CaseType] = mapped_column(_enum(CaseType), default=CaseType.UNIT)
    technique: Mapped[Technique] = mapped_column(_enum(Technique), default=Technique.MANUAL)
    module: Mapped[str] = mapped_column(String(100), default="general")
    function_under_test: Mapped[str | None] = mapped_column(String(300))
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expected_outcome: Mapped[str] = mapped_column(Text, default="")

    requirement: Mapped[Requirement] = relationship(back_populates="test_cases")
    scenario: Mapped[TestScenario | None] = relationship(back_populates="test_cases")
    suite: Mapped[TestSuite | None] = relationship(back_populates="test_cases")
    upload: Mapped[Upload | None] = relationship(back_populates="test_cases")
    executions: Mapped[list["TestExecution"]] = relationship(
        back_populates="test_case", cascade="all, delete-orphan", order_by="TestExecution.id"
    )
    defects: Mapped[list["Defect"]] = relationship(
        back_populates="test_case", cascade="all, delete-orphan", order_by="Defect.id"
    )

    @property
    def code(self) -> str:
        return code("TC", self.id)


class TestExecution(Base):
    __tablename__ = "test_executions"
    __test__ = False

    id: Mapped[int] = mapped_column(primary_key=True)
    test_case_id: Mapped[int] = mapped_column(ForeignKey("test_cases.id"))
    result: Mapped[ExecutionResult] = mapped_column(_enum(ExecutionResult))
    actual: Mapped[str] = mapped_column(Text, default="")
    run_label: Mapped[str | None] = mapped_column(String(100))
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    test_case: Mapped[TestCase] = relationship(back_populates="executions")


class Defect(Base):
    __tablename__ = "defects"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_case_id: Mapped[int] = mapped_column(ForeignKey("test_cases.id"))
    execution_id: Mapped[int | None] = mapped_column(ForeignKey("test_executions.id"))
    title: Mapped[str] = mapped_column(String(300))
    severity: Mapped[Severity] = mapped_column(_enum(Severity))
    priority: Mapped[Priority] = mapped_column(_enum(Priority))
    expected: Mapped[str] = mapped_column(Text, default="")
    actual: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[DefectStatus] = mapped_column(_enum(DefectStatus), default=DefectStatus.OPEN)
    module: Mapped[str] = mapped_column(String(100), default="general")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    test_case: Mapped[TestCase] = relationship(back_populates="defects")

    @property
    def code(self) -> str:
        return code("BUG", self.id)

    @property
    def test_case_code(self) -> str:
        return code("TC", self.test_case_id)


class CoverageSnapshot(Base):
    __tablename__ = "coverage_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    percent: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(100), default="coverage.py")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
