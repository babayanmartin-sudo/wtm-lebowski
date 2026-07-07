from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import IgnoreRule
from ..schemas import IgnoreRuleIn, IgnoreRuleOut

router = APIRouter(
    prefix="/api/ignore-rules", tags=["ignore-rules"], dependencies=[Depends(require_auth)]
)


@router.get("", response_model=list[IgnoreRuleOut])
def list_ignore_rules(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(IgnoreRule).order_by(IgnoreRule.hit_count.desc(), IgnoreRule.id.desc())
    if q:
        stmt = stmt.where(IgnoreRule.pattern.ilike(f"%{q}%"))
    return db.scalars(stmt).all()


@router.post("", response_model=IgnoreRuleOut, status_code=201)
def create_ignore_rule(body: IgnoreRuleIn, db: Session = Depends(get_db)):
    data = _validated(body)
    existing = db.scalar(
        select(IgnoreRule).where(
            IgnoreRule.pattern == data["pattern"], IgnoreRule.match_kind == data["match_kind"]
        )
    )
    if existing:
        raise HTTPException(
            409, f"Ignore rule for '{data['pattern']}' ({data['match_kind']}) already exists"
        )
    rule = IgnoreRule(**data)
    db.add(rule)
    db.commit()
    return rule


@router.put("/{rule_id}", response_model=IgnoreRuleOut)
def update_ignore_rule(rule_id: int, body: IgnoreRuleIn, db: Session = Depends(get_db)):
    rule = db.get(IgnoreRule, rule_id)
    if not rule:
        raise HTTPException(404, "Ignore rule not found")
    for key, value in _validated(body).items():
        setattr(rule, key, value)
    db.commit()
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_ignore_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(IgnoreRule, rule_id)
    if not rule:
        raise HTTPException(404, "Ignore rule not found")
    db.delete(rule)
    db.commit()


def _validated(body: IgnoreRuleIn) -> dict:
    if body.match_kind not in ("exact", "contains"):
        raise HTTPException(400, "match_kind must be exact or contains")
    pattern = body.pattern.upper().strip()
    if not pattern:
        raise HTTPException(400, "Pattern cannot be empty")
    data = body.model_dump()
    data["pattern"] = pattern
    return data
