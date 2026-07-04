from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Budget, Category, Split, Transaction
from ..schemas import BudgetIn, BudgetOut, BudgetStatus

router = APIRouter(prefix="/api/budgets", tags=["budgets"], dependencies=[Depends(require_auth)])

_PERIODS = ("monthly", "yearly")


@router.get("", response_model=list[BudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    return db.scalars(select(Budget)).all()


@router.post("", response_model=BudgetOut, status_code=201)
def create_budget(body: BudgetIn, db: Session = Depends(get_db)):
    if body.period not in _PERIODS:
        raise HTTPException(400, "period must be 'monthly' or 'yearly'")
    if not db.get(Category, body.category_id):
        raise HTTPException(400, "Category not found")
    if db.scalar(select(Budget).where(Budget.category_id == body.category_id)):
        raise HTTPException(409, "Budget for this category already exists")
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
