import app.routers.imports as imports_router

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
MASHREQ_BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)


def test_sync_all_skips_unconfigured_sources(seeded):
    c = seeded["client"]
    r = c.post("/api/imports/sync-all")
    assert r.status_code == 200
    body = r.json()
    assert body["mashreq"] is None
    assert body["amazon"] is None
    assert body["errors"] == []


def test_sync_all_runs_mashreq_regardless_of_manual_toggle(seeded, monkeypatch):
    c = seeded["client"]
    c.put(
        "/api/settings",
        json={
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
            "mashreq_card_accounts": {"7694": seeded["aed"]["id"]},
            "mashreq_sync_enabled": False,  # manual button off, sync-all still runs it
        },
    )
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, MASHREQ_BODY)]
    )
    r = c.post("/api/imports/sync-all")
    body = r.json()
    assert body["mashreq"]["imports"][0]["count"] == 1
    assert body["amazon"] is None
    assert body["errors"] == []


def test_sync_all_collects_errors_without_failing_other_source(seeded, monkeypatch):
    c = seeded["client"]
    c.put(
        "/api/settings",
        json={
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
        },
    )
    import imaplib

    def raise_imap_error(*a, **k):
        raise imaplib.IMAP4.error("bad login")

    monkeypatch.setattr(imports_router, "fetch_unseen_alerts", raise_imap_error)
    r = c.post("/api/imports/sync-all")
    body = r.json()
    assert body["mashreq"] is None
    assert len(body["errors"]) == 1
    assert "Mashreq" in body["errors"][0]
