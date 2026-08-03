from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Loan, Transaction
from ..schemas import LoanIn, LoanOut
from ..services.rates import convert

router = APIRouter(prefix="/api/loans", tags=["loans"], dependencies=[Depends(require_auth)])

_DIRECTIONS = ("debt", "receivable")


def _out(db: Session, loan: Loan) -> LoanOut:
    # Converts each transaction's own (amount, currency) directly to
    # loan.currency — exact when they already match (the common case, no
    # rate math at all), cross-converted through the rate anchor
    # otherwise. Deliberately never reads amount_base: that's a cache of
    # amount converted to the *display* base currency (which is dynamic —
    # see get_base_currency), a different and unrelated conversion target
    # from loan.currency, and re-deriving one from the other risks the
    # kind of silent drift a previous version of this function had.
    kind = "expense" if loan.direction == "debt" else "income"
    txs = db.scalars(select(Transaction).where(Transaction.loan_id == loan.id, Transaction.kind == kind)).all()
    paid = sum(convert(db, t.amount, t.currency, loan.currency, t.date) for t in txs)
    out = LoanOut.model_validate(loan)
    out.paid = round(paid, 2)
    out.remaining = round(loan.principal_amount - paid, 2)
    return out


@router.get("", response_model=list[LoanOut])
def list_loans(db: Session = Depends(get_db)):
    return [_out(db, loan) for loan in db.scalars(select(Loan))]


@router.post("", response_model=LoanOut, status_code=201)
def create_loan(body: LoanIn, db: Session = Depends(get_db)):
    if body.direction not in _DIRECTIONS:
        raise HTTPException(400, "direction must be 'debt' or 'receivable'")
    loan = Loan(**body.model_dump())
    db.add(loan)
    db.commit()
    return _out(db, loan)


@router.put("/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, body: LoanIn, db: Session = Depends(get_db)):
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found")
    if body.direction not in _DIRECTIONS:
        raise HTTPException(400, "direction must be 'debt' or 'receivable'")
    if body.direction != loan.direction:
        linked_count = db.scalar(
            select(func.count(Transaction.loan_id)).where(Transaction.loan_id == loan_id)
        )
        if linked_count > 0:
            raise HTTPException(400, "Cannot change direction on loan with linked transactions")
    for key, value in body.model_dump().items():
        setattr(loan, key, value)
    db.commit()
    return _out(db, loan)


@router.delete("/{loan_id}", status_code=204)
def delete_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Loan not found")
    db.delete(loan)
    db.commit()
