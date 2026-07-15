from sqlalchemy.orm import Session

from ..models import Setting

BUDGET_THRESHOLD_KEY = "budget_threshold"
OVERALL_MONTHLY_CAP_KEY = "overall_monthly_cap"
DEFAULT_BUDGET_THRESHOLD = 80.0

MASHREQ_IMAP_HOST_KEY = "mashreq_imap_host"
MASHREQ_IMAP_PORT_KEY = "mashreq_imap_port"
MASHREQ_IMAP_USER_KEY = "mashreq_imap_user"
MASHREQ_IMAP_PASSWORD_KEY = "mashreq_imap_password"
MASHREQ_IMAP_FOLDER_KEY = "mashreq_imap_folder"
MASHREQ_CARD_ACCOUNTS_KEY = "mashreq_card_accounts"
DEFAULT_MASHREQ_IMAP_PORT = "993"
DEFAULT_MASHREQ_IMAP_FOLDER = "INBOX"


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


def get_str_setting(db: Session, key: str, default: str | None) -> str | None:
    row = db.get(Setting, key)
    if row is None or row.value == "":
        return default
    return row.value


def set_str_setting(db: Session, key: str, value: str | None) -> None:
    row = db.get(Setting, key)
    stored = value or ""
    if row is None:
        db.add(Setting(key=key, value=stored))
    else:
        row.value = stored
