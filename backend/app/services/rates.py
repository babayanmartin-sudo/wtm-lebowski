"""Exchange rates: fetched daily from open.er-api.com (free, keyless), cached in DB.

Two distinct notions of "base" here — don't conflate them:

- ANCHOR (config.BASE_CURRENCY, e.g. "AED"): the fixed pivot currency the
  free API is queried against and every ExchangeRate.rate_to_base is
  stored relative to. Never changes at runtime — changing it would
  invalidate the whole cache.
- display/base currency (get_base_currency()): the currency everything
  is actually shown/summed in — dynamically whichever account has
  is_main=True, falling back to ANCHOR if none is set. `to_base()`
  converts to *this*, cross-conveting through ANCHOR as needed.

Offline fallback for a missing rate: latest cached rate on or before the
requested date, else the earliest known rate, else 1.0.
"""

from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import BASE_CURRENCY
from ..models import Account, ExchangeRate

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
    """1 unit of `currency` = X units of ANCHOR (config.BASE_CURRENCY)."""
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


def get_base_currency(db: Session) -> str:
    """The display/aggregation currency — whichever account is flagged
    is_main, or ANCHOR if none is set (matches pre-dynamic-base
    behavior exactly, so installs with no main account picked yet see
    no change)."""
    main = db.scalar(select(Account).where(Account.is_main.is_(True)).limit(1))
    return main.currency if main else BASE_CURRENCY


def convert(db: Session, amount: float, from_currency: str, to_currency: str, on_date: date | None = None) -> float:
    """Convert an amount between any two currencies, cross-converting
    through ANCHOR when neither side is it."""
    if from_currency == to_currency:
        return round(amount, 2)
    rate = get_rate(db, from_currency, on_date) / get_rate(db, to_currency, on_date)
    return round(amount * rate, 2)


def to_base(db: Session, amount: float, currency: str, on_date: date | None = None) -> float:
    return convert(db, amount, currency, get_base_currency(db), on_date)


def recompute_all_amount_base(db: Session) -> int:
    """Every Transaction/Split.amount_base is a denormalized cache of
    amount converted to the *display* base currency, kept stored so SQL
    can SUM() it cheaply. Since that base is now dynamic (follows
    is_main), anything that changes which account is main — or which
    invalidates cached rates — makes the cache stale. Recomputes from
    each transaction's own (amount, currency, date), which are always
    authoritative, never from a previously-cached amount_base. Returns
    the number of transactions touched."""
    from ..models import Transaction  # local import: avoid a rates<->models cycle

    count = 0
    for tx in db.scalars(select(Transaction)):
        tx.amount_base = to_base(db, tx.amount, tx.currency, tx.date)
        for split in tx.splits:
            split.amount_base = to_base(db, split.amount, tx.currency, tx.date)
        count += 1
    db.commit()
    return count
