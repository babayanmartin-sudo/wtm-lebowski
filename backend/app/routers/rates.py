from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import ExchangeRate
from ..schemas import RateOut
from ..services.rates import refresh_rates

router = APIRouter(prefix="/api/rates", tags=["rates"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[RateOut])
def latest_rates(db: Session = Depends(get_db)):
    latest = (
        select(ExchangeRate.currency, func.max(ExchangeRate.date).label("d"))
        .group_by(ExchangeRate.currency)
        .subquery()
    )
    return db.scalars(
        select(ExchangeRate).join(
            latest,
            (ExchangeRate.currency == latest.c.currency) & (ExchangeRate.date == latest.c.d),
        )
    ).all()


@router.get("/base")
def base_currency():
    return {"base": BASE_CURRENCY}


@router.post("/refresh")
def refresh(db: Session = Depends(get_db)):
    try:
        stored = refresh_rates(db)
    except Exception as e:
        raise HTTPException(502, f"Rate fetch failed: {e}")
    return {"stored": stored}
