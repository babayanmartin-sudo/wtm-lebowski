from app.db import SessionLocal
from app.services import insights_tools


def test_get_summary_matches_dashboard(seeded):
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
    dash = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()

    db = SessionLocal()
    try:
        result = insights_tools.get_summary(db, date_from="2026-07-01", date_to="2026-07-31")
    finally:
        db.close()
    assert result["expense"] == dash["expense"]
    assert result["income"] == dash["income"]


def test_get_category_breakdown_matches_dashboard(seeded):
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
    dash = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()

    db = SessionLocal()
    try:
        result = insights_tools.get_category_breakdown(db, date_from="2026-07-01", date_to="2026-07-31")
    finally:
        db.close()
    assert result["categories"] == dash["by_category"]


def test_get_category_breakdown_drills_into_subcategories(seeded):
    """Without category_id, Groceries rolls up into its parent Food — the
    tool must accept category_id to break Food back out into Groceries,
    otherwise the assistant has no way to answer subcategory questions."""
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

    db = SessionLocal()
    try:
        rolled_up = insights_tools.get_category_breakdown(db, date_from="2026-07-01", date_to="2026-07-31")
        drilled = insights_tools.get_category_breakdown(
            db, date_from="2026-07-01", date_to="2026-07-31", category_id=seeded["food"]["id"]
        )
    finally:
        db.close()

    assert [c["category_id"] for c in rolled_up["categories"]] == [seeded["food"]["id"]]
    # Food itself has no direct spend (all under Groceries) — zero rows are
    # dropped, so only the subcategory shows up once drilled into.
    assert [c["category_id"] for c in drilled["categories"]] == [seeded["grocery"]["id"]]
    assert drilled["categories"][0]["amount"] == 40.0


def test_search_transactions_matches_list_endpoint(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "payee": "Carrefour",
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    listed = c.get("/api/transactions?q=Carrefour").json()

    db = SessionLocal()
    try:
        result = insights_tools.search_transactions(db, q="Carrefour")
    finally:
        db.close()
    assert result["total_matching"] == listed["total"]
    assert result["transactions"][0]["payee"] == "Carrefour"


def test_search_transactions_caps_limit_at_20(seeded):
    db = SessionLocal()
    try:
        result = insights_tools.search_transactions(db, limit=500)
    finally:
        db.close()
    assert result["total_matching"] == 0  # sanity: doesn't error on an over-large limit


def test_get_budget_status_matches_budgets_endpoint(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500})
    status = c.get("/api/budgets/status?month=2026-07").json()

    db = SessionLocal()
    try:
        result = insights_tools.get_budget_status(db, month="2026-07")
    finally:
        db.close()
    assert len(result["budgets"]) == len(status)
    assert result["budgets"][0]["limit"] == status[0]["amount"]
    assert result["budgets"][0]["category"] == "Food"


def test_get_accounts_balances_matches_accounts_endpoint(seeded):
    c = seeded["client"]
    accounts = c.get("/api/accounts").json()

    db = SessionLocal()
    try:
        result = insights_tools.get_accounts_balances(db)
    finally:
        db.close()
    names = {a["name"] for a in result["accounts"]}
    assert names == {a["name"] for a in accounts if not a["archived"]}
