from app.routers.budgets import fiscal_year_bounds


def test_fiscal_year_bounds_calendar_default():
    assert fiscal_year_bounds("2026-07", 1) == ("2026-01-01", "2027-01-01")


def test_fiscal_year_bounds_august_start():
    # month is within the fiscal year that started the previous August
    assert fiscal_year_bounds("2026-07", 8) == ("2025-08-01", "2026-08-01")
    # month is within the fiscal year that starts this August
    assert fiscal_year_bounds("2026-08", 8) == ("2026-08-01", "2027-08-01")


def test_yearly_budget_status_respects_fiscal_year_setting(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"fiscal_year_start_month": 8})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})

    for d in ("2025-08-15", "2026-03-01", "2026-07-31"):
        c.post(
            "/api/transactions",
            json={
                "date": d,
                "kind": "expense",
                "account_id": seeded["aed"]["id"],
                "amount": 100.0,
                "splits": [{"category_id": seeded["food"]["id"], "amount": 100.0, "note": ""}],
            },
        )
    # a transaction from the *next* fiscal year (Aug 2026 onward) shouldn't count
    c.post(
        "/api/transactions",
        json={
            "date": "2026-08-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 999.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 999.0, "note": ""}],
        },
    )

    status = c.get("/api/budgets/status?month=2026-07").json()[0]
    assert status["spent"] == 300.0


def test_settings_default_fiscal_year_start_month_is_january(seeded):
    c = seeded["client"]
    assert c.get("/api/settings").json()["fiscal_year_start_month"] == 1


def test_settings_rejects_invalid_fiscal_year_start_month(seeded):
    c = seeded["client"]
    r = c.put("/api/settings", json={"fiscal_year_start_month": 13})
    assert r.status_code == 422
