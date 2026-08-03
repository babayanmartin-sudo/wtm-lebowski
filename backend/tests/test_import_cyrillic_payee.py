import io

CSV = """payee,date,description,amount
Поддержка,01/08/2026,,-10000
Поддержка,01/07/2026,,-5000
"""


def _upload_csv(c, account_id, text, name="statement.csv"):
    return c.post(
        "/api/imports",
        files={"file": (name, io.BytesIO(text.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    )


def test_category_applies_to_cyrillic_payee_siblings(seeded):
    """Regression: normalize() stripped Cyrillic text to an empty string,
    so two rows with the identical Cyrillic payee "Поддержка" weren't
    recognized as siblings — setting the category on one left the other
    uncategorized instead of applying to both."""
    c = seeded["client"]
    aed = seeded["aed"]

    imp = _upload_csv(c, aed["id"], CSV).json()
    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 1, "payee": 0, "amount": 3}, "options": {"dayfirst": True}},
    )
    imp = r.json()
    rows = imp["rows"]
    assert rows[0]["parsed_payee"] == "Поддержка"
    assert rows[1]["parsed_payee"] == "Поддержка"

    r = c.patch(
        f"/api/imports/{imp['id']}/rows/{rows[0]['id']}",
        json={"category_id": seeded["food"]["id"]},
    )
    updated_rows = r.json()["rows"]
    assert all(row["category_id"] == seeded["food"]["id"] for row in updated_rows)
