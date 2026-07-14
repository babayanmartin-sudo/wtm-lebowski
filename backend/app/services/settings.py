from sqlalchemy.orm import Session

from ..models import Setting

BUDGET_THRESHOLD_KEY = "budget_threshold"
OVERALL_MONTHLY_CAP_KEY = "overall_monthly_cap"
DEFAULT_BUDGET_THRESHOLD = 80.0


def get_float_setting(db: Session, key: str, default: float | None) -> float | None:
    row = db.get(Setting, key)
    if row is None or row.value == "":
        return default
    return float(row.value)


def set_float_setting(db: Session, key: str, value: float | None) -> None:
    row = db.get(Setting, key)
    stored = "" if value is None else str(value)
    if row is None:
        db.add(Setting(key=key, value=stored))
    else:
        row.value = stored
