import csv
import io


def _tx(seeded, **kw):
    amount = kw.get("amount", 10)
    base = {
        "date": "2026-07-01",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": amount,
        "payee": "SHOP",
        "splits": [{"category_id": seeded["food"]["id"], "amount": amount, "note": ""}],
    }
    base.update(kw)
    return base


def test_export_csv_includes_all_matching_rows_unpaged(seeded):
    c = seeded["client"]
    for i in range(1, 6):
        resp = c.post("/api/transactions", json=_tx(seeded, payee=f"SHOP{i}", amount=float(i)))
        assert resp.status_code == 201, resp.text

    r = c.get("/api/transactions/export.csv?limit=2")  # limit ignored by export
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert rows[0] == ["date", "kind", "account", "payee", "note", "category", "amount", "currency"]
    assert len(rows) - 1 == 5


def test_export_csv_respects_filters(seeded):
    c = seeded["client"]
    c.post("/api/transactions", json=_tx(seeded, payee="FOODMART", amount=20))
    c.post(
        "/api/transactions",
        json=_tx(
            seeded,
            kind="income",
            payee="EMPLOYER",
            amount=500,
            splits=[{"category_id": seeded["salary"]["id"], "amount": 500, "note": ""}],
        ),
    )

    r = c.get("/api/transactions/export.csv?kind=income")
    rows = list(csv.reader(io.StringIO(r.text)))
    assert len(rows) - 1 == 1
    assert rows[1][1] == "income"
    assert rows[1][3] == "EMPLOYER"


def test_export_csv_category_and_transfer_labels(seeded):
    c = seeded["client"]
    c.post("/api/transactions", json=_tx(seeded, payee="FOODMART"))
    resp = c.post(
        "/api/transactions",
        json=_tx(
            seeded,
            kind="transfer",
            transfer_account_id=seeded["usd"]["id"],
            transfer_amount=2.5,
            splits=[],
            payee="",
        ),
    )
    assert resp.status_code == 201, resp.text

    r = c.get("/api/transactions/export.csv")
    rows = list(csv.reader(io.StringIO(r.text)))[1:]
    by_kind = {row[1]: row for row in rows}
    assert by_kind["expense"][5] == "Food"
    assert by_kind["transfer"][5].startswith("Transfer to")


def test_export_csv_has_utf8_bom_for_cyrillic(seeded):
    c = seeded["client"]
    cat = c.post("/api/categories", json={"name": "Поддержка", "kind": "expense"}).json()
    c.post(
        "/api/transactions",
        json=_tx(seeded, payee="Тест", splits=[{"category_id": cat["id"], "amount": 10, "note": ""}]),
    )
    r = c.get("/api/transactions/export.csv")
    assert r.content[:3] == b"\xef\xbb\xbf"
    text = r.content.decode("utf-8-sig")
    assert "Тест" in text
    assert "Поддержка" in text
