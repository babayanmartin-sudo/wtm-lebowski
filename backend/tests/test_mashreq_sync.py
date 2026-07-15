import app.routers.imports as imports_router

MASHREQ_SUBJECT = "Transaction Confirmation on Mashreq Card"
BODY = (
    "Your Mashreq Cashback Card ending with 7694 was used for a purchase of "
    "AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. "
    "Available limit is AED  13,471.75"
)


def _configure(client, card_accounts):
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


def test_sync_disabled_by_default(seeded):
    c = seeded["client"]
    r = c.post("/api/imports/mashreq-sync")
    assert r.status_code == 400


def test_sync_requires_configuration_even_when_enabled(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"mashreq_sync_enabled": True})
    r = c.post("/api/imports/mashreq-sync")
    assert r.status_code == 400


def test_connection_test_requires_credentials(seeded):
    c = seeded["client"]
    r = c.post("/api/imports/mashreq-test", json={})
    body = r.json()
    assert body["ok"] is False


def test_connection_test_uses_unsaved_form_values(seeded, monkeypatch):
    c = seeded["client"]
    seen = {}

    def fake_test(host, port, user, password, folder):
        seen.update(host=host, port=port, user=user, password=password, folder=folder)
        return True, "Connected"

    monkeypatch.setattr(imports_router, "mashreq_test_connection", fake_test)
    r = c.post(
        "/api/imports/mashreq-test",
        json={
            "mashreq_imap_host": "imap.example.com",
            "mashreq_imap_user": "alerts@example.com",
            "mashreq_imap_password": "secret",
        },
    )
    body = r.json()
    assert body["ok"] is True
    assert seen["host"] == "imap.example.com"
    assert seen["port"] == "993"  # falls back to default, not saved yet
    assert seen["folder"] == "INBOX"


def test_connection_test_reports_failure(seeded, monkeypatch):
    c = seeded["client"]
    monkeypatch.setattr(
        imports_router, "mashreq_test_connection", lambda *a, **k: (False, "Login failed: bad creds")
    )
    r = c.post(
        "/api/imports/mashreq-test",
        json={"mashreq_imap_host": "imap.example.com", "mashreq_imap_user": "u", "mashreq_imap_password": "p"},
    )
    body = r.json()
    assert body["ok"] is False
    assert "bad creds" in body["message"]


def test_sync_creates_import_for_mapped_card(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c, {"7694": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, BODY)]
    )

    r = c.post("/api/imports/mashreq-sync")
    assert r.status_code == 200
    body = r.json()
    assert body["unmapped_count"] == 0
    assert body["unparsed_count"] == 0
    assert len(body["imports"]) == 1
    assert body["imports"][0]["account_id"] == seeded["aed"]["id"]
    assert body["imports"][0]["count"] == 1

    imp = c.get(f"/api/imports/{body['imports'][0]['id']}").json()
    assert imp["status"] == "preview"
    row = imp["rows"][0]
    assert row["parsed_amount"] == -220.0
    assert row["parsed_payee"] == "EGGSPECTATION RESTAURAN DUBAI AE"
    assert row["parsed_date"] == "2026-07-11"


def test_sync_skips_unmapped_card(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c, {})
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, BODY)]
    )

    r = c.post("/api/imports/mashreq-sync")
    body = r.json()
    assert body["imports"] == []
    assert body["unmapped_count"] == 1


def test_sync_dedupes_against_already_committed_alert(seeded, monkeypatch):
    """A second sync picking up the same forwarded alert (e.g. re-forwarded
    by mistake) should flag it as a duplicate against the transaction the
    first sync's commit already created — dedupe_hash is date+amount, shared
    with the CSV-import path (services/importer.py:dedupe_hash)."""
    c = seeded["client"]
    _configure(c, {"7694": seeded["aed"]["id"]})
    monkeypatch.setattr(
        imports_router, "fetch_unseen_alerts", lambda *a, **k: [(MASHREQ_SUBJECT, BODY)]
    )

    first = c.post("/api/imports/mashreq-sync").json()
    c.post(f"/api/imports/{first['imports'][0]['id']}/commit")

    second = c.post("/api/imports/mashreq-sync").json()
    imp = c.get(f"/api/imports/{second['imports'][0]['id']}").json()
    assert imp["rows"][0]["is_duplicate"] is True
    assert imp["rows"][0]["skip"] is True
