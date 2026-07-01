"""Merchant -> category matching.

Order: exact rule on normalized payee -> contains rules (longest pattern wins)
-> fuzzy match against payees of already-categorized transactions.
Learning: every user correction upserts an exact rule.
"""

import re
from datetime import datetime, timezone

from rapidfuzz import fuzz, process
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import MappingRule, Split, Transaction

FUZZY_THRESHOLD = 85

_CARD_RE = re.compile(r"\*+\d+|\d{4,}")  # masked card numbers, long digit runs
_DATE_RE = re.compile(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}")
_NON_ALNUM_RE = re.compile(r"[^A-Z0-9 ]+")
_DIGITS_RE = re.compile(r"\b\d+\b")
_SPACES_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    s = text.upper()
    s = _DATE_RE.sub(" ", s)
    s = _CARD_RE.sub(" ", s)
    s = _NON_ALNUM_RE.sub(" ", s)
    s = _DIGITS_RE.sub(" ", s)
    return _SPACES_RE.sub(" ", s).strip()


def _known_payees(db: Session) -> dict[str, int]:
    """Normalized payee -> most frequent category_id from existing transactions."""
    rows = db.execute(
        select(Transaction.payee, Split.category_id, func.count().label("n"))
        .join(Split, Split.transaction_id == Transaction.id)
        .where(Transaction.payee != "", Split.category_id.isnot(None))
        .group_by(Transaction.payee, Split.category_id)
        .order_by(func.count().asc())  # later (higher count) overwrites earlier
    ).all()
    result: dict[str, int] = {}
    for payee, category_id, _n in rows:
        norm = normalize(payee)
        if norm:
            result[norm] = category_id
    return result


def suggest(db: Session, payee: str, known: dict[str, int] | None = None) -> tuple[int | None, str]:
    """Returns (category_id, confidence) where confidence is exact|rule|fuzzy|''."""
    norm = normalize(payee)
    if not norm:
        return None, ""

    rules = db.scalars(
        select(MappingRule).order_by(MappingRule.priority.desc(), MappingRule.id)
    ).all()

    for rule in rules:
        if rule.match_kind == "exact" and rule.pattern == norm:
            _record_hit(db, rule)
            return rule.category_id, "exact"

    contains = [r for r in rules if r.match_kind == "contains" and r.pattern in norm]
    if contains:
        best = max(contains, key=lambda r: (r.priority, len(r.pattern)))
        _record_hit(db, best)
        return best.category_id, "rule"

    if known is None:
        known = _known_payees(db)
    if known:
        match = process.extractOne(
            norm, known.keys(), scorer=fuzz.token_set_ratio, score_cutoff=FUZZY_THRESHOLD
        )
        if match:
            return known[match[0]], "fuzzy"

    return None, ""


def learn(db: Session, payee: str, category_id: int) -> None:
    """Upsert an exact rule from a user correction."""
    norm = normalize(payee)
    if not norm:
        return
    rule = db.scalar(
        select(MappingRule).where(MappingRule.pattern == norm, MappingRule.match_kind == "exact")
    )
    if rule:
        rule.category_id = category_id
        rule.hit_count += 1
        rule.last_used = datetime.now(timezone.utc)
    else:
        db.add(MappingRule(pattern=norm, match_kind="exact", category_id=category_id, hit_count=1))


def _record_hit(db: Session, rule: MappingRule) -> None:
    rule.hit_count += 1
    rule.last_used = datetime.now(timezone.utc)
