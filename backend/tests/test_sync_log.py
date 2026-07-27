import imaplib

import app.routers.imports as imports_router
from app.services import auto_sync

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
MASHREQ_BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)


def _configure_mashreq(client, card_accounts):
    client.put(
        "/api/settings",
        json={
            "mashreq_sync_enabled": True,
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
            "mashreq_card_accounts": card_accounts,
        },
    )


def test_sync_log_empty_by_default(seeded):
    c = seeded["client"]
    assert c.get("/api/imports/sync-log").json() == []


def test_sync_log_records_manual_run_with_counts(seeded, monkeypatch):
    c = seeded["client"]
    _configure_mashreq(c, {"7694": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, MASHREQ_BODY)]
    )
    c.post("/api/imports/mashreq-sync")

    log = c.get("/api/imports/sync-log").json()
    assert len(log) == 1
    assert log[0]["source"] == "mashreq"
    assert log[0]["trigger"] == "manual"
    assert log[0]["imported_count"] == 1
    assert log[0]["unmapped_count"] == 0
    assert log[0]["unparsed_count"] == 0
    assert log[0]["error"] is None


def test_sync_log_records_unmapped_card(seeded, monkeypatch):
    """The alert gets marked \\Seen by fetch_unseen_alerts regardless of
    whether it maps to an account — this is the only place that surfaces
    that an alert was silently dropped."""
    c = seeded["client"]
    _configure_mashreq(c, {})  # no card mapping
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, MASHREQ_BODY)]
    )
    c.post("/api/imports/mashreq-sync")

    log = c.get("/api/imports/sync-log").json()
    assert log[0]["imported_count"] == 0
    assert log[0]["unmapped_count"] == 1


def test_sync_log_records_imap_error(seeded, monkeypatch):
    c = seeded["client"]
    _configure_mashreq(c, {"7694": seeded["aed"]["id"]})

    def raise_imap_error(*a, **k):
        raise imaplib.IMAP4.error("bad login")

    monkeypatch.setattr(imports_router, "fetch_unseen_alerts", raise_imap_error)
    r = c.post("/api/imports/mashreq-sync")
    assert r.status_code == 502

    log = c.get("/api/imports/sync-log").json()
    assert len(log) == 1
    assert log[0]["error"] is not None
    assert "IMAP error" in log[0]["error"]


def test_sync_log_distinguishes_auto_from_manual_trigger(seeded, monkeypatch):
    c = seeded["client"]
    c.put(
        "/api/settings",
        json={
            "auto_sync_enabled": True,
            "auto_sync_frequency_minutes": 15,
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
            "mashreq_card_accounts": {"7694": seeded["aed"]["id"]},
        },
    )
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, MASHREQ_BODY)]
    )

    auto_sync.run_due_sync()

    log = c.get("/api/imports/sync-log").json()
    assert len(log) == 1
    assert log[0]["trigger"] == "auto"


def test_sync_log_does_not_record_when_not_configured(seeded):
    c = seeded["client"]
    r = c.post("/api/imports/mashreq-sync")
    assert r.status_code == 400
    assert c.get("/api/imports/sync-log").json() == []
