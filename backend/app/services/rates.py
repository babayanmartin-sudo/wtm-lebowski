"""Exchange rates: fetched daily from open.er-api.com (free, keyless), cached in DB.

rate_to_base: 1 unit of foreign currency = X units of base (AED).
Offline fallback: latest cached rate on or before the requested date,
else the earliest known rate, else 1.0.
"""

from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import BASE_CURRENCY
from ..models import ExchangeRate

API_URL = f"https://open.er-api.com/v6/latest/{BASE_CURRENCY}"


def refresh_rates(db: Session, on_date: date | None = None) -> int:
    """Fetch today's rates. Returns number of currencies stored."""
    on_date = on_date or date.today()
    already = db.scalar(select(ExchangeRate.id).where(ExchangeRate.date == on_date).limit(1))
    if already:
        return 0
    resp = httpx.get(API_URL, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("result") != "success":
        raise RuntimeError(f"Rate API error: {data.get('error-type')}")
    count = 0
    for currency, base_to_cur in data["rates"].items():
        if currency == BASE_CURRENCY or not base_to_cur:
            continue
        db.add(ExchangeRate(date=on_date, currency=currency, rate_to_base=1.0 / base_to_cur))
        count += 1
    db.commit()
    return count


def get_rate(db: Session, currency: str, on_date: date | None = None) -> float:
    if currency == BASE_CURRENCY:
        return 1.0
    on_date = on_date or date.today()
    row = db.scalar(
        select(ExchangeRate)
        .where(ExchangeRate.currency == currency, ExchangeRate.date <= on_date)
        .order_by(ExchangeRate.date.desc())
        .limit(1)
    )
    if row is None:
        row = db.scalar(
            select(ExchangeRate)
            .where(ExchangeRate.currency == currency)
            .order_by(ExchangeRate.date.asc())
            .limit(1)
        )
    return row.rate_to_base if row else 1.0


def to_base(db: Session, amount: float, currency: str, on_date: date | None = None) -> float:
    return round(amount * get_rate(db, currency, on_date), 2)
