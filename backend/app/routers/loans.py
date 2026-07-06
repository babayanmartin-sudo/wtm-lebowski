from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Loan, Transaction
from ..schemas import LoanIn, LoanOut

router = APIRouter(prefix="/api/loans", tags=["loans"], dependencies=[Depends(require_auth)])

_DIRECTIONS = ("debt", "receivable")


def _out(db: Session, loan: Loan) -> LoanOut:
    kind = "expense" if loan.direction == "debt" else "income"
    paid = db.scalar(
        select(func.sum(Transaction.amount_base)).where(
            Transaction.loan_id == loan.id, Transaction.kind == kind
        )
    ) or 0.0
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
