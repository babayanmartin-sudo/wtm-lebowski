import io


def _upload(c, account_id, csv_text, mapping, options=None, name="s.csv"):
    imp = c.post(
        "/api/imports",
        files={"file": (name, io.BytesIO(csv_text.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    ).json()
    return c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": mapping, "options": options or {}},
    ).json()


def test_direction_column_debit_and_credit(seeded):
    c = seeded["client"]
    csv = (
        "Date,Description,Amount,Type\n"
        "01/07/2026,CARREFOUR,120.50,Debit\n"
        "02/07/2026,SALARY,15000.00,Credit\n"
    )
    imp = _upload(
        c, seeded["aed"]["id"], csv, {"date": 0, "payee": 1, "amount": 2, "direction": 3}
    )
    rows = imp["rows"]
    assert rows[0]["parsed_amount"] == -120.5
    assert rows[1]["parsed_amount"] == 15000.0


def test_direction_column_case_insensitive_and_abbreviations(seeded):
    c = seeded["client"]
    csv = (
        "Date,Description,Amount,Type\n"
        "01/07/2026,SHOP A,50.00,dr\n"
        "02/07/2026,SHOP B,60.00,CR\n"
        "03/07/2026,SHOP C,70.00,  debit  \n"
    )
    imp = _upload(
        c, seeded["aed"]["id"], csv, {"date": 0, "payee": 1, "amount": 2, "direction": 3}
    )
    rows = imp["rows"]
    assert rows[0]["parsed_amount"] == -50.0
    assert rows[1]["parsed_amount"] == 60.0
    assert rows[2]["parsed_amount"] == -70.0


def test_direction_column_unrecognized_value_errors(seeded):
    c = seeded["client"]
    csv = "Date,Description,Amount,Type\n01/07/2026,SHOP,50.00,Reversal\n"
    imp = _upload(
        c, seeded["aed"]["id"], csv, {"date": 0, "payee": 1, "amount": 2, "direction": 3}
    )
    row = imp["rows"][0]
    assert row["parsed_amount"] is None
    assert "unrecognized" in row["error"]
    assert row["skip"] is True


def test_direction_column_without_amount_rejected_at_mapping(seeded):
    """direction alone (no debit/credit/amount) fails the same 'needs an
    amount source' guard as any other incomplete mapping."""
    c = seeded["client"]
    csv = "Date,Description,Type\n01/07/2026,SHOP,Debit\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "direction": 2}, "options": {}},
    )
    assert r.status_code == 400


def test_direction_without_amount_but_with_debit_hits_row_level_error(seeded):
    """A mapping can pass the router's 'has some amount source' guard (debit
    present) while still lacking the amount column direction needs."""
    c = seeded["client"]
    csv = "Date,Description,Debit,Type\n01/07/2026,SHOP,50.00,Debit\n"
    imp = _upload(
        c, seeded["aed"]["id"], csv, {"date": 0, "payee": 1, "debit": 2, "direction": 3}
    )
    row = imp["rows"][0]
    assert row["error"] == "direction column requires an amount column"
    assert row["skip"] is True
