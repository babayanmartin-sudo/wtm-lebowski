from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import Account, Category, Split, Transaction
from ..schemas import TransactionOut
from ..services.balances import balance_in_base, compute_balances

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/summary")
def summary(month: str | None = Query(default=None), db: Session = Depends(get_db)):
    month = month or date.today().strftime("%Y-%m")
    balances = compute_balances(db)
    accounts = db.scalars(select(Account).where(Account.archived.is_(False))).all()
    net_worth = round(
        sum(balance_in_base(db, a, balances.get(a.id, a.initial_balance)) for a in accounts), 2
    )

    month_expr = func.strftime("%Y-%m", Transaction.date)
    totals = dict(
        db.execute(
            select(Transaction.kind, func.sum(Transaction.amount_base))
            .where(month_expr == month, Transaction.kind.in_(["expense", "income"]))
            .group_by(Transaction.kind)
        ).all()
    )

    return {
        "base_currency": BASE_CURRENCY,
        "month": month,
        "net_worth": net_worth,
        "income": round(totals.get("income") or 0.0, 2),
        "expense": round(totals.get("expense") or 0.0, 2),
        "by_category": _by_category(db, month),
        "monthly": _monthly_series(db),
        "recent": _recent(db),
    }


def _by_category(db: Session, month: str) -> list[dict]:
    """Month's expenses grouped by top-level category (children rolled up)."""
    rows = db.execute(
        select(Split.category_id, func.sum(Split.amount_base))
        .join(Transaction, Transaction.id == Split.transaction_id)
        .where(Transaction.kind == "expense", func.strftime("%Y-%m", Transaction.date) == month)
        .group_by(Split.category_id)
    ).all()
    categories = {c.id: c for c in db.scalars(select(Category))}
    totals: dict[int | None, float] = {}
    for cid, amount in rows:
        top = cid
        if cid is not None and categories[cid].parent_id is not None:
            top = categories[cid].parent_id
        totals[top] = totals.get(top, 0.0) + (amount or 0.0)
    result = []
    for cid, total in sorted(totals.items(), key=lambda kv: -kv[1]):
        cat = categories.get(cid) if cid else None
        result.append(
            {
                "category_id": cid,
                "name": cat.name if cat else "Uncategorized",
                "color": cat.color if cat else "#64748b",
                "amount": round(total, 2),
            }
        )
    return result


def _monthly_series(db: Session, months: int = 6) -> list[dict]:
    start = (date.today().replace(day=1) - relativedelta(months=months - 1)).strftime("%Y-%m")
    month_expr = func.strftime("%Y-%m", Transaction.date)
    rows = db.execute(
        select(month_expr, Transaction.kind, func.sum(Transaction.amount_base))
        .where(month_expr >= start, Transaction.kind.in_(["expense", "income"]))
        .group_by(month_expr, Transaction.kind)
    ).all()
    series: dict[str, dict] = {}
    cursor = date.today().replace(day=1) - relativedelta(months=months - 1)
    for _ in range(months):
        key = cursor.strftime("%Y-%m")
        series[key] = {"month": key, "income": 0.0, "expense": 0.0}
        cursor += relativedelta(months=1)
    for month_key, kind, total in rows:
        if month_key in series:
            series[month_key][kind] = round(total or 0.0, 2)
    return list(series.values())


def _recent(db: Session, limit: int = 10) -> list[dict]:
    txs = db.scalars(
        select(Transaction)
        .options(selectinload(Transaction.splits))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
    ).all()
    return [TransactionOut.model_validate(t).model_dump(mode="json") for t in txs]
