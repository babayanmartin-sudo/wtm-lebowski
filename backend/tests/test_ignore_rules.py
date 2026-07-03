import io


def _csv(rows: list[str]) -> str:
    return "Date,Description,Amount\n" + "\n".join(rows) + "\n"


def _upload_and_map(c, account_id, csv_text, name="s.csv"):
    imp = c.post(
        "/api/imports",
        files={"file": (name, io.BytesIO(csv_text.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    ).json()
    return c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()


# ---------- ignore rules CRUD ----------
def test_ignore_rule_crud_and_duplicate(seeded):
    c = seeded["client"]
    body = {"pattern": "INTERNAL XFER", "match_kind": "contains", "priority": 0}
    r = c.post("/api/ignore-rules", json=body)
    assert r.status_code == 201
    rule = r.json()
    assert rule["pattern"] == "INTERNAL XFER"
    assert c.post("/api/ignore-rules", json=body).status_code == 409

    assert len(c.get("/api/ignore-rules?q=internal").json()) == 1
    assert c.get("/api/ignore-rules?q=zzz").json() == []

    r = c.put(f"/api/ignore-rules/{rule['id']}", json={**body, "priority": 7})
    assert r.json()["priority"] == 7

    assert c.delete(f"/api/ignore-rules/{rule['id']}").status_code == 204
    assert c.get("/api/ignore-rules").json() == []

    # bad match_kind / empty pattern
    assert c.post("/api/ignore-rules", json={"pattern": "X", "match_kind": "regex"}).status_code == 400
    assert c.post("/api/ignore-rules", json={"pattern": "123 456", "match_kind": "exact"}).status_code == 400
    assert c.put("/api/ignore-rules/999", json=body).status_code == 404
    assert c.delete("/api/ignore-rules/999").status_code == 404


# ---------- ignore action on import rows ----------
def test_ignore_row_blocks_siblings_now_and_future(seeded):
    c = seeded["client"]
    csv = _csv(
        [
            "01/07/2026,INTERNAL TRANSFER REF 1001,-100.00",
            "02/07/2026,INTERNAL TRANSFER REF 1002,-50.00",
            "03/07/2026,CARREFOUR MALL,-30.00",
        ]
    )
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    rows = imp["rows"]
    target = next(r for r in rows if "1001" in r["parsed_payee"])

    r = c.post(f"/api/imports/{imp['id']}/rows/{target['id']}/ignore")
    assert r.status_code == 200
    imp2 = r.json()
    ignored_rows = [row for row in imp2["rows"] if "INTERNAL TRANSFER" in row["parsed_payee"]]
    assert len(ignored_rows) == 2
    for row in ignored_rows:
        assert row["ignored"] is True
        assert row["skip"] is True
        assert row["category_id"] is None
    carrefour_row = next(row for row in imp2["rows"] if "CARREFOUR" in row["parsed_payee"])
    assert carrefour_row["ignored"] is False and carrefour_row["skip"] is False

    # commit only imports the non-ignored row
    c.post(f"/api/imports/{imp['id']}/commit")
    txs = c.get("/api/transactions").json()
    assert txs["total"] == 1
    assert "CARREFOUR" in txs["items"][0]["payee"]

    # a completely different file/account, same merchant text -> pre-ignored
    csv2 = _csv(["04/07/2026,INTERNAL TRANSFER REF 9999,-20.00"])
    imp3 = _upload_and_map(c, seeded["usd"]["id"], csv2, name="other.csv")
    row3 = imp3["rows"][0]
    assert row3["ignored"] is True
    assert row3["skip"] is True


def test_ignore_row_requires_payee(seeded):
    c = seeded["client"]
    csv = "Date,Amount\n01/07/2026,-10.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("noPayee.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping", json={"mapping": {"date": 0, "amount": 1}, "options": {}}
    ).json()
    row = imp["rows"][0]
    assert row["parsed_payee"] == ""
    assert c.post(f"/api/imports/{imp['id']}/rows/{row['id']}/ignore").status_code == 400


def test_ignore_rule_contains_match(seeded):
    c = seeded["client"]
    c.post("/api/ignore-rules", json={"pattern": "AMZN MKTP", "match_kind": "contains"})
    csv = _csv(["01/07/2026,AMZN MKTP UK 1A2B3,-15.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    row = imp["rows"][0]
    assert row["ignored"] is True and row["skip"] is True


# ---------- bulk category propagation ----------
def test_patch_category_propagates_to_similar_rows_and_learns_immediately(seeded):
    c = seeded["client"]
    csv = _csv(
        [
            "01/07/2026,SPINNEYS DXB 4412,-89.90",
            "02/07/2026,SPINNEYS DXB 7788,-45.00",
            "03/07/2026,CARREFOUR MALL,-30.00",
        ]
    )
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    rows = imp["rows"]
    spinneys = [r for r in rows if "SPINNEYS" in r["parsed_payee"]]
    carrefour = next(r for r in rows if "CARREFOUR" in r["parsed_payee"])

    r = c.patch(
        f"/api/imports/{imp['id']}/rows/{spinneys[0]['id']}",
        json={"category_id": seeded["grocery"]["id"]},
    )
    assert r.status_code == 200
    updated = r.json()
    updated_spinneys = [row for row in updated["rows"] if "SPINNEYS" in row["parsed_payee"]]
    assert all(row["category_id"] == seeded["grocery"]["id"] for row in updated_spinneys)
    updated_carrefour = next(row for row in updated["rows"] if "CARREFOUR" in row["parsed_payee"])
    assert updated_carrefour["category_id"] != seeded["grocery"]["id"] or updated_carrefour["category_id"] is None

    # rule learned immediately, before commit
    rules = c.get("/api/rules").json()
    assert any(rule["pattern"] == "SPINNEYS DXB" and rule["category_id"] == seeded["grocery"]["id"] for rule in rules)


def test_patch_category_explicit_null_clears_category(seeded):
    c = seeded["client"]
    csv = _csv(["01/07/2026,SOME SHOP,-10.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    row = imp["rows"][0]
    assert row["category_id"] is not None or row["category_id"] is None  # whatever default suggestion was

    # explicitly set a category first
    imp = c.patch(
        f"/api/imports/{imp['id']}/rows/{row['id']}", json={"category_id": seeded["food"]["id"]}
    ).json()
    assert imp["rows"][0]["category_id"] == seeded["food"]["id"]

    # explicit null must clear it (not be a no-op)
    imp = c.patch(f"/api/imports/{imp['id']}/rows/{row['id']}", json={"category_id": None}).json()
    assert imp["rows"][0]["category_id"] is None


def test_patch_skip_only_does_not_touch_category(seeded):
    c = seeded["client"]
    csv = _csv(["01/07/2026,SOME SHOP,-10.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    row = imp["rows"][0]
    imp = c.patch(
        f"/api/imports/{imp['id']}/rows/{row['id']}", json={"category_id": seeded["food"]["id"]}
    ).json()
    imp = c.patch(f"/api/imports/{imp['id']}/rows/{row['id']}", json={"skip": True}).json()
    assert imp["rows"][0]["skip"] is True
    assert imp["rows"][0]["category_id"] == seeded["food"]["id"]
