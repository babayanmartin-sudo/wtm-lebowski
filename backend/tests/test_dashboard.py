def test_default_period_is_current_month(seeded):
    from datetime import date

    c = seeded["client"]
    d = c.get("/api/dashboard/summary").json()
    today = date.today()
    assert d["date_from"] == today.replace(day=1).isoformat()
    assert d["date_from"][:7] == d["date_to"][:7]


def test_custom_range_rejects_inverted_dates(seeded):
    c = seeded["client"]
    r = c.get("/api/dashboard/summary?date_from=2026-07-31&date_to=2026-07-01")
    assert r.status_code == 400


def test_granularity_switches_with_range_span(seeded):
    c = seeded["client"]
    day = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-07").json()
    assert day["series_granularity"] == "day"
    assert len(day["series"]) == 7

    week = c.get("/api/dashboard/summary?date_from=2026-01-01&date_to=2026-04-01").json()
    assert week["series_granularity"] == "week"

    month = c.get("/api/dashboard/summary?date_from=2025-01-01&date_to=2026-12-31").json()
    assert month["series_granularity"] == "month"


def test_series_buckets_transactions_correctly(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-03",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 25.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 25.0, "note": ""}],
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
    d = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    by_label = {b["label"]: b for b in d["series"]}
    assert by_label["2026-07-03"]["expense"] == 25.0
    assert by_label["2026-07-10"]["income"] == 500.0
    assert by_label["2026-07-01"]["expense"] == 0.0
    assert d["expense"] == 25.0
    assert d["income"] == 500.0


def test_account_filter_scopes_totals_and_recent(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 30.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 30.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["usd"]["id"],
            "amount": 15.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 15.0, "note": ""}],
        },
    )
    all_accounts = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    assert all_accounts["expense"] > 30.0  # includes both

    only_aed = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['aed']['id']}"
    ).json()
    assert only_aed["expense"] == 30.0
    assert len(only_aed["recent"]) == 1
    assert only_aed["recent"][0]["account_id"] == seeded["aed"]["id"]


def test_account_filter_includes_transfer_destination_in_recent(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 27.0,
        },
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['usd']['id']}"
    ).json()
    assert len(d["recent"]) == 1
    assert d["recent"][0]["transfer_account_id"] == seeded["usd"]["id"]


def test_account_filter_includes_transfer_in_income_and_expense_totals(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 27.0,
        },
    )
    source = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['aed']['id']}"
    ).json()
    assert source["expense"] == 100.0
    assert source["income"] == 0.0

    dest = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['usd']['id']}"
    ).json()
    assert dest["income"] > 0  # 27 USD converted to AED at whatever rate is cached/live
    assert dest["expense"] == 0.0

    # globally a transfer between own accounts still nets to zero — not real income/expense
    overall = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    assert overall["expense"] == 0.0
    assert overall["income"] == 0.0


def test_account_filter_puts_transfer_in_correct_series_bucket(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 27.0,
        },
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['aed']['id']}"
    ).json()
    by_label = {b["label"]: b for b in d["series"]}
    assert by_label["2026-07-05"]["expense"] == 100.0

    dest = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&account_id={seeded['usd']['id']}"
    ).json()
    by_label_dest = {b["label"]: b for b in dest["series"]}
    assert dest["income"] > 0
    assert by_label_dest["2026-07-05"]["income"] == dest["income"]


def test_transfer_excluded_from_totals_when_category_filter_also_set(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 27.0,
        },
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31"
        f"&account_id={seeded['aed']['id']}&category_id={seeded['food']['id']}"
    ).json()
    assert d["expense"] == 0.0  # transfers carry no category, so a category filter excludes them


def test_category_filter_scopes_totals_and_by_category_breakdown(seeded):
    c = seeded["client"]
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
            "amount": 60.0,
            "splits": [{"category_id": None, "amount": 60.0, "note": ""}],
        },
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&category_id={seeded['food']['id']}"
    ).json()
    assert d["expense"] == 40.0  # only Food (incl. Groceries child), not the uncategorized 60
    names = {b["name"] for b in d["by_category"]}
    assert names == {"Groceries"}  # breakdown into Food's children


def test_category_filter_with_no_children_shows_itself(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "income",
            "account_id": seeded["aed"]["id"],
            "amount": 1000.0,
            "splits": [{"category_id": seeded["salary"]["id"], "amount": 1000.0, "note": ""}],
        },
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31&category_id={seeded['salary']['id']}"
    ).json()
    assert d["income"] == 1000.0


def test_recent_respects_period_filter(seeded):
    """Recent transactions now scope to the selected period — a transaction
    dated outside date_from/date_to shouldn't appear, matching the rest of
    the dashboard (previously `recent` ignored the period entirely)."""
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2020-01-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 5.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 5.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-15",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 7.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 7.0, "note": ""}],
        },
    )
    d = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    assert d["expense"] == 7.0
    assert len(d["recent"]) == 1
    assert d["recent"][0]["date"] == "2026-07-15"
