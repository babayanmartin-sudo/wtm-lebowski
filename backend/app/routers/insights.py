from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import Account
from ..schemas import InsightsAskIn, InsightsAskOut
from ..services.insights_llm import InsightsError, run_chat
from ..services.settings import LLM_API_KEY_KEY, LLM_MODEL_KEY, LLM_PROVIDER_KEY, get_str_setting

router = APIRouter(prefix="/api/insights", tags=["insights"], dependencies=[Depends(require_auth)])


@router.post("/ask", response_model=InsightsAskOut)
def ask(body: InsightsAskIn, db: Session = Depends(get_db)):
    provider = get_str_setting(db, LLM_PROVIDER_KEY, "")
    api_key = get_str_setting(db, LLM_API_KEY_KEY, "")
    model = get_str_setting(db, LLM_MODEL_KEY, "") or None
    if not provider or not api_key:
        raise HTTPException(400, "Configure the AI Assistant in Profile first")

    accounts = db.scalars(select(Account).where(Account.archived.is_(False))).all()
    system_prompt = (
        "You are a spending-insights assistant for a personal finance tracker. "
        f"Today's date is {date.today().isoformat()}. Base currency is {BASE_CURRENCY}. "
        f"The user's accounts: {', '.join(a.name for a in accounts) or 'none yet'}. "
        "Answer using the provided tools — never guess numbers. Be concise and specific, "
        "state amounts with the currency, and avoid generic financial advice. "
        "Format your reply in markdown: use a bulleted or numbered list when giving more "
        "than one figure or category, **bold** the key numbers, and use short paragraphs "
        "with blank lines between them — never one dense wall of text."
    )
    messages = [{"role": m.role, "content": m.content} for m in body.history] + [
        {"role": "user", "content": body.message}
    ]

    try:
        reply = run_chat(db, provider, api_key, model, system_prompt, messages)
    except InsightsError as e:
        raise HTTPException(502, str(e))

    return InsightsAskOut(reply=reply)
