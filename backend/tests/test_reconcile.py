def test_reconcile_creates_expense_when_actual_is_lower(seeded):
    c = seeded["client"]
    acc = seeded["aed"]  # initial_balance 1000, no transactions yet
    r = c.post(f"/api/accounts/{acc['id']}/reconcile", json={"actual_balance": 950.0})
    assert r.status_code == 200
    body = r.json()
    assert body["adjustment"]["kind"] == "expense"
    assert body["adjustment"]["amount"] == 50.0
    assert body["adjustment"]["payee"] == "Balance adjustment"
    assert body["account"]["balance"] == 950.0

    txs = c.get("/api/transactions").json()
    assert txs["total"] == 1
    assert txs["items"][0]["splits"][0]["category_id"] is None


def test_reconcile_creates_income_when_actual_is_higher(seeded):
    c = seeded["client"]
    acc = seeded["aed"]
    r = c.post(f"/api/accounts/{acc['id']}/reconcile", json={"actual_balance": 1200.0})
    body = r.json()
    assert body["adjustment"]["kind"] == "income"
    assert body["adjustment"]["amount"] == 200.0
    assert body["account"]["balance"] == 1200.0


def test_reconcile_noop_when_balances_already_match(seeded):
    c = seeded["client"]
    acc = seeded["aed"]
    r = c.post(f"/api/accounts/{acc['id']}/reconcile", json={"actual_balance": 1000.0})
    assert r.json()["adjustment"] is None
    assert c.get("/api/transactions").json()["total"] == 0


def test_reconcile_tiny_rounding_diff_is_noop(seeded):
    c = seeded["client"]
    acc = seeded["aed"]
    r = c.post(f"/api/accounts/{acc['id']}/reconcile", json={"actual_balance": 1000.001})
    assert r.json()["adjustment"] is None


def test_reconcile_uses_given_date(seeded):
    c = seeded["client"]
    acc = seeded["aed"]
    r = c.post(
        f"/api/accounts/{acc['id']}/reconcile",
        json={"actual_balance": 900.0, "on_date": "2026-01-15"},
    )
    assert r.json()["adjustment"]["date"] == "2026-01-15"


def test_reconcile_after_existing_transactions_uses_running_balance(seeded):
    c = seeded["client"]
    acc = seeded["aed"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": acc["id"],
            "amount": 100.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 100.0, "note": ""}],
        },
    )
    # running balance now 900; reconcile to 850 -> expense adjustment of 50
    r = c.post(f"/api/accounts/{acc['id']}/reconcile", json={"actual_balance": 850.0})
    assert r.json()["adjustment"]["amount"] == 50.0
    assert r.json()["adjustment"]["kind"] == "expense"
    assert r.json()["account"]["balance"] == 850.0


def test_reconcile_404_unknown_account(seeded):
    c = seeded["client"]
    assert c.post("/api/accounts/9999/reconcile", json={"actual_balance": 10}).status_code == 404
