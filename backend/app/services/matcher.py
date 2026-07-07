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

from ..models import IgnoreRule, MappingRule, Split, Transaction

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


def suggest(
    db: Session, payee: str, known: dict[str, int] | None = None
) -> tuple[int | None, str, str]:
    """Returns (category_id, confidence, alias) where confidence is exact|rule|fuzzy|''.

    alias is the rule's display-name override (empty unless an exact/contains
    rule with one set matched — fuzzy matches have no specific rule to draw
    an alias from).
    """
    norm = normalize(payee)
    raw = payee.upper().strip()

    rules = db.scalars(
        select(MappingRule).order_by(MappingRule.priority.desc(), MappingRule.id)
    ).all()

    for rule in rules:
        if rule.match_kind == "exact":
            if rule.pattern == norm or rule.pattern == raw:
                _record_hit(db, rule)
                return rule.category_id, "exact", rule.alias

    contains = [
        r for r in rules
        if r.match_kind == "contains" and (r.pattern in norm or r.pattern in raw)
    ]
    if contains:
        best = max(contains, key=lambda r: (r.priority, len(r.pattern)))
        _record_hit(db, best)
        return best.category_id, "rule", best.alias

    if not norm:
        return None, "", ""

    if known is None:
        known = _known_payees(db)
    if known:
        match = process.extractOne(
            norm, known.keys(), scorer=fuzz.token_set_ratio, score_cutoff=FUZZY_THRESHOLD
        )
        if match:
            return known[match[0]], "fuzzy", ""

    return None, "", ""


def learn(db: Session, payee: str, category_id: int) -> None:
    """Upsert an exact rule from a user correction."""
    norm = normalize(payee)
    if not norm:
        return
    rules = db.scalars(
        select(MappingRule)
        .where(MappingRule.pattern == norm, MappingRule.match_kind == "exact")
        .order_by(MappingRule.id)
    ).all()
    if rules:
        rule, *extra = rules
        for dup in extra:  # self-heal duplicates from earlier versions
            db.delete(dup)
        rule.category_id = category_id
        rule.hit_count += 1
        rule.last_used = datetime.now(timezone.utc)
    else:
        db.add(MappingRule(pattern=norm, match_kind="exact", category_id=category_id, hit_count=1))
        # session has autoflush off — flush so the next learn() in the same
        # batch sees this rule instead of inserting a duplicate
        db.flush()


def is_ignored(db: Session, payee: str) -> tuple[bool, str]:
    """Returns (ignored, confidence) where confidence is exact|rule|''."""
    norm = normalize(payee)
    raw = payee.upper().strip()

    rules = db.scalars(
        select(IgnoreRule).order_by(IgnoreRule.priority.desc(), IgnoreRule.id)
    ).all()

    for rule in rules:
        if rule.match_kind == "exact":
            if rule.pattern == norm or rule.pattern == raw:
                _record_hit(db, rule)
                return True, "exact"

    contains = [
        r for r in rules
        if r.match_kind == "contains" and (r.pattern in norm or r.pattern in raw)
    ]
    if contains:
        best = max(contains, key=lambda r: (r.priority, len(r.pattern)))
        _record_hit(db, best)
        return True, "rule"

    return False, ""


def learn_ignore(db: Session, payee: str) -> None:
    """Upsert an exact ignore rule from a user's 'ignore this' action."""
    norm = normalize(payee)
    if not norm:
        return
    rules = db.scalars(
        select(IgnoreRule)
        .where(IgnoreRule.pattern == norm, IgnoreRule.match_kind == "exact")
        .order_by(IgnoreRule.id)
    ).all()
    if rules:
        rule, *extra = rules
        for dup in extra:
            db.delete(dup)
        rule.hit_count += 1
        rule.last_used = datetime.now(timezone.utc)
    else:
        db.add(IgnoreRule(pattern=norm, match_kind="exact", hit_count=1))
        db.flush()


def _record_hit(db: Session, rule: MappingRule | IgnoreRule) -> None:
    rule.hit_count += 1
    rule.last_used = datetime.now(timezone.utc)
