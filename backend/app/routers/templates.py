from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Loan, Template
from ..schemas import TemplateIn, TemplateOut
from ..services.recurring import advance, expire_if_past_end, materialize_due, pending_templates, post_template

router = APIRouter(prefix="/api/templates", tags=["templates"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.scalars(select(Template).order_by(Template.next_due)).all()


@router.get("/pending", response_model=list[TemplateOut])
def pending(db: Session = Depends(get_db)):
    return pending_templates(db)


@router.post("/materialize")
def materialize(db: Session = Depends(get_db)):
    return {"posted": materialize_due(db)}


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateIn, db: Session = Depends(get_db)):
    _validate(db, body)
    t = Template(**body.model_dump())
    expire_if_past_end(t)
    db.add(t)
    db.commit()
    return t


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, body: TemplateIn, db: Session = Depends(get_db)):
    t = db.get(Template, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    _validate(db, body)
    for key, value in body.model_dump().items():
        setattr(t, key, value)
    expire_if_past_end(t)
    db.commit()
    return t


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    t = db.get(Template, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    db.delete(t)
    db.commit()


@router.post("/{template_id}/post", response_model=TemplateOut)
def post_now(template_id: int, db: Session = Depends(get_db)):
    """Confirm a pending occurrence: post it and advance next_due."""
    t = db.get(Template, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    on_date = min(t.next_due, date.today())
    post_template(db, t, on_date)
    t.next_due = advance(t.next_due, t.frequency, t.interval)
    expire_if_past_end(t)
    db.commit()
    return t


@router.post("/{template_id}/skip", response_model=TemplateOut)
def skip_occurrence(template_id: int, db: Session = Depends(get_db)):
    t = db.get(Template, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    t.next_due = advance(t.next_due, t.frequency, t.interval)
    expire_if_past_end(t)
    db.commit()
    return t


def _validate(db: Session, body: TemplateIn) -> None:
    if body.kind not in ("expense", "income", "transfer"):
        raise HTTPException(400, "Invalid kind")
    if body.frequency not in ("daily", "weekly", "monthly", "yearly"):
        raise HTTPException(400, "Invalid frequency")
    if body.kind == "transfer" and not body.transfer_account_id:
        raise HTTPException(400, "Transfer destination account required")
    if body.loan_id is not None:
        if body.kind == "transfer":
            raise HTTPException(400, "Transfers can't link to a loan")
        loan = db.get(Loan, body.loan_id)
        if not loan:
            raise HTTPException(400, "Loan not found")
        expected_kind = "expense" if loan.direction == "debt" else "income"
        if body.kind != expected_kind:
            raise HTTPException(400, f"This loan expects a {expected_kind} transaction")
