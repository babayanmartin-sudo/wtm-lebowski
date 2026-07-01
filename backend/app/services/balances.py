from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..models import Account, Transaction
from .rates import get_rate


def compute_balances(db: Session) -> dict[int, float]:
    """Account id -> current balance in the account's own currency."""
    balances: dict[int, float] = {
        acc.id: acc.initial_balance for acc in db.scalars(select(Account))
    }

    flows = db.execute(
        select(
            Transaction.account_id,
            func.sum(
                case(
                    (Transaction.kind == "income", Transaction.amount),
                    else_=-Transaction.amount,  # expense and transfer-out
                )
            ),
        ).group_by(Transaction.account_id)
    ).all()
    for account_id, delta in flows:
        balances[account_id] = balances.get(account_id, 0.0) + (delta or 0.0)

    incoming = db.execute(
        select(Transaction.transfer_account_id, func.sum(Transaction.transfer_amount))
        .where(Transaction.kind == "transfer", Transaction.transfer_account_id.isnot(None))
        .group_by(Transaction.transfer_account_id)
    ).all()
    for account_id, total in incoming:
        balances[account_id] = balances.get(account_id, 0.0) + (total or 0.0)

    return {k: round(v, 2) for k, v in balances.items()}


def balance_in_base(db: Session, account: Account, balance: float) -> float:
    return round(balance * get_rate(db, account.currency), 2)
