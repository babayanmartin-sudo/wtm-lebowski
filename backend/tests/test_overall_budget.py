def test_overall_status_defaults_to_no_cap(seeded):
    c = seeded["client"]
    d = c.get("/api/budgets/overall-status?month=2026-07").json()
    assert d["cap"] is None
    assert d["spent"] == 0.0


def test_overall_status_sums_all_expense_regardless_of_category(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"overall_monthly_cap": 200.0})
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 15.0,
            "splits": [{"category_id": None, "amount": 15.0, "note": ""}],
        },
    )
    d = c.get("/api/budgets/overall-status?month=2026-07").json()
    assert d["cap"] == 200.0
    assert d["spent"] == 55.0


def test_overall_status_omits_excluded_category(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 100.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    before = c.get("/api/budgets/overall-status?month=2026-07").json()
    assert before["spent"] == 140.0

    food = seeded["food"]
    c.put(f"/api/categories/{food['id']}", json={**food, "excluded_from_reports": True})

    after = c.get("/api/budgets/overall-status?month=2026-07").json()
    # Food excluded cascades to its child Groceries too -> both drop out
    assert after["spent"] == 0.0
