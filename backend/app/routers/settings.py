import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..schemas import SettingsIn, SettingsOut
from ..services.settings import (
    AMAZON_DEFAULT_ACCOUNT_ID_KEY,
    AMAZON_SYNC_ENABLED_KEY,
    BUDGET_THRESHOLD_KEY,
    DEFAULT_BUDGET_THRESHOLD,
    DEFAULT_MASHREQ_IMAP_FOLDER,
    DEFAULT_MASHREQ_IMAP_PORT,
    MASHREQ_CARD_ACCOUNTS_KEY,
    MASHREQ_IMAP_FOLDER_KEY,
    MASHREQ_IMAP_HOST_KEY,
    MASHREQ_IMAP_PASSWORD_KEY,
    MASHREQ_IMAP_PORT_KEY,
    INSIGHTS_MEMORY_KEY,
    LLM_API_KEY_KEY,
    LLM_MODEL_KEY,
    LLM_PROVIDER_KEY,
    MASHREQ_IMAP_USER_KEY,
    MASHREQ_SYNC_ENABLED_KEY,
    OVERALL_MONTHLY_CAP_KEY,
    get_bool_setting,
    get_float_setting,
    get_str_setting,
    set_bool_setting,
    set_float_setting,
    set_str_setting,
)

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_auth)])


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    raw_accounts = get_str_setting(db, MASHREQ_CARD_ACCOUNTS_KEY, "{}")
    try:
        card_accounts = json.loads(raw_accounts or "{}")
    except ValueError:
        card_accounts = {}
    return SettingsOut(
        budget_threshold=get_float_setting(db, BUDGET_THRESHOLD_KEY, DEFAULT_BUDGET_THRESHOLD),
        overall_monthly_cap=get_float_setting(db, OVERALL_MONTHLY_CAP_KEY, None),
        mashreq_imap_host=get_str_setting(db, MASHREQ_IMAP_HOST_KEY, "") or "",
        mashreq_imap_port=get_str_setting(db, MASHREQ_IMAP_PORT_KEY, DEFAULT_MASHREQ_IMAP_PORT) or "",
        mashreq_imap_user=get_str_setting(db, MASHREQ_IMAP_USER_KEY, "") or "",
        mashreq_imap_password=get_str_setting(db, MASHREQ_IMAP_PASSWORD_KEY, "") or "",
        mashreq_imap_folder=get_str_setting(db, MASHREQ_IMAP_FOLDER_KEY, DEFAULT_MASHREQ_IMAP_FOLDER) or "",
        mashreq_card_accounts=card_accounts,
        amazon_default_account_id=(
            int(v) if (v := get_float_setting(db, AMAZON_DEFAULT_ACCOUNT_ID_KEY, None)) is not None else None
        ),
        mashreq_sync_enabled=get_bool_setting(db, MASHREQ_SYNC_ENABLED_KEY, False),
        amazon_sync_enabled=get_bool_setting(db, AMAZON_SYNC_ENABLED_KEY, False),
        llm_provider=get_str_setting(db, LLM_PROVIDER_KEY, "") or "",
        llm_api_key=get_str_setting(db, LLM_API_KEY_KEY, "") or "",
        llm_model=get_str_setting(db, LLM_MODEL_KEY, "") or "",
        insights_memory=get_str_setting(db, INSIGHTS_MEMORY_KEY, "") or "",
    )


@router.put("", response_model=SettingsOut)
def update_settings(body: SettingsIn, db: Session = Depends(get_db)):
    fields = body.model_dump(exclude_unset=True)
    if "budget_threshold" in fields:
        set_float_setting(db, BUDGET_THRESHOLD_KEY, fields["budget_threshold"])
    if "overall_monthly_cap" in fields:
        set_float_setting(db, OVERALL_MONTHLY_CAP_KEY, fields["overall_monthly_cap"])
    if "mashreq_imap_host" in fields:
        set_str_setting(db, MASHREQ_IMAP_HOST_KEY, fields["mashreq_imap_host"])
    if "mashreq_imap_port" in fields:
        set_str_setting(db, MASHREQ_IMAP_PORT_KEY, fields["mashreq_imap_port"])
    if "mashreq_imap_user" in fields:
        set_str_setting(db, MASHREQ_IMAP_USER_KEY, fields["mashreq_imap_user"])
    if "mashreq_imap_password" in fields:
        set_str_setting(db, MASHREQ_IMAP_PASSWORD_KEY, fields["mashreq_imap_password"])
    if "mashreq_imap_folder" in fields:
        set_str_setting(db, MASHREQ_IMAP_FOLDER_KEY, fields["mashreq_imap_folder"])
    if "mashreq_card_accounts" in fields:
        value = fields["mashreq_card_accounts"]
        set_str_setting(db, MASHREQ_CARD_ACCOUNTS_KEY, json.dumps(value) if value is not None else None)
    if "amazon_default_account_id" in fields:
        value = fields["amazon_default_account_id"]
        set_float_setting(db, AMAZON_DEFAULT_ACCOUNT_ID_KEY, float(value) if value is not None else None)
    if "mashreq_sync_enabled" in fields:
        set_bool_setting(db, MASHREQ_SYNC_ENABLED_KEY, bool(fields["mashreq_sync_enabled"]))
    if "amazon_sync_enabled" in fields:
        set_bool_setting(db, AMAZON_SYNC_ENABLED_KEY, bool(fields["amazon_sync_enabled"]))
    if "llm_provider" in fields:
        set_str_setting(db, LLM_PROVIDER_KEY, fields["llm_provider"])
    if "llm_api_key" in fields:
        set_str_setting(db, LLM_API_KEY_KEY, fields["llm_api_key"])
    if "llm_model" in fields:
        set_str_setting(db, LLM_MODEL_KEY, fields["llm_model"])
    if "insights_memory" in fields:
        set_str_setting(db, INSIGHTS_MEMORY_KEY, fields["insights_memory"])
    db.commit()
    return get_settings(db)
