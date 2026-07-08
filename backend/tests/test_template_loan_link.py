def _template(seeded, **kw):
    body = {
        "name": "Loan payment",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 100,
        "category_id": seeded["food"]["id"],
        "frequency": "monthly",
        "interval": 1,
        "next_due": "2026-06-01",
        "end_date": None,
        "auto_post": False,
        "active": True,
    }
    body.update(kw)
    return body


def _debt_loan(c, **kw):
    body = {"name": "Mortgage", "direction": "debt", "principal_amount": 500000}
    body.update(kw)
    return c.post("/api/loans", json=body).json()


def _receivable_loan(c, **kw):
    body = {"name": "Ivan owes me", "direction": "receivable", "principal_amount": 2000}
    body.update(kw)
    return c.post("/api/loans", json=body).json()


def test_create_template_linked_to_loan(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    t = c.post("/api/templates", json=_template(seeded, loan_id=loan["id"])).json()
    assert t["loan_id"] == loan["id"]


def test_template_loan_kind_mismatch_rejected(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)  # expects expense
    r = c.post("/api/templates", json=_template(seeded, kind="income", loan_id=loan["id"]))
    assert r.status_code == 400


def test_template_transfer_with_loan_rejected(seeded):
    c = seeded["client"]
    loan = _debt_loan(c)
    body = _template(
        seeded,
        kind="transfer",
        loan_id=loan["id"],
        transfer_account_id=seeded["usd"]["id"],
        category_id=None,
    )
    r = c.post("/api/templates", json=body)
    assert r.status_code == 400


def test_posting_linked_template_reduces_loan(seeded):
    c = seeded["client"]
    loan = _debt_loan(c, principal_amount=1000)
    t = c.post("/api/templates", json=_template(seeded, amount=300, loan_id=loan["id"])).json()
    c.post(f"/api/templates/{t['id']}/post")
    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 300.0
    assert updated["remaining"] == 700.0


def test_posting_receivable_linked_template_reduces_loan(seeded):
    c = seeded["client"]
    loan = _receivable_loan(c, principal_amount=1000)
    t = c.post(
        "/api/templates", json=_template(seeded, kind="income", amount=250, loan_id=loan["id"])
    ).json()
    c.post(f"/api/templates/{t['id']}/post")
    updated = c.get("/api/loans").json()[0]
    assert updated["paid"] == 250.0
    assert updated["remaining"] == 750.0
