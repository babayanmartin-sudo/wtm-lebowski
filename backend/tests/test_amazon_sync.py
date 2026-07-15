import app.routers.imports as imports_router

AMAZON_SUBJECT = 'Ordered: "SLEEPHEAD®Toddler Travel..." and 3 more items'
BODY = """
* SLEEPHEAD Toddler Travel Airplane Bed
  Quantity: 1
  65.99 AED

* DENTEK DNTK FUN 90CT FLOSSER 36
  Quantity: 1
  19.62 AED
"""

REFUND_SUBJECT = "Refund on order 403-8966210-6057160"
REFUND_BODY = """
This refund is for the following item(s):

    Item: JC Toys - Lots to Love Babies 14" All Vinyl Doll
    Quantity: 1
    ASIN: B07TT7LRR6

Total Refund: AED113.88
"""


def _configure_mailbox(client):
    client.put(
        "/api/settings",
        json={
            "amazon_sync_enabled": True,
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
        },
    )


def _no_refunds(monkeypatch):
    monkeypatch.setattr(imports_router, "fetch_unseen_refunds", lambda *a, **k: [])


def _no_orders(monkeypatch):
    monkeypatch.setattr(imports_router, "fetch_unseen_orders", lambda *a, **k: [])


def test_amazon_sync_disabled_by_default(seeded):
    c = seeded["client"]
    r = c.post("/api/imports/amazon-sync")
    assert r.status_code == 400


def test_amazon_sync_requires_mailbox_configuration_even_when_enabled(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"amazon_sync_enabled": True})
    r = c.post("/api/imports/amazon-sync")
    assert r.status_code == 400


def test_amazon_sync_requires_default_account(seeded):
    c = seeded["client"]
    _configure_mailbox(c)
    r = c.post("/api/imports/amazon-sync")
    assert r.status_code == 400


def test_amazon_sync_creates_import_with_line_items(seeded, monkeypatch):
    import datetime

    c = seeded["client"]
    _configure_mailbox(c)
    c.put("/api/settings", json={"amazon_default_account_id": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_orders",
        lambda *a, **k: [(AMAZON_SUBJECT, BODY, datetime.date(2026, 7, 7))],
    )
    _no_refunds(monkeypatch)

    r = c.post("/api/imports/amazon-sync")
    assert r.status_code == 200
    body = r.json()
    assert body["imported_count"] == 2
    assert body["unparsed_count"] == 0
    assert body["import_id"] is not None

    imp = c.get(f"/api/imports/{body['import_id']}").json()
    assert imp["status"] == "preview"
    assert imp["account_id"] == seeded["aed"]["id"]
    rows = imp["rows"]
    assert len(rows) == 2
    assert rows[0]["parsed_amount"] == -65.99
    assert rows[0]["parsed_date"] == "2026-07-07"
    assert rows[1]["parsed_amount"] == -19.62


def test_amazon_sync_no_items_returns_no_import(seeded, monkeypatch):
    import datetime

    c = seeded["client"]
    _configure_mailbox(c)
    c.put("/api/settings", json={"amazon_default_account_id": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_orders",
        lambda *a, **k: [("Shipped: your order", "no items here", datetime.date(2026, 7, 7))],
    )
    _no_refunds(monkeypatch)

    r = c.post("/api/imports/amazon-sync")
    body = r.json()
    assert body["imported_count"] == 0
    assert body["unparsed_count"] == 1
    assert body["import_id"] is None


def test_amazon_sync_dedupes_against_already_committed_item(seeded, monkeypatch):
    import datetime

    c = seeded["client"]
    _configure_mailbox(c)
    c.put("/api/settings", json={"amazon_default_account_id": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_orders",
        lambda *a, **k: [(AMAZON_SUBJECT, BODY, datetime.date(2026, 7, 7))],
    )
    _no_refunds(monkeypatch)

    first = c.post("/api/imports/amazon-sync").json()
    c.post(f"/api/imports/{first['import_id']}/commit")

    second = c.post("/api/imports/amazon-sync").json()
    imp = c.get(f"/api/imports/{second['import_id']}").json()
    assert all(row["is_duplicate"] for row in imp["rows"])
    assert all(row["skip"] for row in imp["rows"])


def test_amazon_sync_creates_income_row_for_refund(seeded, monkeypatch):
    import datetime

    c = seeded["client"]
    _configure_mailbox(c)
    c.put("/api/settings", json={"amazon_default_account_id": seeded["aed"]["id"]})
    _no_orders(monkeypatch)
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_refunds",
        lambda *a, **k: [(REFUND_SUBJECT, REFUND_BODY, datetime.date(2026, 2, 9))],
    )

    r = c.post("/api/imports/amazon-sync")
    body = r.json()
    assert body["imported_count"] == 1
    assert body["import_id"] is not None

    imp = c.get(f"/api/imports/{body['import_id']}").json()
    row = imp["rows"][0]
    assert row["parsed_amount"] == 113.88  # positive: income/refund, not expense
    assert row["kind"] == "expense_return"
    assert row["parsed_date"] == "2026-02-09"
    assert "JC Toys" in row["parsed_payee"]


def test_amazon_sync_combines_orders_and_refunds_in_one_import(seeded, monkeypatch):
    import datetime

    c = seeded["client"]
    _configure_mailbox(c)
    c.put("/api/settings", json={"amazon_default_account_id": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_orders",
        lambda *a, **k: [(AMAZON_SUBJECT, BODY, datetime.date(2026, 7, 7))],
    )
    monkeypatch.setattr(
        imports_router,
        "fetch_unseen_refunds",
        lambda *a, **k: [(REFUND_SUBJECT, REFUND_BODY, datetime.date(2026, 2, 9))],
    )

    r = c.post("/api/imports/amazon-sync")
    body = r.json()
    assert body["imported_count"] == 3
    imp = c.get(f"/api/imports/{body['import_id']}").json()
    assert len(imp["rows"]) == 3
    kinds = [row["kind"] for row in imp["rows"]]
    assert kinds.count("expense_return") == 1
