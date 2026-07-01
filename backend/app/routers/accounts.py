from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Account, Transaction
from ..schemas import AccountIn, AccountOut
from ..services.balances import balance_in_base, compute_balances

router = APIRouter(prefix="/api/accounts", tags=["accounts"], dependencies=[Depends(require_auth)])


def _with_balance(db: Session, acc: Account, balances: dict[int, float]) -> AccountOut:
    out = AccountOut.model_validate(acc)
    out.balance = balances.get(acc.id, acc.initial_balance)
    out.balance_base = balance_in_base(db, acc, out.balance)
    return out


@router.get("", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db)):
    balances = compute_balances(db)
    accounts = db.scalars(select(Account).order_by(Account.sort_order, Account.id)).all()
    return [_with_balance(db, a, balances) for a in accounts]


@router.post("", response_model=AccountOut, status_code=201)
def create_account(body: AccountIn, db: Session = Depends(get_db)):
    if db.scalar(select(Account).where(Account.name == body.name)):
        raise HTTPException(409, "Account name already exists")
    acc = Account(**body.model_dump())
    db.add(acc)
    db.commit()
    return _with_balance(db, acc, compute_balances(db))


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, body: AccountIn, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    has_tx = db.scalar(
        select(Transaction.id)
        .where((Transaction.account_id == account_id) | (Transaction.transfer_account_id == account_id))
        .limit(1)
    )
    if has_tx and body.currency != acc.currency:
        raise HTTPException(400, "Cannot change currency of an account with transactions")
    for key, value in body.model_dump().items():
        setattr(acc, key, value)
    db.commit()
    return _with_balance(db, acc, compute_balances(db))


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, "Account not found")
    has_tx = db.scalar(
        select(Transaction.id)
        .where((Transaction.account_id == account_id) | (Transaction.transfer_account_id == account_id))
        .limit(1)
    )
    if has_tx:
        raise HTTPException(400, "Account has transactions — archive it instead")
    db.delete(acc)
    db.commit()
