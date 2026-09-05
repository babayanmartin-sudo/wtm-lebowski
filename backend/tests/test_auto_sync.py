from datetime import datetime, timedelta, timezone

import app.routers.imports as imports_router
from app.services import auto_sync
from app.services.settings import AUTO_SYNC_LAST_RUN_KEY, get_str_setting

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
MASHREQ_BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)


def test_settings_default_auto_sync_off(seeded):
    d = seeded["client"].get("/api/settings").json()
    assert d["auto_sync_enabled"] is False
    assert d["auto_sync_frequency_minutes"] == 60.0


def test_frequency_below_minimum_rejected(seeded):
    c = seeded["client"]
    r = c.put("/api/settings", json={"auto_sync_frequency_minutes": 5})
    assert r.status_code == 422


def test_frequency_round_trip(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"auto_sync_enabled": True, "auto_sync_frequency_minutes": 30})
    d = c.get("/api/settings").json()
    assert d["auto_sync_enabled"] is True
    assert d["auto_sync_frequency_minutes"] == 30.0


def test_run_due_templates_posts_regardless_of_auto_sync_setting(seeded):
    """Template auto-post has no on/off setting of its own (per-template
    via Template.auto_post) — run_due_templates must post a due template
    even with auto-sync (mailbox sync) left disabled."""
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json={
            "name": "Gym",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100,
            "category_id": seeded["food"]["id"],
            "frequency": "monthly",
            "interval": 1,
            "next_due": "2026-06-01",
            "auto_post": False,  # created inactive-to-post so the tick does the posting, not create_template
        },
    ).json()
    assert c.get("/api/transactions").json()["total"] == 0

    from app.db import SessionLocal
    from app.models import Template

    db = SessionLocal()
    try:
        db.get(Template, t["id"]).auto_post = True
        db.commit()
    finally:
        db.close()

    auto_sync.run_due_templates()
    assert c.get("/api/transactions").json()["total"] > 0


def test_run_due_sync_noop_when_disabled(seeded):
    from app.db import SessionLocal

    auto_sync.run_due_sync()
    db = SessionLocal()
    try:
        assert get_str_setting(db, AUTO_SYNC_LAST_RUN_KEY, "") == ""
    finally:
        db.close()


def test_run_due_sync_runs_when_enabled_and_due(seeded, monkeypatch):
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

    from app.db import SessionLocal

    db = SessionLocal()
    try:
        last_run = get_str_setting(db, AUTO_SYNC_LAST_RUN_KEY, "")
        assert last_run != ""
    finally:
        db.close()


def test_run_due_sync_skips_if_not_yet_due(seeded, monkeypatch):
    from app.db import SessionLocal
    from app.services.settings import set_str_setting

    c = seeded["client"]
    c.put("/api/settings", json={"auto_sync_enabled": True, "auto_sync_frequency_minutes": 60})

    db = SessionLocal()
    recent = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    set_str_setting(db, AUTO_SYNC_LAST_RUN_KEY, recent)
    db.commit()
    db.close()

    called = {"n": 0}

    def fake_fetch(*a, **k):
        called["n"] += 1
        return []

    monkeypatch.setattr(imports_router, "fetch_unseen_alerts", fake_fetch)
    auto_sync.run_due_sync()
    assert called["n"] == 0
