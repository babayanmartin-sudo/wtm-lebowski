from datetime import date

from app.db import SessionLocal
from app.models import ExchangeRate
from app.services.rates import convert, get_base_currency, recompute_all_amount_base, to_base


def _seed_rates(rate_date: date = date(2026, 7, 1)):
    """EUR and RUB rates relative to the ANCHOR (AED, per config.BASE_CURRENCY
    default) — mirrors what refresh_rates() would cache from the live API."""
    db = SessionLocal()
    try:
        db.add(ExchangeRate(date=rate_date, currency="EUR", rate_to_base=4.0))
        db.add(ExchangeRate(date=rate_date, currency="RUB", rate_to_base=0.04))
        db.commit()
    finally:
        db.close()


def test_base_currency_defaults_to_anchor_when_no_main_account(seeded):
    db = SessionLocal()
    try:
        assert get_base_currency(db) == "AED"
    finally:
        db.close()


def test_base_currency_follows_main_account(seeded):
    c = seeded["client"]
    c.put(f"/api/accounts/{seeded['aed']['id']}", json={"name": "AED Bank", "currency": "AED", "is_main": True})
    db = SessionLocal()
    try:
        assert get_base_currency(db) == "AED"
    finally:
        db.close()

    eur = c.post("/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}).json()
    c.put(f"/api/accounts/{eur['id']}", json={"name": "EUR Card", "currency": "EUR", "is_main": True})
    db = SessionLocal()
    try:
        assert get_base_currency(db) == "EUR"
    finally:
        db.close()


def test_convert_cross_converts_through_anchor(seeded):
    _seed_rates()
    db = SessionLocal()
    try:
        # 100 EUR -> RUB: 100 * (4.0 / 0.04) = 10000
        assert convert(db, 100, "EUR", "RUB", date(2026, 7, 1)) == 10000.0
        assert convert(db, 100, "EUR", "EUR", date(2026, 7, 1)) == 100.0
    finally:
        db.close()


def test_to_base_uses_dynamic_base_not_anchor(seeded):
    _seed_rates()
    c = seeded["client"]
    eur = c.post("/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}).json()
    c.put(f"/api/accounts/{eur['id']}", json={"name": "EUR Card", "currency": "EUR", "is_main": True})

    db = SessionLocal()
    try:
        # RUB -> EUR (the dynamic base), not RUB -> AED (the anchor)
        assert to_base(db, 10000, "RUB", date(2026, 7, 1)) == 100.0
        # EUR -> EUR: exact, no rate math
        assert to_base(db, 50, "EUR", date(2026, 7, 1)) == 50.0
    finally:
        db.close()


def test_dashboard_base_currency_reflects_main_account(seeded):
    c = seeded["client"]
    eur = c.post("/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}).json()
    c.put(f"/api/accounts/{eur['id']}", json={"name": "EUR Card", "currency": "EUR", "is_main": True})

    d = c.get("/api/dashboard/summary").json()
    assert d["base_currency"] == "EUR"


def test_recompute_all_amount_base_after_main_account_switch(seeded):
    """Regression: switching main account to a different currency must
    reconvert every already-stored amount_base, not just future
    transactions."""
    _seed_rates()
    c = seeded["client"]

    # AED is base initially — a transaction posted now gets amount_base in AED
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 100, "note": ""}],
        },
    )
    tx_id = r.json()["id"]
    assert c.get(f"/api/transactions?account_id={seeded['aed']['id']}").json()["items"][0]["amount_base"] == 100.0

    # switch main account to EUR — should trigger a full recompute
    eur = c.post("/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}).json()
    c.put(f"/api/accounts/{eur['id']}", json={"name": "EUR Card", "currency": "EUR", "is_main": True})

    updated = [t for t in c.get("/api/transactions").json()["items"] if t["id"] == tx_id][0]
    # 100 AED -> EUR at rate_to_base(AED)=1.0, rate_to_base(EUR)=4.0 -> 100/4.0 = 25
    assert updated["amount_base"] == 25.0


def test_recompute_all_amount_base_helper_directly(seeded):
    _seed_rates()
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 400,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 400, "note": ""}],
        },
    )
    eur = c.post("/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}).json()
    c.put(f"/api/accounts/{eur['id']}", json={"name": "EUR Card", "currency": "EUR", "is_main": True})

    db = SessionLocal()
    try:
        touched = recompute_all_amount_base(db)
        assert touched >= 1
    finally:
        db.close()

    updated = c.get("/api/transactions").json()["items"][0]
    assert updated["amount_base"] == 100.0  # 400 AED / 4.0
