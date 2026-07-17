from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import Account, InsightsConversation
from ..schemas import (
    InsightsAskIn,
    InsightsAskOut,
    InsightsConversationDetail,
    InsightsConversationSummary,
    InsightsTestIn,
    InsightsTestResult,
)
from ..services.insights_llm import InsightsError, run_chat
from ..services.insights_llm import test_connection as insights_test_connection
from ..services.settings import (
    DEFAULT_LLM_MAX_TOKENS,
    INSIGHTS_MEMORY_KEY,
    LLM_MAX_TOKENS_KEY,
    LLM_PROVIDER_KEY,
    UNCAPPED_LLM_MAX_TOKENS,
    get_int_setting,
    get_llm_credentials,
    get_str_setting,
)

router = APIRouter(prefix="/api/insights", tags=["insights"], dependencies=[Depends(require_auth)])

TITLE_MAX_LEN = 60


@router.post("/test", response_model=InsightsTestResult)
def test(body: InsightsTestIn, db: Session = Depends(get_db)):
    """Test the configured provider with the given (possibly unsaved) form
    values, falling back to whatever's already saved for any field left
    blank — same pattern as Mashreq's 'Test connection' button."""
    provider = body.llm_provider or get_str_setting(db, LLM_PROVIDER_KEY, "")
    saved_key, saved_model = get_llm_credentials(db, provider) if provider else ("", "")
    api_key = body.llm_api_key or saved_key
    model = body.llm_model or saved_model or None
    if not provider or not api_key:
        return InsightsTestResult(ok=False, message="Provider and API key are required")
    ok, message = insights_test_connection(provider, api_key, model)
    return InsightsTestResult(ok=ok, message=message)


@router.post("/ask", response_model=InsightsAskOut)
def ask(body: InsightsAskIn, db: Session = Depends(get_db)):
    provider = get_str_setting(db, LLM_PROVIDER_KEY, "")
    api_key, saved_model = get_llm_credentials(db, provider) if provider else ("", "")
    model = saved_model or None
    if not provider or not api_key:
        raise HTTPException(400, "Configure the AI Assistant in Profile first")
    max_tokens = get_int_setting(db, LLM_MAX_TOKENS_KEY, DEFAULT_LLM_MAX_TOKENS)
    if max_tokens == 0:  # "off" — Anthropic requires a value, so use a high ceiling instead
        max_tokens = UNCAPPED_LLM_MAX_TOKENS

    convo = None
    if body.conversation_id is not None:
        convo = db.get(InsightsConversation, body.conversation_id)
        if not convo:
            raise HTTPException(404, "Conversation not found")

    history = convo.messages if convo else []

    accounts = db.scalars(select(Account).where(Account.archived.is_(False))).all()
    memory = get_str_setting(db, INSIGHTS_MEMORY_KEY, "") or ""
    system_prompt = (
        "You are a spending-insights assistant for a personal finance tracker. "
        f"Today's date is {date.today().isoformat()}. Base currency is {BASE_CURRENCY}. "
        f"The user's accounts: {', '.join(a.name for a in accounts) or 'none yet'}. "
        "Answer using the provided tools — never guess numbers. Be concise and specific, "
        "state amounts with the currency, and avoid generic financial advice. "
        "Format your reply in markdown: use a bulleted or numbered list when giving more "
        "than one figure or category, **bold** the key numbers, and use short paragraphs "
        "with blank lines between them — never one dense wall of text."
        + (f"\n\nKnown preferences about this user (from earlier conversations):\n{memory}" if memory else "")
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in history] + [
        {"role": "user", "content": body.message}
    ]

    try:
        reply = run_chat(db, provider, api_key, model, system_prompt, messages, max_tokens)
    except InsightsError as e:
        raise HTTPException(502, str(e))

    updated_messages = history + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": reply},
    ]

    if convo is None:
        convo = InsightsConversation(
            title=body.message[:TITLE_MAX_LEN],
            messages=updated_messages,
        )
        db.add(convo)
    else:
        convo.messages = updated_messages
        convo.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(convo)

    return InsightsAskOut(reply=reply, conversation_id=convo.id)


@router.get("/conversations", response_model=list[InsightsConversationSummary])
def list_conversations(db: Session = Depends(get_db)):
    return db.scalars(
        select(InsightsConversation).order_by(InsightsConversation.updated_at.desc())
    ).all()


@router.get("/conversations/{conversation_id}", response_model=InsightsConversationDetail)
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    convo = db.get(InsightsConversation, conversation_id)
    if not convo:
        raise HTTPException(404, "Conversation not found")
    return convo


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    convo = db.get(InsightsConversation, conversation_id)
    if not convo:
        raise HTTPException(404, "Conversation not found")
    db.delete(convo)
    db.commit()
    return {"ok": True}
