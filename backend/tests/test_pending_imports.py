import io

import app.routers.imports as imports_router

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
MASHREQ_BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)

CSV = """Date,Description,Amount
01/07/2026,CARREFOUR MALL BR 42,-120.50
"""


def _upload_csv(c, account_id):
    return c.post(
        "/api/imports",
        files={"file": ("statement.csv", io.BytesIO(CSV.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    )


def test_pending_imports_empty_by_default(seeded):
    c = seeded["client"]
    assert c.get("/api/imports/pending").json() == []


def test_csv_upload_shows_as_pending_until_committed(seeded):
    c = seeded["client"]
    imp = _upload_csv(c, seeded["aed"]["id"]).json()
    c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {"dayfirst": True}},
    )

    pending = c.get("/api/imports/pending").json()
    assert len(pending) == 1
    assert pending[0]["id"] == imp["id"]
    assert pending[0]["status"] == "preview"
    assert pending[0]["row_count"] == 1
    assert pending[0]["account_name"] == seeded["aed"]["name"]

    c.post(f"/api/imports/{imp['id']}/commit")

    assert c.get("/api/imports/pending").json() == []


def test_mashreq_sync_does_not_show_as_pending(seeded, monkeypatch):
    """Unlike a CSV upload, Mashreq/Amazon sync commits straight to
    transactions — it should never sit in the pending-imports list."""
    c = seeded["client"]
    c.put(
        "/api/settings",
        json={
            "mashreq_sync_enabled": True,
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
            "mashreq_card_accounts": {"7694": seeded["aed"]["id"]},
        },
    )
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, MASHREQ_BODY)]
    )
    c.post("/api/imports/mashreq-sync")

    assert c.get("/api/imports/pending").json() == []
