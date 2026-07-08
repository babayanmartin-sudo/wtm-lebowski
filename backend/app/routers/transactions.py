from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..db import get_db
from ..models import Account, Category, Loan, Split, Transaction
from ..schemas import BulkTransactionIn, BulkTransactionResult, TransactionIn, TransactionOut, TransactionPage
from ..services.matcher import learn
from ..services.rates import to_base

router = APIRouter(
    prefix="/api/transactions", tags=["transactions"], dependencies=[Depends(require_auth)]
)


@router.get("", response_model=TransactionPage)
def list_transactions(
    db: Session = Depends(get_db),
    account_id: int | None = None,
    category_id: int | None = None,
    uncategorized: bool = False,
    loan_id: int | None = None,
    kind: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    stmt = select(Transaction)
    if account_id:
        stmt = stmt.where(
            or_(Transaction.account_id == account_id, Transaction.transfer_account_id == account_id)
        )
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if date_from:
        stmt = stmt.where(Transaction.date >= date_from)
    if date_to:
        stmt = stmt.where(Transaction.date <= date_to)
    if category_id:
        cat = db.get(Category, category_id)
        ids = [category_id] + ([c.id for c in cat.children] if cat else [])
        stmt = stmt.where(
            Transaction.id.in_(select(Split.transaction_id).where(Split.category_id.in_(ids)))
        )
    if uncategorized:
        stmt = stmt.where(
            Transaction.kind != "transfer",
            ~Transaction.id.in_(
                select(Split.transaction_id).where(Split.category_id.isnot(None))
            ),
        )
    if loan_id:
        stmt = stmt.where(Transaction.loan_id == loan_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Transaction.payee.ilike(like), Transaction.note.ilike(like)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.options(selectinload(Transaction.splits))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return TransactionPage(items=items, total=total)


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(body: TransactionIn, db: Session = Depends(get_db)):
    tx = _build(db, body, Transaction())
    db.add(tx)
    _learn_from(db, tx)
    db.commit()
    return tx


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, body: TransactionIn, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    tx.splits.clear()
    _build(db, body, tx)
    _learn_from(db, tx)
    db.commit()
    return tx


@router.delete("/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transaction not found")
    db.delete(tx)
    db.commit()


@router.post("/bulk", response_model=BulkTransactionResult)
def bulk_action(body: BulkTransactionIn, db: Session = Depends(get_db)):
    txs = db.scalars(select(Transaction).where(Transaction.id.in_(body.ids))).all()
    missing = set(body.ids) - {t.id for t in txs}
    if missing:
        raise HTTPException(404, f"Transactions not found: {sorted(missing)}")

    if body.action == "delete":
        for t in txs:
            db.delete(t)
        db.commit()
        return BulkTransactionResult(updated=len(txs))

    if body.action == "set_category":
        if body.category_id is not None and not db.get(Category, body.category_id):
            raise HTTPException(400, "Category not found")
        count = 0
        for t in txs:
            if t.kind == "transfer":
                continue  # transfers carry no category
            t.splits.clear()
            t.splits.append(
                Split(category_id=body.category_id, amount=t.amount, amount_base=t.amount_base, note="")
            )
            if body.category_id is not None and t.payee:
                learn(db, t.payee, body.category_id)
            count += 1
        db.commit()
        return BulkTransactionResult(updated=count)

    if body.action == "set_account":
        account = db.get(Account, body.account_id) if body.account_id else None
        if not account:
            raise HTTPException(400, "Account not found")
        for t in txs:
            if t.transfer_account_id == account.id:
                raise HTTPException(400, "Cannot move a transfer onto its own destination account")
            t.account_id = account.id
            t.currency = account.currency
            t.amount_base = to_base(db, t.amount, account.currency, t.date)
            for s in t.splits:
                s.amount_base = to_base(db, s.amount, account.currency, t.date)
        db.commit()
        return BulkTransactionResult(updated=len(txs))

    if body.action == "set_kind":
        if body.kind not in ("expense", "income"):
            raise HTTPException(400, "kind must be 'expense' or 'income'")
        count = 0
        for t in txs:
            if t.kind == "transfer":
                continue  # transfers aren't reclassified this way
            if t.kind == body.kind:
                continue
            t.kind = body.kind
            t.loan_id = None  # direction may no longer match the linked loan
            count += 1
        db.commit()
        return BulkTransactionResult(updated=count)

    raise HTTPException(400, "Invalid action")


def _build(db: Session, body: TransactionIn, tx: Transaction) -> Transaction:
    account = db.get(Account, body.account_id)
    if not account:
        raise HTTPException(400, "Account not found")
    if body.kind not in ("expense", "income", "transfer"):
        raise HTTPException(400, "Invalid kind")

    tx.date = body.date
    tx.kind = body.kind
    tx.account_id = body.account_id
    tx.amount = round(body.amount, 2)
    tx.currency = account.currency
    tx.amount_base = to_base(db, tx.amount, account.currency, body.date)
    tx.payee = body.payee.strip()
    tx.note = body.note.strip()
    tx.transfer_account_id = None
    tx.transfer_amount = None
    tx.loan_id = None

    if body.kind == "transfer":
        if body.loan_id is not None:
            raise HTTPException(400, "Transfers can't link to a loan")
        dest = db.get(Account, body.transfer_account_id) if body.transfer_account_id else None
        if not dest:
            raise HTTPException(400, "Transfer destination account required")
        if dest.id == account.id:
            raise HTTPException(400, "Cannot transfer to the same account")
        tx.transfer_account_id = dest.id
        if dest.currency == account.currency:
            tx.transfer_amount = round(body.transfer_amount or body.amount, 2)
        elif body.transfer_amount is None or body.transfer_amount <= 0:
            raise HTTPException(400, "Destination amount required for cross-currency transfer")
        else:
            tx.transfer_amount = round(body.transfer_amount, 2)
        return tx

    if body.loan_id is not None:
        loan = db.get(Loan, body.loan_id)
        if not loan:
            raise HTTPException(400, "Loan not found")
        expected_kind = "expense" if loan.direction == "debt" else "income"
        if body.kind != expected_kind:
            raise HTTPException(400, f"This loan expects a {expected_kind} transaction")
        tx.loan_id = body.loan_id

    # expense/income: at least one split, amounts must sum to total
    splits = body.splits or [type("S", (), {"category_id": None, "amount": body.amount, "note": ""})()]
    total = round(sum(s.amount for s in splits), 2)
    if abs(total - tx.amount) > 0.005:
        raise HTTPException(400, f"Splits sum {total} does not match amount {tx.amount}")
    for s in splits:
        if s.category_id is not None and not db.get(Category, s.category_id):
            raise HTTPException(400, f"Category {s.category_id} not found")
        tx.splits.append(
            Split(
                category_id=s.category_id,
                amount=round(s.amount, 2),
                amount_base=to_base(db, s.amount, account.currency, body.date),
                note=getattr(s, "note", "") or "",
            )
        )
    return tx


def _learn_from(db: Session, tx: Transaction) -> None:
    if tx.kind in ("expense", "income") and tx.payee and len(tx.splits) == 1 and tx.splits[0].category_id:
        learn(db, tx.payee, tx.splits[0].category_id)
