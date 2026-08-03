import io

# Simulates the reported scenario: a single bulk historical import where
# many rows legitimately share the same date+amount (payroll batches,
# recurring fees, etc.) — dedupe_hash is date+amount only, so these flag
# each other as duplicates within the same file even though none of them
# has ever been committed before.
BULK_CSV = """Date,Description,Amount
01/07/2026,Entry 1,-100
01/07/2026,Entry 2,-100
01/07/2026,Entry 3,-100
02/07/2026,Entry 4,-50
"""


def _upload_csv(c, account_id, text, name="statement.csv"):
    return c.post(
        "/api/imports",
        files={"file": (name, io.BytesIO(text.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    )


def test_unmark_all_duplicates_lets_a_bulk_import_commit_in_full(seeded):
    c = seeded["client"]
    aed = seeded["aed"]["id"]

    imp = _upload_csv(c, aed, BULK_CSV).json()
    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {"dayfirst": True}},
    )
    rows = r.json()["rows"]
    # Entry 2 and Entry 3 collide with Entry 1 (same date+amount, first
    # seen in the file) — flagged and auto-skipped, exactly the problem
    # a mass "not a duplicate" switch is for.
    assert sum(1 for row in rows if row["is_duplicate"]) == 2
    assert all(row["skip"] for row in rows if row["is_duplicate"])

    r = c.post(f"/api/imports/{imp['id']}/unmark-all-duplicates")
    rows = r.json()["rows"]
    assert all(not row["is_duplicate"] for row in rows)
    assert all(not row["skip"] for row in rows)

    r = c.post(f"/api/imports/{imp['id']}/commit")
    assert r.status_code == 200
    assert c.get("/api/transactions").json()["total"] == 4


def test_unmark_all_duplicates_preserves_manual_skip_on_non_duplicate_rows(seeded):
    c = seeded["client"]
    aed = seeded["aed"]["id"]
    csv = "Date,Description,Amount\n01/07/2026,Solo,-10\n"
    imp = _upload_csv(c, aed, csv).json()
    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {"dayfirst": True}},
    )
    row = r.json()["rows"][0]
    assert row["is_duplicate"] is False  # nothing to collide with

    c.patch(f"/api/imports/{imp['id']}/rows/{row['id']}", json={"skip": True})
    r = c.post(f"/api/imports/{imp['id']}/unmark-all-duplicates")
    assert r.json()["rows"][0]["skip"] is True  # untouched — was never flagged as a duplicate


def test_unmark_all_duplicates_404_for_unknown_import(seeded):
    c = seeded["client"]
    assert c.post("/api/imports/999/unmark-all-duplicates").status_code == 404
