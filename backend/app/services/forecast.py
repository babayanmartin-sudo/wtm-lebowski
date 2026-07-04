"""Net worth projection from recurring templates + monthly budgets.

Model, month by month from today to the horizon:
  income   = recurring income occurrences that month
  expenses = for each budgeted category: max(budget limit, recurring expenses
             planned in that category+children) — the budget is the planned
             floor of spending, but a recurring commitment above it wins;
             plus recurring expenses in categories with no budget.
For the current (partial) month only the *remaining* budget
(limit − already spent) and *remaining* recurring occurrences count.
Transfers move money between own accounts, so they don't change net worth
and are ignored. Everything is in base currency at today's rates.
"""

from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Budget, Category, Split, Template, Transaction
from .rates import to_base
from .recurring import advance


def project_net_worth(db: Session, start_net_worth: float, months: int) -> list[dict]:
    today = date.today()
    current_month_start = today.replace(day=1)
    horizon_end = current_month_start + relativedelta(months=months) - relativedelta(days=1)

    income_by_month, expense_by_cat_month = _recurring_occurrences(db, today, horizon_end)
    budgets, parent_of = _budget_context(db)
    spent_now = _spent_this_month(db, today) if budgets else {}

    points: list[dict] = []
    net = start_net_worth
    cursor = current_month_start
    for i in range(months):
        month_key = cursor.strftime("%Y-%m")
        cat_expenses = expense_by_cat_month.get(month_key, {})

        expense_total = 0.0
        counted: set[int | None] = set()
        for budget in budgets:
            covered = [budget.category_id] + [
                c for c, p in parent_of.items() if p == budget.category_id
            ]
            recurring_in_budget = sum(cat_expenses.get(c, 0.0) for c in covered)
            counted.update(covered)
            limit = budget.amount / 12 if budget.period == "yearly" else budget.amount
            if i == 0:  # partial current month: only what's left of the limit
                limit = max(0.0, limit - spent_now.get(budget.category_id, 0.0))
            expense_total += max(limit, recurring_in_budget)
        expense_total += sum(v for c, v in cat_expenses.items() if c not in counted)

        net = round(net + income_by_month.get(month_key, 0.0) - expense_total, 2)
        points.append({"month": month_key, "net_worth": net})
        cursor += relativedelta(months=1)
    return points


def _recurring_occurrences(
    db: Session, today: date, horizon_end: date
) -> tuple[dict[str, float], dict[str, dict[int | None, float]]]:
    income_by_month: dict[str, float] = {}
    expense_by_cat_month: dict[str, dict[int | None, float]] = {}

    templates = db.scalars(select(Template).where(Template.active.is_(True))).all()
    for t in templates:
        if t.kind == "transfer":
            continue
        amount = to_base(db, t.amount, t.account.currency)
        cur = t.next_due
        while cur <= horizon_end and (t.end_date is None or cur <= t.end_date):
            key = cur.strftime("%Y-%m")
            if t.kind == "income":
                income_by_month[key] = income_by_month.get(key, 0.0) + amount
            else:
                bucket = expense_by_cat_month.setdefault(key, {})
                bucket[t.category_id] = bucket.get(t.category_id, 0.0) + amount
            cur = advance(cur, t.frequency, t.interval)
    return income_by_month, expense_by_cat_month


def _budget_context(db: Session) -> tuple[list[Budget], dict[int, int]]:
    budgets = db.scalars(select(Budget)).all()
    parent_of = {
        c.id: c.parent_id for c in db.scalars(select(Category)) if c.parent_id is not None
    }
    return budgets, parent_of


def _spent_this_month(db: Session, today: date) -> dict[int, float]:
    """Spend so far this month per budgeted top-level category (children
    rolled up into the parent)."""
    month = today.strftime("%Y-%m")
    rows = db.execute(
        select(Split.category_id, func.sum(Split.amount_base))
        .join(Transaction, Transaction.id == Split.transaction_id)
        .where(Transaction.kind == "expense", func.strftime("%Y-%m", Transaction.date) == month)
        .group_by(Split.category_id)
    ).all()
    parent_of = {
        c.id: c.parent_id for c in db.scalars(select(Category)) if c.parent_id is not None
    }
    spent: dict[int, float] = {}
    for cid, total in rows:
        if cid is None:
            continue
        top = parent_of.get(cid, cid)
        spent[top] = spent.get(top, 0.0) + (total or 0.0)
    return spent
