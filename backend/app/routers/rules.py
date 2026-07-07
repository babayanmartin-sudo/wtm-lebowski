from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..db import get_db
from ..models import Category, MappingRule
from ..schemas import RuleIn, RuleOut

router = APIRouter(prefix="/api/rules", tags=["rules"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[RuleOut])
def list_rules(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(MappingRule).order_by(MappingRule.hit_count.desc(), MappingRule.id.desc())
    if q:
        stmt = stmt.where(MappingRule.pattern.ilike(f"%{q}%"))
    return db.scalars(stmt).all()


@router.post("", response_model=RuleOut, status_code=201)
def create_rule(body: RuleIn, db: Session = Depends(get_db)):
    data = _validated(db, body)
    existing = db.scalar(
        select(MappingRule).where(
            MappingRule.pattern == data["pattern"], MappingRule.match_kind == data["match_kind"]
        )
    )
    if existing:
        raise HTTPException(409, f"Rule for '{data['pattern']}' ({data['match_kind']}) already exists")
    rule = MappingRule(**data)
    db.add(rule)
    db.commit()
    return rule


@router.put("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, body: RuleIn, db: Session = Depends(get_db)):
    rule = db.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    for key, value in _validated(db, body).items():
        setattr(rule, key, value)
    db.commit()
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()


def _validated(db: Session, body: RuleIn) -> dict:
    if body.match_kind not in ("exact", "contains"):
        raise HTTPException(400, "match_kind must be exact or contains")
    if not db.get(Category, body.category_id):
        raise HTTPException(400, "Category not found")
    pattern = body.pattern.upper().strip()
    if not pattern:
        raise HTTPException(400, "Pattern cannot be empty")
    data = body.model_dump()
    data["pattern"] = pattern
    data["alias"] = data["alias"].strip()
    return data
