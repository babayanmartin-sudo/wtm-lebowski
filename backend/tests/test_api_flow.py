import io

from openpyxl import Workbook


def test_auth_required_after_setup(client):
    fresh = client
    fresh.cookies.clear()
    assert fresh.get("/api/accounts").status_code == 401


def test_transfer_cross_currency_balances(seeded):
    c = seeded["client"]
    aed, usd = seeded["aed"], seeded["usd"]
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": aed["id"],
            "amount": 367.0,
            "transfer_account_id": usd["id"],
            "transfer_amount": 100.0,
        },
    )
    assert r.status_code == 201, r.text
    accounts = {a["name"]: a for a in c.get("/api/accounts").json()}
    assert accounts["AED Bank"]["balance"] == 633.0
    assert accounts["USD Card"]["balance"] == 200.0


def test_transfer_cross_currency_requires_dest_amount(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "transfer",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "transfer_account_id": seeded["usd"]["id"],
        },
    )
    assert r.status_code == 400


def test_split_sum_validated(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "splits": [
                {"category_id": seeded["food"]["id"], "amount": 60.0, "note": ""},
                {"category_id": None, "amount": 30.0, "note": ""},
            ],
        },
    )
    assert r.status_code == 400
    r = c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 100.0,
            "payee": "LULU HYPERMARKET",
            "splits": [
                {"category_id": seeded["food"]["id"], "amount": 60.0, "note": ""},
                {"category_id": None, "amount": 40.0, "note": ""},
            ],
        },
    )
    assert r.status_code == 201
    assert len(r.json()["splits"]) == 2


def test_budget_rollup_child_into_parent(seeded):
    c = seeded["client"]
    c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 500.0})
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 120.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 120.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 80.0,
            "splits": [{"category_id": seeded["food"]["id"], "amount": 80.0, "note": ""}],
        },
    )
    status = c.get("/api/budgets/status?month=2026-07").json()
    assert len(status) == 1
    assert status[0]["spent"] == 200.0


def test_recurring_template_post_and_advance(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/templates",
        json={
            "name": "Rent",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 3000.0,
            "category_id": seeded["food"]["id"],
            "frequency": "monthly",
            "interval": 1,
            "next_due": "2026-07-01",
            "auto_post": False,
        },
    )
    assert r.status_code == 201
    template_id = r.json()["id"]
    assert len(c.get("/api/templates/pending").json()) == 1
    r = c.post(f"/api/templates/{template_id}/post")
    assert r.json()["next_due"] == "2026-08-01"
    txs = c.get("/api/transactions").json()
    assert txs["total"] == 1
    assert txs["items"][0]["amount"] == 3000.0


def _upload_csv(c, account_id, text, name="statement.csv"):
    return c.post(
        "/api/imports",
        files={"file": (name, io.BytesIO(text.encode()), "text/csv")},
        data={"account_id": str(account_id)},
    )


CSV = """Account statement,,,
Period 2026,,,
Date,Description,Debit,Credit
01/07/2026,CARREFOUR MALL BR 42,120.50,
02/07/2026,SALARY JULY,,15000.00
03/07/2026,CARREFOUR MALL BR 42,80.00,
"""


def test_import_full_flow_with_learning_and_dedupe(seeded):
    c = seeded["client"]
    aed = seeded["aed"]

    r = _upload_csv(c, aed["id"], CSV)
    assert r.status_code == 201, r.text
    imp = r.json()
    assert imp["status"] == "mapping"
    assert imp["headers"] == ["Date", "Description", "Debit", "Credit"]
    # guessed mapping should find debit/credit
    assert imp["mapping"]["debit"] == 2

    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={
            "mapping": {"date": 0, "payee": 1, "debit": 2, "credit": 3},
            "options": {"dayfirst": True},
            "preset_name": "TestBank",
        },
    )
    imp = r.json()
    assert imp["status"] == "preview"
    rows = imp["rows"]
    assert rows[0]["parsed_amount"] == -120.5
    assert rows[1]["parsed_amount"] == 15000.0

    # categorize first CARREFOUR row -> rule learned at commit
    c.patch(
        f"/api/imports/{imp['id']}/rows/{rows[0]['id']}",
        json={"category_id": seeded["grocery"]["id"]},
    )
    r = c.post(f"/api/imports/{imp['id']}/commit")
    assert r.status_code == 200
    assert c.get("/api/transactions").json()["total"] == 3

    rules = c.get("/api/rules").json()
    assert any(r_["pattern"] == "CARREFOUR MALL BR" for r_ in rules)

    # re-upload same file: preset auto-applies, all rows duplicates
    r = _upload_csv(c, aed["id"], CSV)
    imp2 = r.json()
    assert imp2["status"] == "preview"  # preset matched, no wizard
    assert all(row["is_duplicate"] for row in imp2["rows"])

    # new statement with same merchant gets auto-suggested category
    csv3 = "Date,Description,Debit,Credit\n05/07/2026,CARREFOUR MALL BR 99,55.00,\n"
    imp3 = _upload_csv(c, aed["id"], csv3, name="new.csv").json()
    row = imp3["rows"][0]
    assert row["suggested_category_id"] == seeded["grocery"]["id"]
    assert row["suggestion_confidence"] == "exact"


def test_import_xlsx(seeded):
    c = seeded["client"]
    wb = Workbook()
    ws = wb.active
    ws.append(["Date", "Description", "Amount"])
    ws.append(["2026-07-01", "NOON.COM ORDER 555", -75.25])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    r = c.post(
        "/api/imports",
        files={"file": ("st.xlsx", buf, "application/vnd.ms-excel")},
        data={"account_id": str(seeded["aed"]["id"])},
    )
    assert r.status_code == 201, r.text
    imp = r.json()
    r = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    )
    row = r.json()["rows"][0]
    assert row["parsed_amount"] == -75.25
    assert row["parsed_payee"] == "NOON.COM ORDER 555"
