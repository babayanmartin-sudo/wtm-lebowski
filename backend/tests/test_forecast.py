from datetime import date

from dateutil.relativedelta import relativedelta


def _first_of_next() -> str:
    return (date.today().replace(day=1) + relativedelta(months=1)).isoformat()


def _mk_template(seeded, **kw):
    body = {
        "name": "T",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 100,
        "category_id": None,
        "payee": "",
        "note": "",
        "frequency": "monthly",
        "interval": 1,
        "next_due": date.today().isoformat(),
        "end_date": None,
        "auto_post": False,
        "active": True,
        "transfer_account_id": None,
        "transfer_amount": None,
    }
    body.update(kw)
    return body


# ---------- net worth as of period end ----------
def test_net_worth_reflects_selected_period(seeded):
    c = seeded["client"]
    baseline = c.get("/api/dashboard/summary?date_from=2026-05-01&date_to=2026-05-31").json()[
        "net_worth"
    ]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-06-15",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 200.0,
            "splits": [{"category_id": None, "amount": 200.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-10",
            "kind": "income",
            "account_id": seeded["aed"]["id"],
            "amount": 500.0,
            "splits": [{"category_id": seeded["salary"]["id"], "amount": 500.0, "note": ""}],
        },
    )
    june = c.get("/api/dashboard/summary?date_from=2026-06-01&date_to=2026-06-30").json()
    july = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    assert june["net_worth"] == baseline - 200.0
    assert july["net_worth"] == baseline + 300.0  # -200 then +500


# ---------- projection ----------
def test_projection_shape_and_flat_without_plans(seeded):
    c = seeded["client"]
    d = c.get("/api/dashboard/projection?months=6").json()
    assert len(d["points"]) == 6
    assert all(p["net_worth"] == d["current_net_worth"] for p in d["points"])


def test_projection_recurring_income_and_expense(seeded):
    c = seeded["client"]
    c.post(
        "/api/templates",
        json=_mk_template(seeded, name="Salary", kind="income", amount=1000, next_due=_first_of_next()),
    )
    c.post(
        "/api/templates",
        json=_mk_template(
            seeded, name="Rent", amount=400, category_id=seeded["food"]["id"], next_due=_first_of_next()
        ),
    )
    d = c.get("/api/dashboard/projection?months=3").json()
    base = d["current_net_worth"]
    assert d["points"][0]["net_worth"] == base  # nothing due in current month
    assert d["points"][1]["net_worth"] == base + 600.0
    assert d["points"][2]["net_worth"] == base + 1200.0


def test_projection_respects_template_end_date(seeded):
    c = seeded["client"]
    c.post(
        "/api/templates",
        json=_mk_template(
            seeded,
            name="Short gig",
            kind="income",
            amount=500,
            next_due=_first_of_next(),
            end_date=_first_of_next(),  # exactly one occurrence
        ),
    )
    d = c.get("/api/dashboard/projection?months=4").json()
    base = d["current_net_worth"]
    assert d["points"][1]["net_worth"] == base + 500.0
    assert d["points"][3]["net_worth"] == base + 500.0  # no further growth


def test_projection_budget_as_planned_spending(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 300})
    d = c.get("/api/dashboard/projection?months=3").json()
    base = d["current_net_worth"]
    assert d["points"][0]["net_worth"] == base - 300.0
    assert d["points"][1]["net_worth"] == base - 600.0
    assert d["points"][2]["net_worth"] == base - 900.0


def test_projection_current_month_uses_remaining_budget(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 300})
    c.post(
        "/api/transactions",
        json={
            "date": date.today().isoformat(),
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 100.0, "note": ""}],
        },
    )
    d = c.get("/api/dashboard/projection?months=2").json()
    base = d["current_net_worth"]  # already includes the -100 spent
    assert d["points"][0]["net_worth"] == base - 200.0  # only remaining budget
    assert d["points"][1]["net_worth"] == base - 500.0  # full budget next month


def test_projection_no_double_count_recurring_inside_budget(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 300})
    # recurring 500 in Groceries (child of budgeted Food) exceeds the 300 budget
    c.post(
        "/api/templates",
        json=_mk_template(
            seeded,
            name="Big groceries",
            amount=500,
            category_id=seeded["grocery"]["id"],
            next_due=_first_of_next(),
        ),
    )
    d = c.get("/api/dashboard/projection?months=2").json()
    # next month: max(300 budget, 500 recurring) = 500, not 800
    assert d["points"][1]["net_worth"] == d["points"][0]["net_worth"] - 500.0


def test_projection_no_double_count_monthly_and_yearly_budget(seeded):
    """Regression for #8: a category can carry both a monthly and yearly
    budget since v1.0 loosened uniqueness to (category, period). Forecast
    must count it once (monthly wins), not sum monthly + yearly/12."""
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 300, "period": "monthly"})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    d = c.get("/api/dashboard/projection?months=2").json()
    base = d["current_net_worth"]
    # if double-counted: -300 - 500 (6000/12) = -800; correct is monthly only, -300
    assert d["points"][0]["net_worth"] == base - 300.0
    assert d["points"][1]["net_worth"] == base - 600.0


def test_projection_ignores_transfers_and_inactive(seeded):
    c = seeded["client"]
    c.post(
        "/api/templates",
        json=_mk_template(
            seeded,
            name="Move money",
            kind="transfer",
            amount=999,
            transfer_account_id=seeded["usd"]["id"],
            transfer_amount=999,
            next_due=_first_of_next(),
        ),
    )
    c.post(
        "/api/templates",
        json=_mk_template(seeded, name="Paused", amount=999, next_due=_first_of_next(), active=False),
    )
    d = c.get("/api/dashboard/projection?months=3").json()
    assert all(p["net_worth"] == d["current_net_worth"] for p in d["points"])
