def test_create_budget_defaults_to_monthly(seeded):
    c = seeded["client"]
    b = c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500}).json()
    assert b["period"] == "monthly"


def test_create_yearly_budget(seeded):
    c = seeded["client"]
    b = c.post(
        "/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"}
    ).json()
    assert b["period"] == "yearly"


def test_invalid_period_rejected(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100, "period": "weekly"}
    )
    assert r.status_code == 400


def test_update_budget_period(seeded):
    c = seeded["client"]
    b = c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500}).json()
    r = c.put(
        f"/api/budgets/{b['id']}",
        json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"},
    )
    assert r.json()["period"] == "yearly"
    assert r.json()["amount"] == 6000


def test_yearly_budget_status_sums_whole_year(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    for m in ("2026-01", "2026-05", "2026-07"):
        c.post(
            "/api/transactions",
            json={
                "date": f"{m}-15",
                "kind": "expense",
                "account_id": seeded["aed"]["id"],
                "amount": 100.0,
                "splits": [{"category_id": seeded["food"]["id"], "amount": 100.0, "note": ""}],
            },
        )
    status = c.get("/api/budgets/status?month=2026-07").json()[0]
    assert status["spent"] == 300.0  # all three, same year
    assert status["period"] == "yearly"


def test_yearly_budget_ignores_other_years(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    c.post(
        "/api/transactions",
        json={
            "date": "2025-12-31",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 999.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 999.0, "note": ""}],
        },
    )
    status = c.get("/api/budgets/status?month=2026-07").json()[0]
    assert status["spent"] == 0.0


def test_monthly_and_yearly_budgets_coexist(seeded):
    c = seeded["client"]
    transport = c.post("/api/categories", json={"name": "Transport", "kind": "expense"}).json()
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    c.post("/api/budgets", json={"category_id": transport["id"], "amount": 1200, "period": "yearly"})
    status = c.get("/api/budgets/status?month=2026-07").json()
    periods = {s["category_id"]: s["period"] for s in status}
    assert periods[seeded["food"]["id"]] == "monthly"
    assert periods[transport["id"]] == "yearly"


# ---------- forecast interaction ----------
def test_forecast_amortizes_yearly_budget_over_12_months(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 1200, "period": "yearly"})
    d = c.get("/api/dashboard/projection?months=3").json()
    base = d["current_net_worth"]
    # 1200/year = 100/month planned spend
    assert d["points"][0]["net_worth"] == base - 100.0
    assert d["points"][1]["net_worth"] == base - 200.0
    assert d["points"][2]["net_worth"] == base - 300.0
