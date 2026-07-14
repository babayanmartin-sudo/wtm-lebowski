def test_transaction_save_returns_alert_when_over_threshold(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"budget_threshold": 50.0})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100})

    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 60.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 60.0, "note": ""}],
        },
    )
    body = r.json()
    assert len(body["budget_alerts"]) == 1
    alert = body["budget_alerts"][0]
    assert alert["category_id"] == seeded["food"]["id"]
    assert alert["ratio"] == 60.0


def test_transaction_save_no_alert_under_threshold(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"budget_threshold": 80.0})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100})

    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 20.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 20.0, "note": ""}],
        },
    )
    assert r.json()["budget_alerts"] == []


def test_child_category_split_alerts_parent_budget(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"budget_threshold": 50.0})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100})

    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 60.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 60.0, "note": ""}],
        },
    )
    body = r.json()
    assert len(body["budget_alerts"]) == 1
    assert body["budget_alerts"][0]["category_id"] == seeded["food"]["id"]


def test_uncategorized_transaction_has_no_alerts(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"budget_threshold": 10.0})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100})

    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 20.0,
            "splits": [{"category_id": None, "amount": 20.0, "note": ""}],
        },
    )
    assert r.json()["budget_alerts"] == []
