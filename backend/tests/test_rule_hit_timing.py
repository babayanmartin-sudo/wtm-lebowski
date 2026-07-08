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


def test_rule_hit_not_incremented_by_preview_only(seeded):
    """Regression for #19: previewing an import (mapping applied, categories
    suggested) must not bump a MappingRule's hit_count. Only a commit should."""
    c = seeded["client"]
    rule = c.post(
        "/api/rules",
        json={"pattern": "SPINNEYS", "match_kind": "contains", "category_id": seeded["grocery"]["id"]},
    ).json()
    assert rule["hit_count"] == 0

    csv = _csv(["01/07/2026,SPINNEYS DXB,-50.00"])
    _upload_and_map(c, seeded["aed"]["id"], csv)  # preview only, no commit

    unchanged = c.get("/api/rules").json()
    matched = next(r for r in unchanged if r["id"] == rule["id"])
    assert matched["hit_count"] == 0  # preview must not have bumped it


def test_rule_hit_incremented_only_on_commit(seeded):
    c = seeded["client"]
    rule = c.post(
        "/api/rules",
        json={"pattern": "SPINNEYS", "match_kind": "contains", "category_id": seeded["grocery"]["id"]},
    ).json()

    csv = _csv(["01/07/2026,SPINNEYS DXB,-50.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    assert c.get("/api/rules").json()[0]["hit_count"] == 0  # still 0 after preview

    c.post(f"/api/imports/{imp['id']}/commit")
    committed = c.get("/api/rules").json()
    matched = next(r for r in committed if r["id"] == rule["id"])
    assert matched["hit_count"] == 1  # bumped exactly once on commit


def test_rule_hit_not_incremented_if_import_discarded(seeded):
    """The core regression: preview an import, discard it (delete, never
    commit) — hit_count must remain 0."""
    c = seeded["client"]
    rule = c.post(
        "/api/rules",
        json={"pattern": "SPINNEYS", "match_kind": "contains", "category_id": seeded["grocery"]["id"]},
    ).json()

    csv = _csv(["01/07/2026,SPINNEYS DXB,-50.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    c.delete(f"/api/imports/{imp['id']}")  # discard without committing

    rules = c.get("/api/rules").json()
    matched = next(r for r in rules if r["id"] == rule["id"])
    assert matched["hit_count"] == 0


def test_ignore_rule_hit_not_incremented_by_preview_only(seeded):
    """Same guarantee for ignore rules."""
    c = seeded["client"]
    rule = c.post(
        "/api/ignore-rules", json={"pattern": "INTERNAL XFER", "match_kind": "contains"}
    ).json()
    assert rule["hit_count"] == 0

    csv = _csv(["01/07/2026,INTERNAL XFER 4471,-50.00"])
    _upload_and_map(c, seeded["aed"]["id"], csv)  # preview only

    unchanged = c.get("/api/ignore-rules").json()
    matched = next(r for r in unchanged if r["id"] == rule["id"])
    assert matched["hit_count"] == 0


def test_ignore_rule_hit_incremented_only_on_commit(seeded):
    c = seeded["client"]
    rule = c.post(
        "/api/ignore-rules", json={"pattern": "INTERNAL XFER", "match_kind": "contains"}
    ).json()

    csv = _csv(["01/07/2026,INTERNAL XFER 4471,-50.00"])
    imp = _upload_and_map(c, seeded["aed"]["id"], csv)
    assert c.get("/api/ignore-rules").json()[0]["hit_count"] == 0

    c.post(f"/api/imports/{imp['id']}/commit")
    committed = c.get("/api/ignore-rules").json()
    matched = next(r for r in committed if r["id"] == rule["id"])
    assert matched["hit_count"] == 1


def test_rule_hit_not_incremented_for_duplicate_skipped_row(seeded):
    """A row flagged as a duplicate never becomes a transaction even on
    commit — its matching rule's hit_count should not move either."""
    c = seeded["client"]
    rule = c.post(
        "/api/rules",
        json={"pattern": "SPINNEYS", "match_kind": "contains", "category_id": seeded["grocery"]["id"]},
    ).json()

    csv = _csv(["01/07/2026,SPINNEYS DXB,-50.00"])
    imp1 = _upload_and_map(c, seeded["aed"]["id"], csv)
    c.post(f"/api/imports/{imp1['id']}/commit")
    assert c.get("/api/rules").json()[0]["hit_count"] == 1

    # re-import the exact same row -> flagged duplicate, skipped, no new hit
    imp2 = _upload_and_map(c, seeded["aed"]["id"], csv, name="s2.csv")
    c.post(f"/api/imports/{imp2['id']}/commit")
    still_one = c.get("/api/rules").json()
    matched = next(r for r in still_one if r["id"] == rule["id"])
    assert matched["hit_count"] == 1  # duplicate row didn't bump it again
