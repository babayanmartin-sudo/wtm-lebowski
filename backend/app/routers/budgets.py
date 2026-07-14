from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Budget, Category, Split, Transaction
from ..schemas import BudgetIn, BudgetOut, BudgetStatus, OverallBudgetStatus
from ..services.settings import OVERALL_MONTHLY_CAP_KEY, get_float_setting
from .dashboard import _excluded_category_ids

router = APIRouter(prefix="/api/budgets", tags=["budgets"], dependencies=[Depends(require_auth)])

_PERIODS = ("monthly", "yearly")
_EPS = 0.005


@router.get("", response_model=list[BudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    return db.scalars(select(Budget)).all()


@router.post("", response_model=BudgetOut, status_code=201)
def create_budget(body: BudgetIn, db: Session = Depends(get_db)):
    if body.period not in _PERIODS:
        raise HTTPException(400, "period must be 'monthly' or 'yearly'")
    category = db.get(Category, body.category_id)
    if not category:
        raise HTTPException(400, "Category not found")
    if db.scalar(
        select(Budget).where(Budget.category_id == body.category_id, Budget.period == body.period)
    ):
        raise HTTPException(409, f"A {body.period} budget for this category already exists")
    _validate_budget(db, category, body.period, body.amount, exclude_budget_id=None)
    b = Budget(**body.model_dump())
    db.add(b)
    db.commit()
    return b


@router.put("/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: int, body: BudgetIn, db: Session = Depends(get_db)):
    b = db.get(Budget, budget_id)
    if not b:
        raise HTTPException(404, "Budget not found")
    if body.period not in _PERIODS:
        raise HTTPException(400, "period must be 'monthly' or 'yearly'")
    if body.period != b.period and db.scalar(
        select(Budget).where(Budget.category_id == b.category_id, Budget.period == body.period)
    ):
        raise HTTPException(409, f"A {body.period} budget for this category already exists")
    _validate_budget(db, b.category, body.period, body.amount, exclude_budget_id=b.id)
    b.amount = body.amount
    b.period = body.period
    db.commit()
    return b


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    b = db.get(Budget, budget_id)
    if not b:
        raise HTTPException(404, "Budget not found")
    db.delete(b)
    db.commit()


@router.get("/status", response_model=list[BudgetStatus])
def budget_status(month: str | None = Query(default=None), db: Session = Depends(get_db)):
    return compute_budget_status(db, month or date.today().strftime("%Y-%m"))


@router.get("/overall-status", response_model=OverallBudgetStatus)
def overall_budget_status(month: str | None = Query(default=None), db: Session = Depends(get_db)):
    m = month or date.today().strftime("%Y-%m")
    excluded_ids = _excluded_category_ids({c.id: c for c in db.scalars(select(Category))})

    stmt = select(func.sum(Transaction.amount_base)).where(
        Transaction.kind == "expense", func.strftime("%Y-%m", Transaction.date) == m
    )
    if excluded_ids:
        stmt = stmt.where(
            Transaction.id.not_in(
                select(Split.transaction_id).where(Split.category_id.in_(excluded_ids))
            )
        )
    spent = db.scalar(stmt) or 0.0
    cap = get_float_setting(db, OVERALL_MONTHLY_CAP_KEY, None)
    return OverallBudgetStatus(cap=cap, spent=round(spent, 2), month=m)


def compute_budget_status(db: Session, month: str) -> list[BudgetStatus]:
    """Spend (base currency) per budget, in that budget's own window — the
    given month for monthly budgets, the whole year for yearly ones. Child
    category spend rolls up into the parent's budget."""
    year = month[:4]
    monthly_spent = _spent_by_category(db, func.strftime("%Y-%m", Transaction.date) == month)
    yearly_spent = _spent_by_category(db, func.strftime("%Y", Transaction.date) == year)

    parent_of = {
        c.id: c.parent_id for c in db.scalars(select(Category)) if c.parent_id is not None
    }

    result = []
    for b in db.scalars(select(Budget)):
        spent_by_cat = yearly_spent if b.period == "yearly" else monthly_spent
        spent = spent_by_cat.get(b.category_id, 0.0)
        spent += sum(v for cid, v in spent_by_cat.items() if parent_of.get(cid) == b.category_id)
        result.append(
            BudgetStatus(
                budget_id=b.id,
                category_id=b.category_id,
                amount=b.amount,
                period=b.period,
                spent=round(spent, 2),
                month=month,
            )
        )
    return result


def _spent_by_category(db: Session, date_filter) -> dict[int, float]:
    rows = db.execute(
        select(Split.category_id, func.sum(Split.amount_base))
        .join(Transaction, Transaction.id == Split.transaction_id)
        .where(Transaction.kind == "expense", date_filter, Split.category_id.isnot(None))
        .group_by(Split.category_id)
    ).all()
    return {cid: (total or 0.0) for cid, total in rows}


def _validate_budget(
    db: Session, category: Category, period: str, amount: float, exclude_budget_id: int | None
) -> None:
    """Enforce two consistency rules across a category's budgets:
    1. For the same category, a yearly budget can't exceed 12x its monthly one.
    2. For a parent/child category pair, the children's budgets (same period)
       can't sum to more than the parent's budget for that period.
    """
    other_period = "yearly" if period == "monthly" else "monthly"
    other = db.scalar(
        select(Budget).where(Budget.category_id == category.id, Budget.period == other_period)
    )
    if other:
        monthly = amount if period == "monthly" else other.amount
        yearly = amount if period == "yearly" else other.amount
        if yearly > monthly * 12 + _EPS:
            raise HTTPException(
                400,
                f"Yearly budget ({yearly:g}) can't exceed 12x the monthly budget "
                f"({monthly:g} x 12 = {monthly * 12:g})",
            )

    exclude_id = exclude_budget_id if exclude_budget_id is not None else -1

    if category.parent_id is None:
        child_ids = [c.id for c in category.children]
        if not child_ids:
            return
        children_sum = db.scalar(
            select(func.sum(Budget.amount)).where(
                Budget.category_id.in_(child_ids), Budget.period == period, Budget.id != exclude_id
            )
        ) or 0.0
        if children_sum > amount + _EPS:
            raise HTTPException(
                400,
                f"Subcategory {period} budgets already total {children_sum:g}, "
                f"more than this {amount:g} limit",
            )
    else:
        parent_budget = db.scalar(
            select(Budget).where(Budget.category_id == category.parent_id, Budget.period == period)
        )
        if not parent_budget:
            return
        sibling_ids = [c.id for c in category.parent.children if c.id != category.id]
        siblings_sum = db.scalar(
            select(func.sum(Budget.amount)).where(
                Budget.category_id.in_(sibling_ids), Budget.period == period, Budget.id != exclude_id
            )
        ) or 0.0
        if siblings_sum + amount > parent_budget.amount + _EPS:
            raise HTTPException(
                400,
                f"Subcategory {period} budgets would total {siblings_sum + amount:g}, "
                f"more than the parent's {parent_budget.amount:g} limit",
            )
