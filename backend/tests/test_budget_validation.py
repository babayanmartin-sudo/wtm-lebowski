def test_monthly_and_yearly_on_same_category_both_allowed(seeded):
    c = seeded["client"]
    m = c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    assert m.status_code == 201
    y = c.post(
        "/api/budgets",
        json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"},
    )
    assert y.status_code == 201
    assert len(c.get("/api/budgets").json()) == 2


def test_duplicate_same_category_same_period_rejected(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    r = c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 999, "period": "monthly"})
    assert r.status_code == 409


def test_update_period_to_one_that_already_exists_rejected(seeded):
    c = seeded["client"]
    monthly = c.post(
        "/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"}
    ).json()
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    r = c.put(
        f"/api/budgets/{monthly['id']}",
        json={"category_id": seeded["food"]["id"], "amount": 500, "period": "yearly"},
    )
    assert r.status_code == 409


def test_yearly_cannot_exceed_12x_monthly(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    r = c.post(
        "/api/budgets",
        json={"category_id": seeded["food"]["id"], "amount": 6001, "period": "yearly"},
    )
    assert r.status_code == 400
    # exactly 12x is fine
    r2 = c.post(
        "/api/budgets",
        json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"},
    )
    assert r2.status_code == 201


def test_monthly_cannot_imply_yearly_below_existing_yearly(seeded):
    """Setting monthly such that monthly*12 < existing yearly is the same
    violation from the other direction."""
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    r = c.post(
        "/api/budgets",
        json={"category_id": seeded["food"]["id"], "amount": 499, "period": "monthly"},
    )
    assert r.status_code == 400


def test_update_amount_that_breaks_yearly_consistency_rejected(seeded):
    c = seeded["client"]
    monthly = c.post(
        "/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"}
    ).json()
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    # lowering monthly to 400 would make yearly(6000) > 400*12=4800
    r = c.put(
        f"/api/budgets/{monthly['id']}",
        json={"category_id": seeded["food"]["id"], "amount": 400, "period": "monthly"},
    )
    assert r.status_code == 400


# ---------- parent/child hierarchy ----------
def test_child_budget_cannot_exceed_parent(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    r = c.post(
        "/api/budgets",
        json={"category_id": seeded["grocery"]["id"], "amount": 600, "period": "monthly"},
    )
    assert r.status_code == 400


def test_sibling_children_budgets_sum_cannot_exceed_parent(seeded):
    c = seeded["client"]
    restaurants = c.post(
        "/api/categories", json={"name": "Restaurants", "kind": "expense", "parent_id": seeded["food"]["id"]}
    ).json()
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    ok = c.post(
        "/api/budgets", json={"category_id": seeded["grocery"]["id"], "amount": 300, "period": "monthly"}
    )
    assert ok.status_code == 201
    # 300 (groceries) + 250 (restaurants) = 550 > 500 parent limit
    blocked = c.post(
        "/api/budgets", json={"category_id": restaurants["id"], "amount": 250, "period": "monthly"}
    )
    assert blocked.status_code == 400
    # 300 + 200 = 500, exactly at the limit -> fine
    ok2 = c.post(
        "/api/budgets", json={"category_id": restaurants["id"], "amount": 200, "period": "monthly"}
    )
    assert ok2.status_code == 201


def test_child_budget_without_parent_budget_is_unconstrained(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/budgets", json={"category_id": seeded["grocery"]["id"], "amount": 999999, "period": "monthly"}
    )
    assert r.status_code == 201


def test_lowering_parent_below_existing_children_sum_rejected(seeded):
    c = seeded["client"]
    parent = c.post(
        "/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 1000, "period": "monthly"}
    ).json()
    c.post("/api/budgets", json={"category_id": seeded["grocery"]["id"], "amount": 800, "period": "monthly"})
    r = c.put(
        f"/api/budgets/{parent['id']}",
        json={"category_id": seeded["food"]["id"], "amount": 700, "period": "monthly"},
    )
    assert r.status_code == 400
    # lowering to something still >= children sum is fine
    r2 = c.put(
        f"/api/budgets/{parent['id']}",
        json={"category_id": seeded["food"]["id"], "amount": 800, "period": "monthly"},
    )
    assert r2.status_code == 200


def test_hierarchy_check_is_per_period(seeded):
    """A yearly parent budget doesn't constrain a monthly child budget."""
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    r = c.post(
        "/api/budgets", json={"category_id": seeded["grocery"]["id"], "amount": 9999, "period": "monthly"}
    )
    assert r.status_code == 201


# ---------- forecast: no double counting ----------
def test_forecast_no_double_count_when_both_periods_set(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500, "period": "monthly"})
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 6000, "period": "yearly"})
    d = c.get("/api/dashboard/projection?months=2").json()
    base = d["current_net_worth"]
    # monthly (500) wins over yearly/12 (500, same here) -- must not sum to 1000
    assert d["points"][1]["net_worth"] == d["points"][0]["net_worth"] - 500.0
    assert d["points"][0]["net_worth"] != base - 1000.0
