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


def _configure_mailbox(client):
    client.put(
        "/api/settings",
        json={
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
        },
    )


def test_amazon_sync_requires_mailbox_configuration(seeded):
    c = seeded["client"]
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

    first = c.post("/api/imports/amazon-sync").json()
    c.post(f"/api/imports/{first['import_id']}/commit")

    second = c.post("/api/imports/amazon-sync").json()
    imp = c.get(f"/api/imports/{second['import_id']}").json()
    assert all(row["is_duplicate"] for row in imp["rows"])
    assert all(row["skip"] for row in imp["rows"])
