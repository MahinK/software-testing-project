from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.crud import get_or_404
from app.db import get_db
from app.models import Defect, DefectStatus, Severity
from app.schemas import DefectRead, DefectUpdate

router = APIRouter(prefix="/defects", tags=["defects"])


@router.get("", response_model=list[DefectRead])
def list_defects(
    status: DefectStatus | None = None,
    severity: Severity | None = None,
    module: str | None = None,
    db: Session = Depends(get_db),
):
    q = select(Defect).order_by(Defect.id)
    if status is not None:
        q = q.where(Defect.status == status)
    if severity is not None:
        q = q.where(Defect.severity == severity)
    if module is not None:
        q = q.where(Defect.module == module)
    return db.scalars(q).all()


@router.get("/{defect_id}", response_model=DefectRead)
def get_defect(defect_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, Defect, defect_id)


@router.patch("/{defect_id}", response_model=DefectRead)
def update_defect(defect_id: int, body: DefectUpdate, db: Session = Depends(get_db)):
    defect = get_or_404(db, Defect, defect_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(422, f"{field} cannot be null")
        setattr(defect, field, value)
    db.commit()
    return defect
