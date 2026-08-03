import pytest


def test_migration_fixes_transaction_loan_fk_missing_set_null():
    """Regression test: an earlier version of the migration added loan_id via
    a plain ALTER TABLE with no ON DELETE action, so deleting a loan with a
    linked transaction failed with a raw FK-constraint error instead of
    nulling the link. Build that exact historical schema (a column-level
    inline REFERENCES, the only form ALTER TABLE ADD COLUMN can produce —
    unlike the SQLAlchemy-generated table-level constraint a fresh install
    gets) and confirm the repair migration fixes it."""
    import tempfile

    from sqlalchemy import create_engine

    from app.db import _migrate_transaction_loan_fk

    path = tempfile.mktemp(suffix=".db")
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql("CREATE TABLE loans (id INTEGER PRIMARY KEY, name TEXT)")
        conn.exec_driver_sql(
            "CREATE TABLE transactions (id INTEGER PRIMARY KEY, amount FLOAT, "
            "loan_id INTEGER REFERENCES loans(id))"
        )
        conn.exec_driver_sql("INSERT INTO loans (id, name) VALUES (1, 'X')")
        conn.exec_driver_sql("INSERT INTO transactions (id, amount, loan_id) VALUES (1, 50, 1)")

    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
            conn.exec_driver_sql("DELETE FROM loans WHERE id = 1")

    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        _migrate_transaction_loan_fk(conn)

    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql("DELETE FROM loans WHERE id = 1")
        row = conn.exec_driver_sql("SELECT loan_id FROM transactions WHERE id = 1").fetchone()
    assert row[0] is None


def _expense(seeded, amount=10, **kw):
    body = {
        "date": "2026-07-01",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": amount,
        "payee": "SHOP",
        "splits": [{"category_id": seeded["food"]["id"], "amount": amount, "note": ""}],
    }
    body.update(kw)
    return body


def _income(seeded, amount=10, **kw):
    body = {
        "date": "2026-07-01",
        "kind": "income",
        "account_id": seeded["aed"]["id"],
        "amount": amount,
        "payee": "PAYER",
        "splits": [{"category_id": seeded["salary"]["id"], "amount": amount, "note": ""}],
    }
    body.update(kw)
    return body


def _debt_loan(c, **kw):
    body = {"name": "Mortgage", "direction": "debt", "principal_amount": 500000}
    body.update(kw)
    return c.post("/api/loans", json=body).json()


def _receivable_loan(c, **kw):
    body = {"name": "Ivan owes me", "direction": "receivable", "principal_amount": 2000}
    body.update(kw)
    return c.post("/api/loans", json=body).json()


def test_loan_crud_lifecycle(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    assert loan["paid"] == 0.0 and loan["remaining"] == 500000.0

    listed = c.get("/api/loans").json()
    assert len(listed) == 1 and listed[0]["id"] == loan["id"]

    r = c.put(f"/api/loans/{loan['id']}", json={"name": "Home loan", "direction": "debt", "principal_amount": 400000})
    assert r.status_code == 200 and r.json()["name"] == "Home loan"

    assert c.delete(f"/api/loans/{loan['id']}").status_code == 204
    assert c.get("/api/loans").json() == []


def test_invalid_direction_rejected(seeded):
    c = seeded["client"]
    r = c.post("/api/loans", json={"name": "X", "direction": "bogus", "principal_amount": 100})
    assert r.status_code == 400


def test_debt_loan_reduces_via_linked_expense(seeded):
    c = seeded["client"]
    loan = _debt_loan(c, principal_amount=1000)
    c.post("/api/transactions", json=_expense(seeded, amount=300, loan_id=loan["id"]))
    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 300.0
    assert updated["remaining"] == 700.0


def test_eur_loan_paid_stays_in_loan_currency_not_aed(seeded):
    """Regression: paid/remaining were computed from amount_base (always
    AED), so a EUR loan compared its EUR principal against an AED-converted
    "paid" figure — a 200 EUR payment against a 500 EUR loan showed as
    800/500 (200 EUR * rate 4.0) instead of 200/500."""
    from datetime import date

    from app.db import SessionLocal
    from app.models import ExchangeRate

    db = SessionLocal()
    try:
        db.add(ExchangeRate(date=date(2026, 7, 1), currency="EUR", rate_to_base=4.0))
        db.commit()
    finally:
        db.close()

    c = seeded["client"]
    eur_account = c.post(
        "/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}
    ).json()
    loan = _debt_loan(c, principal_amount=500, currency="EUR")
    c.post(
        "/api/transactions",
        json=_expense(seeded, amount=200, account_id=eur_account["id"], loan_id=loan["id"]),
    )

    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 200.0
    assert updated["remaining"] == 300.0


def test_eur_loan_paid_unaffected_by_later_rate_changes(seeded):
    """Regression: an earlier fix reverse-converted amount_base back to
    loan.currency via get_rate() looked up at read time. But amount_base
    was computed from whatever rate was resolved at transaction-creation
    time — if the exchange_rates table is later backfilled/refreshed with
    a different rate for that same date, dividing by the new rate drifts
    away from the original amount. When the transaction's own currency
    already matches the loan's, its amount should be used directly."""
    from datetime import date

    from app.db import SessionLocal
    from app.models import ExchangeRate

    db = SessionLocal()
    try:
        db.add(ExchangeRate(date=date(2026, 7, 1), currency="EUR", rate_to_base=4.0))
        db.commit()
    finally:
        db.close()

    c = seeded["client"]
    eur_account = c.post(
        "/api/accounts", json={"name": "EUR Card", "currency": "EUR", "initial_balance": 0}
    ).json()
    loan = _receivable_loan(c, principal_amount=530, currency="EUR")
    c.post(
        "/api/transactions",
        json=_income(seeded, amount=1000, account_id=eur_account["id"], loan_id=loan["id"]),
    )

    # rate for that same date gets refreshed/corrected afterwards
    db = SessionLocal()
    try:
        row = db.query(ExchangeRate).filter_by(date=date(2026, 7, 1), currency="EUR").first()
        row.rate_to_base = 4.23734200011017
        db.commit()
    finally:
        db.close()

    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 1000.0
    assert updated["remaining"] == -470.0


def test_receivable_loan_reduces_via_linked_income(seeded):
    c = seeded["client"]
    loan = _receivable_loan(c, principal_amount=1000)
    c.post("/api/transactions", json=_income(seeded, amount=250, loan_id=loan["id"]))
    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 250.0
    assert updated["remaining"] == 750.0


def test_income_linked_to_debt_loan_rejected(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    r = c.post("/api/transactions", json=_income(seeded, loan_id=loan["id"]))
    assert r.status_code == 400


def test_expense_linked_to_receivable_loan_rejected(seeded):
    c = seeded["client"]
    loan = _receivable_loan(c)
    r = c.post("/api/transactions", json=_expense(seeded, loan_id=loan["id"]))
    assert r.status_code == 400


def test_transfer_with_loan_id_rejected(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 50,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 13.6,
            "loan_id": loan["id"],
        },
    )
    assert r.status_code == 400


def test_unknown_loan_id_rejected(seeded):
    c = seeded["client"]
    r = c.post("/api/transactions", json=_expense(seeded, loan_id=99999))
    assert r.status_code == 400


def test_deleting_loan_keeps_transaction_but_clears_link(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    tx = c.post("/api/transactions", json=_expense(seeded, amount=50, loan_id=loan["id"])).json()

    assert c.delete(f"/api/loans/{loan['id']}").status_code == 204

    items = c.get("/api/transactions").json()["items"]
    match = next(t for t in items if t["id"] == tx["id"])
    assert match["loan_id"] is None


def test_transactions_filter_by_loan_id(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    other_loan = _debt_loan(c, name="Car loan")
    c.post("/api/transactions", json=_expense(seeded, amount=50, loan_id=loan["id"]))
    c.post("/api/transactions", json=_expense(seeded, amount=20, loan_id=other_loan["id"]))
    c.post("/api/transactions", json=_expense(seeded, amount=10))

    r = c.get(f"/api/transactions?loan_id={loan['id']}").json()
    assert r["total"] == 1
    assert r["items"][0]["loan_id"] == loan["id"]


def test_editing_transaction_can_change_loan_link(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    tx = c.post("/api/transactions", json=_expense(seeded, amount=50, loan_id=loan["id"])).json()

    r = c.put(f"/api/transactions/{tx['id']}", json=_expense(seeded, amount=50, loan_id=None))
    assert r.status_code == 200 and r.json()["loan_id"] is None

    updated_loan = c.get("/api/loans").json()[0]
    assert updated_loan["paid"] == 0.0


def test_cannot_change_direction_on_loan_with_linked_transactions(seeded):
    c = seeded["client"]
    loan = _debt_loan(c, principal_amount=1000)
    c.post("/api/transactions", json=_expense(seeded, amount=300, loan_id=loan["id"]))

    r = c.put(
        f"/api/loans/{loan['id']}",
        json={"name": "Mortgage", "direction": "receivable", "principal_amount": 1000},
    )
    assert r.status_code == 400
    assert "Cannot change direction" in r.json()["detail"]

    verified = c.get("/api/loans").json()[0]
    assert verified["direction"] == "debt"
