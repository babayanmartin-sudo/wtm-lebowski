from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..models import Account, Transaction
from .rates import get_rate


def compute_balances(db: Session, as_of: date | None = None) -> dict[int, float]:
    """Account id -> balance in the account's own currency.

    With as_of set, only transactions dated on or before that day count —
    the balance as it stood at end of that day.
    """
    balances: dict[int, float] = {
        acc.id: acc.initial_balance for acc in db.scalars(select(Account))
    }

    flows_stmt = select(
        Transaction.account_id,
        func.sum(
            case(
                (Transaction.kind == "income", Transaction.amount),
                else_=-Transaction.amount,  # expense and transfer-out
            )
        ),
    )
    incoming_stmt = select(
        Transaction.transfer_account_id, func.sum(Transaction.transfer_amount)
    ).where(Transaction.kind == "transfer", Transaction.transfer_account_id.isnot(None))

    if as_of is not None:
        flows_stmt = flows_stmt.where(Transaction.date <= as_of)
        incoming_stmt = incoming_stmt.where(Transaction.date <= as_of)

    for account_id, delta in db.execute(flows_stmt.group_by(Transaction.account_id)).all():
        balances[account_id] = balances.get(account_id, 0.0) + (delta or 0.0)

    for account_id, total in db.execute(
        incoming_stmt.group_by(Transaction.transfer_account_id)
    ).all():
        balances[account_id] = balances.get(account_id, 0.0) + (total or 0.0)

    return {k: round(v, 2) for k, v in balances.items()}


def balance_in_base(db: Session, account: Account, balance: float, on_date: date | None = None) -> float:
    return round(balance * get_rate(db, account.currency, on_date), 2)
