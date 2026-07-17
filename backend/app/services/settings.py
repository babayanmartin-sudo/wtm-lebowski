import json

from sqlalchemy.orm import Session

from ..models import Setting

BUDGET_THRESHOLD_KEY = "budget_threshold"
OVERALL_MONTHLY_CAP_KEY = "overall_monthly_cap"
DEFAULT_BUDGET_THRESHOLD = 80.0

# Backs both Mashreq and Amazon sync — one shared mailbox by design — but
# the underlying DB key strings stay "mashreq_imap_*" so upgrades don't
# lose existing settings; only these Python names were renamed.
SYNC_IMAP_HOST_KEY = "mashreq_imap_host"
SYNC_IMAP_PORT_KEY = "mashreq_imap_port"
SYNC_IMAP_USER_KEY = "mashreq_imap_user"
SYNC_IMAP_PASSWORD_KEY = "mashreq_imap_password"
SYNC_IMAP_FOLDER_KEY = "mashreq_imap_folder"
DEFAULT_SYNC_IMAP_PORT = "993"
DEFAULT_SYNC_IMAP_FOLDER = "INBOX"

MASHREQ_CARD_ACCOUNTS_KEY = "mashreq_card_accounts"

AMAZON_DEFAULT_ACCOUNT_ID_KEY = "amazon_default_account_id"

MASHREQ_SYNC_ENABLED_KEY = "mashreq_sync_enabled"
AMAZON_SYNC_ENABLED_KEY = "amazon_sync_enabled"

AUTO_SYNC_ENABLED_KEY = "auto_sync_enabled"
AUTO_SYNC_FREQUENCY_KEY = "auto_sync_frequency_minutes"
AUTO_SYNC_LAST_RUN_KEY = "auto_sync_last_run"
DEFAULT_AUTO_SYNC_FREQUENCY_MINUTES = 60.0
MIN_AUTO_SYNC_FREQUENCY_MINUTES = 15.0

LLM_PROVIDER_KEY = "llm_provider"
LLM_API_KEY_KEY = "llm_api_key"
LLM_MODEL_KEY = "llm_model"

INSIGHTS_MEMORY_KEY = "insights_memory"
INSIGHTS_MEMORY_MAX_CHARS = 4000


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


def get_bool_setting(db: Session, key: str, default: bool) -> bool:
    row = db.get(Setting, key)
    if row is None or row.value == "":
        return default
    return row.value == "1"


def set_bool_setting(db: Session, key: str, value: bool) -> None:
    set_str_setting(db, key, "1" if value else "0")


def get_int_setting(db: Session, key: str, default: int | None) -> int | None:
    value = get_float_setting(db, key, None)
    return default if value is None else int(value)


def set_int_setting(db: Session, key: str, value: int | None) -> None:
    set_float_setting(db, key, None if value is None else float(value))


def get_card_accounts(db: Session) -> dict[str, int]:
    """Mashreq card-suffix → account-id mapping, centralized here so the
    settings router and the sync endpoints don't each parse the JSON
    blob (and silently diverge on malformed-JSON handling)."""
    raw = get_str_setting(db, MASHREQ_CARD_ACCOUNTS_KEY, "{}")
    try:
        return json.loads(raw or "{}")
    except ValueError:
        return {}


def set_card_accounts(db: Session, value: dict[str, int] | None) -> None:
    set_str_setting(db, MASHREQ_CARD_ACCOUNTS_KEY, json.dumps(value) if value is not None else None)
