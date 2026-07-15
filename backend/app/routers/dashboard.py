from datetime import date, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..config import BASE_CURRENCY
from ..db import get_db
from ..models import Account, Category, Split, Transaction
from ..schemas import TransactionOut
from ..services.balances import balance_in_base, compute_balances
from ..services.forecast import project_net_worth
from ..services.rates import to_base

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/summary")
def summary(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    account_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    start, end = _period(date_from, date_to)
    if start > end:
        raise HTTPException(400, "date_from must be on or before date_to")

    # net worth as it stood at the end of the selected period
    balances = compute_balances(db, as_of=end)
    accounts = db.scalars(
        select(Account).where(Account.archived.is_(False), Account.exclude_from_net_worth.is_(False))
    ).all()
    net_worth = round(
        sum(
            balance_in_base(db, a, balances.get(a.id, a.initial_balance), on_date=end)
            for a in accounts
        ),
        2,
    )

    cat_ids = _category_ids_with_children(db, category_id)
    excluded_ids = _excluded_category_ids({c.id: c for c in db.scalars(select(Category))})
    transfer_flows = (
        _transfer_flows(db, start, end, account_id) if account_id and not cat_ids else []
    )
    totals = _totals(db, start, end, account_id, cat_ids, excluded_ids, transfer_flows)
    granularity, series = _series(db, start, end, account_id, cat_ids, excluded_ids, transfer_flows)

    return {
        "base_currency": BASE_CURRENCY,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "account_id": account_id,
        "category_id": category_id,
        "net_worth": net_worth,
        "income": round(totals.get("income") or 0.0, 2),
        "expense": round(totals.get("expense") or 0.0, 2),
        "by_category": _by_category(db, start, end, account_id, category_id, kind="expense"),
        "by_category_income": _by_category(db, start, end, account_id, category_id, kind="income"),
        "series": series,
        "series_granularity": granularity,
        "recent": _recent(db, start, end, account_id, cat_ids),
    }


@router.get("/projection")
def projection(months: int = Query(default=12, ge=1, le=36), db: Session = Depends(get_db)):
    """Projected net worth at each month-end, driven by active recurring
    templates and monthly budgets."""
    balances = compute_balances(db)
    accounts = db.scalars(
        select(Account).where(Account.archived.is_(False), Account.exclude_from_net_worth.is_(False))
    ).all()
    current = round(
        sum(balance_in_base(db, a, balances.get(a.id, a.initial_balance)) for a in accounts), 2
    )
    return {
        "base_currency": BASE_CURRENCY,
        "current_net_worth": current,
        "points": project_net_worth(db, current, months),
    }


def _period(date_from: str | None, date_to: str | None) -> tuple[date, date]:
    if date_from and date_to:
        return date.fromisoformat(date_from), date.fromisoformat(date_to)
    today = date.today()
    start = today.replace(day=1)
    end = start + relativedelta(months=1) - timedelta(days=1)
    return start, end


def _category_ids_with_children(db: Session, category_id: int | None) -> list[int] | None:
    if not category_id:
        return None
    cat = db.get(Category, category_id)
    ids = [category_id]
    if cat:
        ids += [c.id for c in cat.children]
    return ids


def _apply_filters(
    stmt,
    account_id: int | None,
    cat_ids: list[int] | None,
    excluded_ids: set[int] | None = None,
    exclude_cat_ids: list[int] | None = None,
):
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if cat_ids:
        stmt = stmt.where(
            Transaction.id.in_(select(Split.transaction_id).where(Split.category_id.in_(cat_ids)))
        )
    if excluded_ids:
        stmt = stmt.where(
            Transaction.id.not_in(
                select(Split.transaction_id).where(Split.category_id.in_(excluded_ids))
            )
        )
    if exclude_cat_ids:
        stmt = stmt.where(
            Transaction.id.not_in(
                select(Split.transaction_id).where(Split.category_id.in_(exclude_cat_ids))
            )
        )
    return stmt


def _transfer_flows(
    db: Session, start: date, end: date, account_id: int
) -> list[tuple[date, str, float]]:
    """(date, 'expense'|'income', base amount) for transfer legs touching this account —
    a transfer moves real money in/out of a single account even though it nets to zero
    globally, so it should count in that account's own income/spent view."""
    rows: list[tuple[date, str, float]] = []
    out_stmt = select(Transaction.date, Transaction.amount_base).where(
        Transaction.kind == "transfer",
        Transaction.account_id == account_id,
        Transaction.date >= start,
        Transaction.date <= end,
    )
    for d, amount in db.execute(out_stmt).all():
        rows.append((d, "expense", amount or 0.0))

    in_stmt = (
        select(Transaction.date, Transaction.transfer_amount, Account.currency)
        .join(Account, Account.id == Transaction.transfer_account_id)
        .where(
            Transaction.kind == "transfer",
            Transaction.transfer_account_id == account_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
    )
    for d, amount, currency in db.execute(in_stmt).all():
        rows.append((d, "income", to_base(db, amount or 0.0, currency, d)))
    return rows


def _totals(
    db: Session,
    start: date,
    end: date,
    account_id: int | None,
    cat_ids: list[int] | None,
    excluded_ids: set[int] | None = None,
    transfer_flows: list[tuple[date, str, float]] | None = None,
    exclude_cat_ids: list[int] | None = None,
) -> dict[str, float]:
    stmt = select(Transaction.kind, func.sum(Transaction.amount_base)).where(
        Transaction.date >= start, Transaction.date <= end, Transaction.kind.in_(["expense", "income"])
    )
    stmt = _apply_filters(stmt, account_id, cat_ids, excluded_ids, exclude_cat_ids).group_by(Transaction.kind)
    totals = dict(db.execute(stmt).all())
    if account_id and not cat_ids:
        flows = transfer_flows if transfer_flows is not None else _transfer_flows(db, start, end, account_id)
        for _, kind, amount in flows:
            totals[kind] = (totals.get(kind) or 0.0) + amount
    return totals


def _excluded_category_ids(categories: dict[int, Category]) -> set[int]:
    """A category excluded from reports also excludes its children —
    toggling the parent cascades down without writing the flag on each child."""
    excluded = {cid for cid, c in categories.items() if c.excluded_from_reports}
    return excluded | {cid for cid, c in categories.items() if c.parent_id in excluded}


def _by_category(
    db: Session,
    start: date,
    end: date,
    account_id: int | None,
    category_id: int | None,
    kind: str = "expense",
) -> list[dict]:
    """Breakdown for the period for the given kind ("expense" or "income").
    With no category filter, children roll up into their top-level parent.
    With a category filter that belongs to this `kind`, breaks the chosen
    category down into its own children (or itself if it has none) — a
    category_id belonging to the *other* kind is ignored here, since the
    caller runs this once per kind and each pass should only ever drill its
    own kind's breakdown, never the other one's.

    Splits of the opposite kind under a same-kind category are refund-style
    corrections (e.g. an expense return recorded as income) — they net
    against the total instead of being ignored or double-counted."""
    categories = {c.id: c for c in db.scalars(select(Category))}
    excluded_ids = _excluded_category_ids(categories)
    drill_id = (
        category_id
        if category_id is not None and category_id in categories and categories[category_id].kind == kind
        else None
    )
    other_kind = "income" if kind == "expense" else "expense"
    matching_cat_ids = [cid for cid, c in categories.items() if c.kind == kind and cid not in excluded_ids]

    stmt = (
        select(Split.category_id, Transaction.kind, func.sum(Split.amount_base))
        .join(Transaction, Transaction.id == Split.transaction_id)
        .where(
            Transaction.date >= start,
            Transaction.date <= end,
            or_(
                Transaction.kind == kind,
                (Transaction.kind == other_kind) & Split.category_id.in_(matching_cat_ids),
            ),
        )
    )
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    rows = db.execute(stmt.group_by(Split.category_id, Transaction.kind)).all()
    amounts: dict[int | None, float] = {}
    for cid, txn_kind, amt in rows:
        if cid in excluded_ids:
            continue
        signed = (amt or 0.0) if txn_kind == kind else -(amt or 0.0)
        amounts[cid] = amounts.get(cid, 0.0) + signed

    if drill_id:
        children = [c.id for c in categories.values() if c.parent_id == drill_id]
        # Include parent in the breakdown to show total + child breakdown
        wanted = ([drill_id] + children) if children else [drill_id]
        totals = {cid: amounts.get(cid, 0.0) for cid in wanted}
    else:
        totals: dict[int | None, float] = {}
        for cid, amount in amounts.items():
            top = cid
            if cid is not None and categories[cid].parent_id is not None:
                top = categories[cid].parent_id
            totals[top] = totals.get(top, 0.0) + amount

    result = []
    for cid, total in sorted(totals.items(), key=lambda kv: -kv[1]):
        if total == 0:
            continue
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


def _granularity(start: date, end: date) -> str:
    span = (end - start).days
    if span <= 31:
        return "day"
    if span <= 182:
        return "week"
    return "month"


def _bucket_start(d: date, granularity: str) -> date:
    if granularity == "day":
        return d
    if granularity == "week":
        return d - timedelta(days=d.weekday())
    return d.replace(day=1)


def _series(
    db: Session,
    start: date,
    end: date,
    account_id: int | None,
    cat_ids: list[int] | None,
    excluded_ids: set[int] | None = None,
    transfer_flows: list[tuple[date, str, float]] | None = None,
    exclude_cat_ids: list[int] | None = None,
) -> tuple[str, list[dict]]:
    granularity = _granularity(start, end)
    step = {
        "day": relativedelta(days=1),
        "week": relativedelta(weeks=1),
        "month": relativedelta(months=1),
    }[granularity]

    buckets: dict[str, dict] = {}
    cursor = _bucket_start(start, granularity)
    bucket_end = _bucket_start(end, granularity)
    if granularity == "month":
        # a multi-month range (e.g. year view) shouldn't render bars for
        # months that haven't happened yet
        bucket_end = min(bucket_end, _bucket_start(date.today(), granularity))
    while cursor <= bucket_end:
        key = cursor.isoformat()
        buckets[key] = {"label": key, "income": 0.0, "expense": 0.0}
        cursor += step

    stmt = select(Transaction.date, Transaction.kind, Transaction.amount_base).where(
        Transaction.date >= start, Transaction.date <= end, Transaction.kind.in_(["expense", "income"])
    )
    stmt = _apply_filters(stmt, account_id, cat_ids, excluded_ids, exclude_cat_ids)
    for d, kind, amount in db.execute(stmt).all():
        key = _bucket_start(d, granularity).isoformat()
        bucket = buckets.setdefault(key, {"label": key, "income": 0.0, "expense": 0.0})
        bucket[kind] = round(bucket[kind] + (amount or 0.0), 2)

    if account_id and not cat_ids:
        flows = transfer_flows if transfer_flows is not None else _transfer_flows(db, start, end, account_id)
        for d, kind, amount in flows:
            key = _bucket_start(d, granularity).isoformat()
            bucket = buckets.setdefault(key, {"label": key, "income": 0.0, "expense": 0.0})
            bucket[kind] = round(bucket[kind] + amount, 2)

    ordered = [buckets[k] for k in sorted(buckets.keys())]
    return granularity, ordered


def _recent(
    db: Session,
    start: date,
    end: date,
    account_id: int | None,
    cat_ids: list[int] | None,
    limit: int = 10,
    exclude_cat_ids: list[int] | None = None,
) -> list[dict]:
    stmt = select(Transaction).options(selectinload(Transaction.splits)).where(
        Transaction.date >= start, Transaction.date <= end
    )
    if account_id:
        stmt = stmt.where(
            or_(Transaction.account_id == account_id, Transaction.transfer_account_id == account_id)
        )
    if cat_ids:
        stmt = stmt.where(
            Transaction.id.in_(select(Split.transaction_id).where(Split.category_id.in_(cat_ids)))
        )
    if exclude_cat_ids:
        stmt = stmt.where(
            Transaction.id.not_in(
                select(Split.transaction_id).where(Split.category_id.in_(exclude_cat_ids))
            )
        )
    txs = db.scalars(stmt.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(limit)).all()
    return [TransactionOut.model_validate(t).model_dump(mode="json") for t in txs]
