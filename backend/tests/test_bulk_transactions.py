def _tx(seeded, **kw):
    body = {
        "date": "2026-07-01",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 10,
        "payee": "SHOP",
        "splits": [{"category_id": seeded["food"]["id"], "amount": 10, "note": ""}],
    }
    body.update(kw)
    return body


def _make(c, seeded, n=3, **kw):
    return [c.post("/api/transactions", json=_tx(seeded, **kw)).json()["id"] for _ in range(n)]


def test_bulk_set_category(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 3)
    r = c.post(
        "/api/transactions/bulk",
        json={"ids": ids, "action": "set_category", "category_id": seeded["grocery"]["id"]},
    )
    assert r.status_code == 200 and r.json()["updated"] == 3
    for tx_id in ids:
        tx = c.get(f"/api/transactions?limit=200").json()["items"]
        match = next(t for t in tx if t["id"] == tx_id)
        assert len(match["splits"]) == 1
        assert match["splits"][0]["category_id"] == seeded["grocery"]["id"]


def test_bulk_set_category_to_uncategorized(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 2)
    r = c.post("/api/transactions/bulk", json={"ids": ids, "action": "set_category", "category_id": None})
    assert r.json()["updated"] == 2
    items = c.get("/api/transactions?limit=200").json()["items"]
    for tx_id in ids:
        match = next(t for t in items if t["id"] == tx_id)
        assert match["splits"][0]["category_id"] is None


def test_bulk_set_category_skips_transfers(seeded):
    c = seeded["client"]
    tx = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 50,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 13.6,
            "payee": "INTERNAL XFER 4471",
        },
    ).json()
    r = c.post(
        "/api/transactions/bulk",
        json={"ids": [tx["id"]], "action": "set_category", "category_id": seeded["food"]["id"]},
    )
    assert r.json()["updated"] == 0  # transfer skipped, not an error


def test_bulk_set_category_mixed_batch_does_not_learn_from_transfer(seeded):
    """Regression for #9: bulk set_category on a mixed list (transfer + expense)
    must not create/teach a MappingRule from the transfer's payee — only the
    expense/income rows should reach learn()."""
    c = seeded["client"]
    transfer = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 50,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 13.6,
            "payee": "INTERNAL XFER 4471",
        },
    ).json()
    expense = c.post("/api/transactions", json=_tx(seeded, payee="REAL SHOP")).json()

    r = c.post(
        "/api/transactions/bulk",
        json={
            "ids": [transfer["id"], expense["id"]],
            "action": "set_category",
            "category_id": seeded["grocery"]["id"],
        },
    )
    assert r.json()["updated"] == 1  # only the expense counted

    rules = c.get("/api/rules").json()
    patterns = [rule["pattern"] for rule in rules]
    assert "INTERNAL XFER" not in " ".join(patterns)  # transfer payee never learned
    assert any("REAL SHOP" in p for p in patterns)  # expense payee did get learned


def test_bulk_set_account(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 2)
    r = c.post(
        "/api/transactions/bulk",
        json={"ids": ids, "action": "set_account", "account_id": seeded["usd"]["id"]},
    )
    assert r.json()["updated"] == 2
    items = c.get("/api/transactions?limit=200").json()["items"]
    for tx_id in ids:
        match = next(t for t in items if t["id"] == tx_id)
        assert match["account_id"] == seeded["usd"]["id"]
        assert match["currency"] == "USD"

    # balances reflect the move: aed account no longer debited, usd account is
    accounts = {a["id"]: a for a in c.get("/api/accounts").json()}
    assert accounts[seeded["aed"]["id"]]["balance"] == 1000.0  # untouched now
    assert accounts[seeded["usd"]["id"]]["balance"] == 80.0  # 100 - 10 - 10


def test_bulk_set_account_rejects_transfer_onto_its_own_destination(seeded):
    c = seeded["client"]
    tx = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 50,
            "transfer_account_id": seeded["usd"]["id"],
            "transfer_amount": 13.6,
        },
    ).json()
    r = c.post(
        "/api/transactions/bulk",
        json={"ids": [tx["id"]], "action": "set_account", "account_id": seeded["usd"]["id"]},
    )
    assert r.status_code == 400


def test_bulk_delete(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 3)
    r = c.post("/api/transactions/bulk", json={"ids": ids, "action": "delete"})
    assert r.json()["updated"] == 3
    assert c.get("/api/transactions").json()["total"] == 0


def test_bulk_unknown_ids_404(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 1)
    r = c.post("/api/transactions/bulk", json={"ids": ids + [99999], "action": "delete"})
    assert r.status_code == 404
    assert c.get("/api/transactions").json()["total"] == 1  # nothing deleted


def test_bulk_invalid_category_rejected(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 1)
    r = c.post(
        "/api/transactions/bulk", json={"ids": ids, "action": "set_category", "category_id": 99999}
    )
    assert r.status_code == 400


def test_bulk_invalid_account_rejected(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 1)
    r = c.post("/api/transactions/bulk", json={"ids": ids, "action": "set_account", "account_id": 99999})
    assert r.status_code == 400


def test_bulk_empty_ids_rejected(seeded):
    c = seeded["client"]
    r = c.post("/api/transactions/bulk", json={"ids": [], "action": "delete"})
    assert r.status_code == 422


def test_bulk_invalid_action_rejected(seeded):
    c = seeded["client"]
    ids = _make(c, seeded, 1)
    r = c.post("/api/transactions/bulk", json={"ids": ids, "action": "nonsense"})
    assert r.status_code == 400
