import io


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


def test_duplicate_detected_by_date_and_amount_despite_different_payee(seeded):
    """Same real transaction re-exported with a different description (bank
    vs card vs marketplace statement) must still be caught."""
    c = seeded["client"]
    imp1 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,AMZN MKTP UK 1A2B3,-45.00\n"
    )
    c.post(f"/api/imports/{imp1['id']}/commit")

    imp2 = _upload_and_map(
        c,
        seeded["aed"]["id"],
        "Date,Description,Amount\n01/07/2026,AMAZON.COM PURCHASE,-45.00\n",
        name="other.csv",
    )
    row = imp2["rows"][0]
    assert row["is_duplicate"] is True
    assert row["skip"] is True


def test_different_amount_same_day_not_duplicate(seeded):
    c = seeded["client"]
    imp1 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,SHOP,-45.00\n"
    )
    c.post(f"/api/imports/{imp1['id']}/commit")

    imp2 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,SHOP,-45.01\n", name="other.csv"
    )
    row = imp2["rows"][0]
    assert row["is_duplicate"] is False
    assert row["skip"] is False


def test_opposite_sign_same_magnitude_not_duplicate(seeded):
    """An expense and an unrelated income of equal magnitude on the same
    day are not the same transaction — exact signed amount must match."""
    c = seeded["client"]
    imp1 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,REFUND OUT,-45.00\n"
    )
    c.post(f"/api/imports/{imp1['id']}/commit")

    imp2 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,REFUND IN,45.00\n", name="other.csv"
    )
    row = imp2["rows"][0]
    assert row["is_duplicate"] is False


def test_duplicate_scoped_to_same_account_only(seeded):
    c = seeded["client"]
    imp1 = _upload_and_map(
        c, seeded["aed"]["id"], "Date,Description,Amount\n01/07/2026,SHOP,-45.00\n"
    )
    c.post(f"/api/imports/{imp1['id']}/commit")

    imp2 = _upload_and_map(
        c, seeded["usd"]["id"], "Date,Description,Amount\n01/07/2026,SHOP,-45.00\n", name="other.csv"
    )
    row = imp2["rows"][0]
    assert row["is_duplicate"] is False


def test_intra_file_duplicates_also_caught(seeded):
    c = seeded["client"]
    imp = _upload_and_map(
        c,
        seeded["aed"]["id"],
        "Date,Description,Amount\n01/07/2026,SHOP A,-45.00\n01/07/2026,SHOP B,-45.00\n",
    )
    rows = imp["rows"]
    assert rows[0]["is_duplicate"] is False
    assert rows[1]["is_duplicate"] is True
