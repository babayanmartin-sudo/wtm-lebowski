import app.routers.imports as imports_router

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
MASHREQ_BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)


def test_pending_imports_empty_by_default(seeded):
    c = seeded["client"]
    assert c.get("/api/imports/pending").json() == []


def test_sync_created_import_shows_as_pending_until_committed(seeded, monkeypatch):
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
    result = c.post("/api/imports/mashreq-sync").json()
    import_id = result["imports"][0]["id"]

    pending = c.get("/api/imports/pending").json()
    assert len(pending) == 1
    assert pending[0]["id"] == import_id
    assert pending[0]["status"] == "preview"
    assert pending[0]["row_count"] == 1
    assert pending[0]["account_name"] == seeded["aed"]["name"]

    c.post(f"/api/imports/{import_id}/commit")

    assert c.get("/api/imports/pending").json() == []
