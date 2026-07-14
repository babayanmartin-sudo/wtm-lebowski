from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..schemas import SettingsIn, SettingsOut
from ..services.settings import (
    BUDGET_THRESHOLD_KEY,
    DEFAULT_BUDGET_THRESHOLD,
    OVERALL_MONTHLY_CAP_KEY,
    get_float_setting,
    set_float_setting,
)

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_auth)])


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return SettingsOut(
        budget_threshold=get_float_setting(db, BUDGET_THRESHOLD_KEY, DEFAULT_BUDGET_THRESHOLD),
        overall_monthly_cap=get_float_setting(db, OVERALL_MONTHLY_CAP_KEY, None),
    )


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    fields = body.model_dump(exclude_unset=True)
    if "budget_threshold" in fields:
        set_float_setting(db, BUDGET_THRESHOLD_KEY, fields["budget_threshold"])
    if "overall_monthly_cap" in fields:
        set_float_setting(db, OVERALL_MONTHLY_CAP_KEY, fields["overall_monthly_cap"])
    db.commit()
    return get_settings(db)
