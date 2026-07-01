from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Split, Template, Transaction
from .rates import to_base

_STEP = {
    "daily": lambda n: relativedelta(days=n),
    "weekly": lambda n: relativedelta(weeks=n),
    "monthly": lambda n: relativedelta(months=n),
    "yearly": lambda n: relativedelta(years=n),
}


def advance(d: date, frequency: str, interval: int) -> date:
    return d + _STEP[frequency](interval)


def post_template(db: Session, template: Template, on_date: date) -> Transaction:
    currency = template.account.currency
    tx = Transaction(
        date=on_date,
        kind=template.kind,
        account_id=template.account_id,
        amount=template.amount,
        currency=currency,
        amount_base=to_base(db, template.amount, currency, on_date),
        transfer_account_id=template.transfer_account_id,
        transfer_amount=template.transfer_amount
        if template.kind == "transfer"
        else None,
        payee=template.payee,
        note=template.note,
        template_id=template.id,
    )
    if template.kind == "transfer" and tx.transfer_amount is None:
        tx.transfer_amount = template.amount
    if template.kind in ("expense", "income"):
        tx.splits.append(
            Split(
                category_id=template.category_id,
                amount=template.amount,
                amount_base=tx.amount_base,
            )
        )
    db.add(tx)
    return tx


def materialize_due(db: Session, today: date | None = None) -> int:
    """Auto-post due templates with auto_post=True. Returns count posted."""
    today = today or date.today()
    templates = db.scalars(
        select(Template).where(
            Template.active.is_(True),
            Template.auto_post.is_(True),
            Template.next_due <= today,
        )
    ).all()
    posted = 0
    for t in templates:
        # catch up every missed occurrence
        while t.next_due <= today:
            post_template(db, t, t.next_due)
            t.next_due = advance(t.next_due, t.frequency, t.interval)
            posted += 1
    db.commit()
    return posted


def pending_templates(db: Session, today: date | None = None) -> list[Template]:
    """Due templates that need manual confirmation."""
    today = today or date.today()
    return list(
        db.scalars(
            select(Template).where(
                Template.active.is_(True),
                Template.auto_post.is_(False),
                Template.next_due <= today,
            )
        )
    )
