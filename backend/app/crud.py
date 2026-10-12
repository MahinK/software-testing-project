from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Requirement, TestScenario, TestSuite

M = TypeVar("M", bound=Base)


def get_or_404(db: Session, model: type[M], id_: int) -> M:
    obj = db.get(model, id_)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {id_} not found")
    return obj


def check_case_refs(
    db: Session, requirement_id: int, scenario_id: int | None, suite_id: int | None
) -> Requirement:
    """Make sure a test case's links exist and its scenario belongs to its
    requirement. Returns the requirement."""
    requirement = db.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(422, f"requirement {requirement_id} does not exist")
    if scenario_id is not None:
        scenario = db.get(TestScenario, scenario_id)
        if scenario is None:
            raise HTTPException(422, f"scenario {scenario_id} does not exist")
        if scenario.requirement_id != requirement_id:
            raise HTTPException(
                422, f"scenario {scenario_id} belongs to a different requirement"
            )
    if suite_id is not None and db.get(TestSuite, suite_id) is None:
        raise HTTPException(422, f"suite {suite_id} does not exist")
    return requirement
