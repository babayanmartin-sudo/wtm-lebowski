"""Every endpoint exercised: happy path + designed error paths."""

import io
from datetime import date


# ---------- auth ----------
def test_auth_wrong_password(client):
    assert client.post("/api/auth/login", json={"password": "wrong-pass"}).status_code == 401


def test_auth_setup_twice_rejected(client):
    assert client.post("/api/auth/setup", json={"password": "another1"}).status_code == 400


def test_auth_login_and_logout(client):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"password": "test1234"})
    assert r.status_code == 200 and r.json()["authenticated"]
    assert client.get("/api/accounts").status_code == 200
    client.post("/api/auth/logout")
    client.cookies.clear()
    assert client.get("/api/accounts").status_code == 401


def test_auth_short_password_rejected(client):
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"password": "abc"}).status_code == 422


def test_change_password_wrong_current_rejected(client):
    r = client.post(
        "/api/auth/change-password", json={"current_password": "nope", "new_password": "newpass1"}
    )
    assert r.status_code == 401


def test_change_password_too_short_rejected(client):
    r = client.post(
        "/api/auth/change-password", json={"current_password": "test1234", "new_password": "abc"}
    )
    assert r.status_code == 422


def test_change_password_requires_auth(client):
    client.cookies.clear()
    r = client.post(
        "/api/auth/change-password", json={"current_password": "test1234", "new_password": "newpass1"}
    )
    assert r.status_code == 401


def test_change_password_success_then_old_password_fails(client):
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "test1234", "new_password": "newpass1"},
    )
    assert r.status_code == 200 and r.json()["authenticated"]

    client.cookies.clear()
    assert client.post("/api/auth/login", json={"password": "test1234"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "newpass1"}).status_code == 200


def test_old_session_invalidated_after_password_change(client):
    # Get initial session cookie
    r = client.post("/api/auth/login", json={"password": "test1234"})
    assert r.status_code == 200
    old_session_cookie = client.cookies.get("et_session")
    assert old_session_cookie is not None

    # Change password
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "test1234", "new_password": "newpass1"},
    )
    assert r.status_code == 200

    # Try to use old session cookie
    client.cookies.clear()
    client.cookies.set("et_session", old_session_cookie)
    assert client.get("/api/accounts").status_code == 401


# ---------- accounts ----------
def test_account_crud_and_guards(seeded):
    c = seeded["client"]
    # duplicate name
    assert c.post("/api/accounts", json={"name": "AED Bank"}).status_code == 409
    # update
    r = c.put(f"/api/accounts/{seeded['aed']['id']}", json={**seeded["aed"], "name": "Main"})
    assert r.status_code == 200 and r.json()["name"] == "Main"
    # delete empty account works
    tmp = c.post("/api/accounts", json={"name": "Temp"}).json()
    assert c.delete(f"/api/accounts/{tmp['id']}").status_code == 204
    # delete account with transactions blocked
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 5,
            "splits": [{"category_id": None, "amount": 5, "note": ""}],
        },
    )
    r = c.delete(f"/api/accounts/{seeded['aed']['id']}")
    assert r.status_code == 400 and "archive" in r.json()["detail"]
    # currency change with transactions blocked
    r = c.put(f"/api/accounts/{seeded['aed']['id']}", json={**seeded["aed"], "currency": "USD"})
    assert r.status_code == 400
    # 404s
    assert c.delete("/api/accounts/9999").status_code == 404
    assert c.put("/api/accounts/9999", json={"name": "x"}).status_code == 404


def test_only_one_account_can_be_main(seeded):
    c = seeded["client"]
    assert c.put(f"/api/accounts/{seeded['aed']['id']}", json={**seeded["aed"], "is_main": True}).json()[
        "is_main"
    ]
    assert c.put(f"/api/accounts/{seeded['usd']['id']}", json={**seeded["usd"], "is_main": True}).json()[
        "is_main"
    ]
    accounts = {a["id"]: a for a in c.get("/api/accounts").json()}
    assert accounts[seeded["aed"]["id"]]["is_main"] is False
    assert accounts[seeded["usd"]["id"]]["is_main"] is True


def test_new_account_marked_main_becomes_the_only_one(seeded):
    c = seeded["client"]
    c.put(f"/api/accounts/{seeded['aed']['id']}", json={**seeded["aed"], "is_main": True})
    created = c.post("/api/accounts", json={"name": "New Main", "is_main": True}).json()
    assert created["is_main"] is True
    accounts = {a["id"]: a for a in c.get("/api/accounts").json()}
    assert accounts[seeded["aed"]["id"]]["is_main"] is False


# ---------- categories ----------
def test_category_guards(seeded):
    c = seeded["client"]
    grocery_id = seeded["grocery"]["id"]
    # two-level nesting rejected
    r = c.post("/api/categories", json={"name": "Deep", "kind": "expense", "parent_id": grocery_id})
    assert r.status_code == 400
    # kind mismatch with parent rejected
    r = c.post(
        "/api/categories",
        json={"name": "Weird", "kind": "income", "parent_id": seeded["food"]["id"]},
    )
    assert r.status_code == 400
    # delete used category blocked
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 5,
            "splits": [{"category_id": grocery_id, "amount": 5, "note": ""}],
        },
    )
    assert c.delete(f"/api/categories/{grocery_id}").status_code == 400
    # parent with used child also blocked
    assert c.delete(f"/api/categories/{seeded['food']['id']}").status_code == 400
    # unused category deletes fine
    tmp = c.post("/api/categories", json={"name": "Tmp", "kind": "expense"}).json()
    assert c.delete(f"/api/categories/{tmp['id']}").status_code == 204
    # update
    r = c.put(f"/api/categories/{grocery_id}", json={**seeded["grocery"], "name": "Food shops"})
    assert r.json()["name"] == "Food shops"


# ---------- transactions ----------
def _tx(seeded, **kw):
    base = {
        "date": "2026-07-01",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 10,
        "payee": "SHOP",
        "splits": [{"category_id": seeded["food"]["id"], "amount": 10, "note": ""}],
    }
    base.update(kw)
    return base


def test_transaction_crud_filters_pagination(seeded):
    c = seeded["client"]
    for i in range(1, 6):
        c.post(
            "/api/transactions",
            json=_tx(seeded, date=f"2026-07-0{i}", amount=i * 10.0,
                     splits=[{"category_id": seeded["food"]["id"], "amount": i * 10.0, "note": ""}]),
        )
    c.post(
        "/api/transactions",
        json=_tx(
            seeded,
            kind="income",
            payee="BOSS",
            splits=[{"category_id": seeded["salary"]["id"], "amount": 10, "note": ""}],
        ),
    )
    # kind filter
    assert c.get("/api/transactions?kind=income").json()["total"] == 1
    # search
    assert c.get("/api/transactions?q=boss").json()["total"] == 1
    # date range
    assert c.get("/api/transactions?date_from=2026-07-03&date_to=2026-07-04").json()["total"] == 2
    # category filter incl. children rollup
    assert c.get(f"/api/transactions?category_id={seeded['food']['id']}").json()["total"] == 5
    # pagination
    page = c.get("/api/transactions?limit=2&offset=0").json()
    assert len(page["items"]) == 2 and page["total"] == 6
    # update: change amount + category
    tx = page["items"][0]
    r = c.put(
        f"/api/transactions/{tx['id']}",
        json=_tx(seeded, amount=99.0, splits=[{"category_id": None, "amount": 99.0, "note": ""}]),
    )
    assert r.status_code == 200 and r.json()["amount"] == 99.0
    # delete
    assert c.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert c.get("/api/transactions").json()["total"] == 5
    # invalid kind / bad account / negative amount
    assert c.post("/api/transactions", json=_tx(seeded, kind="magic")).status_code == 400
    assert c.post("/api/transactions", json=_tx(seeded, account_id=999)).status_code == 400
    assert c.post("/api/transactions", json=_tx(seeded, amount=-5)).status_code == 422
    # transfer to same account rejected
    r = c.post(
        "/api/transactions",
        json=_tx(seeded, kind="transfer", transfer_account_id=seeded["aed"]["id"], splits=[]),
    )
    assert r.status_code == 400


def test_uncategorized_filter(seeded):
    c = seeded["client"]
    categorized = c.post(
        "/api/transactions",
        json=_tx(seeded, splits=[{"category_id": seeded["food"]["id"], "amount": 10, "note": ""}]),
    ).json()
    uncategorized = c.post(
        "/api/transactions",
        json=_tx(seeded, splits=[{"category_id": None, "amount": 10, "note": ""}]),
    ).json()
    c.post(
        "/api/transactions",
        json=_tx(
            seeded,
            kind="transfer",
            transfer_account_id=seeded["usd"]["id"],
            transfer_amount=2.7,
            splits=[],
        ),
    )

    r = c.get("/api/transactions?uncategorized=true").json()
    ids = {t["id"] for t in r["items"]}
    assert ids == {uncategorized["id"]}
    assert categorized["id"] not in ids
    # a transfer has no category but shouldn't show up as "uncategorized" — it's a different concept
    assert r["total"] == 1


def test_transaction_same_currency_transfer_defaults_amount(seeded):
    c = seeded["client"]
    cash = c.post("/api/accounts", json={"name": "Cash2", "currency": "AED"}).json()
    r = c.post(
        "/api/transactions",
        json=_tx(seeded, kind="transfer", transfer_account_id=cash["id"], amount=50, splits=[]),
    )
    assert r.status_code == 201 and r.json()["transfer_amount"] == 50


# ---------- templates ----------
def test_template_full_lifecycle(seeded):
    c = seeded["client"]
    body = {
        "name": "Gym",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 200,
        "category_id": seeded["food"]["id"],
        "frequency": "monthly",
        "interval": 1,
        "next_due": "2026-06-01",
        "auto_post": True,
        "active": True,
    }
    t = c.post("/api/templates", json=body).json()
    # invalid frequency / kind / transfer without dest
    assert c.post("/api/templates", json={**body, "frequency": "hourly"}).status_code == 400
    assert c.post("/api/templates", json={**body, "kind": "magic"}).status_code == 400
    assert c.post("/api/templates", json={**body, "kind": "transfer"}).status_code == 400
    # materialize catches up 2 missed months (Jun 1, Jul 1; today 2026-07-02)
    posted = c.post("/api/templates/materialize").json()["posted"]
    assert posted == 2
    assert c.get("/api/transactions").json()["total"] == 2
    # update
    r = c.put(f"/api/templates/{t['id']}", json={**body, "name": "Gym+", "auto_post": False})
    assert r.json()["name"] == "Gym+"
    # skip advances without posting
    before = c.get(f"/api/templates").json()[0]["next_due"]
    after = c.post(f"/api/templates/{t['id']}/skip").json()["next_due"]
    assert after > before
    assert c.get("/api/transactions").json()["total"] == 2
    # delete keeps posted transactions (template_id nulled)
    assert c.delete(f"/api/templates/{t['id']}").status_code == 204
    assert c.get("/api/transactions").json()["total"] == 2


# ---------- budgets ----------
def test_budget_crud_guards(seeded):
    c = seeded["client"]
    b = c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 100}).json()
    # duplicate per category
    assert c.post("/api/budgets", json={"category_id": seeded["food"]["id"], "amount": 5}).status_code == 409
    # bad category
    assert c.post("/api/budgets", json={"category_id": 999, "amount": 5}).status_code == 400
    # update
    assert c.put(f"/api/budgets/{b['id']}", json={"category_id": seeded["food"]["id"], "amount": 250}).json()["amount"] == 250
    # status for empty month
    st = c.get("/api/budgets/status?month=2030-01").json()
    assert st[0]["spent"] == 0
    # delete
    assert c.delete(f"/api/budgets/{b['id']}").status_code == 204
    assert c.get("/api/budgets").json() == []


# ---------- goals ----------
def test_goal_full_lifecycle(seeded):
    c = seeded["client"]
    g = c.post(
        "/api/goals",
        json={"name": "Car", "target_amount": 50000, "target_date": "2027-01-01",
              "color": "#fff", "icon": "target", "archived": False},
    ).json()
    g = c.post(f"/api/goals/{g['id']}/contributions", json={"date": "2026-07-01", "amount": 1000, "note": ""}).json()
    g = c.post(f"/api/goals/{g['id']}/contributions", json={"date": "2026-07-02", "amount": -200, "note": "withdrew"}).json()
    assert g["saved"] == 800
    # delete one contribution
    g = c.delete(f"/api/goals/{g['id']}/contributions/{g['contributions'][1]['id']}").json()
    assert g["saved"] == 1000
    # wrong goal/contribution pair 404
    assert c.delete(f"/api/goals/{g['id']}/contributions/999").status_code == 404
    # update
    r = c.put(f"/api/goals/{g['id']}", json={"name": "Car fund", "target_amount": 60000,
                                             "target_date": None, "color": "#fff", "icon": "t", "archived": False})
    assert r.json()["name"] == "Car fund"
    # delete
    assert c.delete(f"/api/goals/{g['id']}").status_code == 204
    assert c.get("/api/goals").json() == []


# ---------- rules ----------
def test_rules_crud_and_search(seeded):
    c = seeded["client"]
    r = c.post("/api/rules", json={"pattern": "Uber *123 Trip", "match_kind": "contains",
                                   "category_id": seeded["food"]["id"]})
    assert r.status_code == 201
    rule = r.json()
    assert rule["pattern"] == "UBER *123 TRIP"  # digits now preserved
    # search
    assert len(c.get("/api/rules?q=uber").json()) == 1
    assert c.get("/api/rules?q=zzz").json() == []
    # invalid match kind / empty pattern / bad category
    assert c.post("/api/rules", json={"pattern": "X", "match_kind": "regex", "category_id": seeded["food"]["id"]}).status_code == 400
    assert c.post("/api/rules", json={"pattern": "   ", "match_kind": "exact", "category_id": seeded["food"]["id"]}).status_code == 400
    assert c.post("/api/rules", json={"pattern": "OK", "match_kind": "exact", "category_id": 999}).status_code == 400
    # update
    r = c.put(f"/api/rules/{rule['id']}", json={"pattern": "UBER", "match_kind": "contains",
                                                "category_id": seeded["grocery"]["id"], "priority": 5})
    assert r.json()["priority"] == 5
    # delete
    assert c.delete(f"/api/rules/{rule['id']}").status_code == 204


# ---------- rates ----------
def test_rates_endpoints(seeded):
    c = seeded["client"]
    assert c.get("/api/rates/base").json() == {"base": "AED"}
    assert isinstance(c.get("/api/rates").json(), list)  # may be empty offline


# ---------- imports ----------
def test_import_cancel_and_guards(seeded):
    c = seeded["client"]
    csv = "Date,Description,Amount\n01/07/2026,X,-1.00\n"
    r = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    )
    imp = r.json()
    # commit before mapping rejected
    assert c.post(f"/api/imports/{imp['id']}/commit").status_code == 400
    # mapping without date rejected
    assert c.post(f"/api/imports/{imp['id']}/mapping", json={"mapping": {"amount": 2}}).status_code == 400
    # remap after preview allowed (mapping edit)
    c.post(f"/api/imports/{imp['id']}/mapping", json={"mapping": {"date": 0, "payee": 1, "amount": 2}})
    r = c.post(f"/api/imports/{imp['id']}/mapping", json={"mapping": {"date": 0, "note": 1, "amount": 2}})
    assert r.status_code == 200 and r.json()["status"] == "preview"
    # cancel
    assert c.delete(f"/api/imports/{imp['id']}").status_code == 204
    assert c.get(f"/api/imports/{imp['id']}").status_code == 404
    # bad account
    r = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": "999"},
    )
    assert r.status_code == 400
    # empty file
    r = c.post(
        "/api/imports",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    )
    assert r.status_code == 400


def test_import_negate_and_row_patch(seeded):
    c = seeded["client"]
    csv = "Date,Description,Amount\n01/07/2026,POSITIVE EXPENSE,50.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("n.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {"negate": True}},
    ).json()
    row = imp["rows"][0]
    assert row["parsed_amount"] == -50.0  # negate flipped it to expense
    # row patch: skip toggle
    imp = c.patch(f"/api/imports/{imp['id']}/rows/{row['id']}", json={"skip": True}).json()
    assert imp["rows"][0]["skip"] is True
    imp = c.patch(f"/api/imports/{imp['id']}/rows/{row['id']}", json={"skip": False}).json()
    assert imp["rows"][0]["skip"] is False
    # commit only non-skipped
    c.post(f"/api/imports/{imp['id']}/commit")
    txs = c.get("/api/transactions").json()
    assert txs["total"] == 1 and txs["items"][0]["kind"] == "expense"


# ---------- dashboard ----------
def test_dashboard_summary_shape(seeded):
    c = seeded["client"]
    c.post("/api/transactions", json=_tx(seeded, date="2026-07-05"))
    d = c.get("/api/dashboard/summary?date_from=2026-07-01&date_to=2026-07-31").json()
    assert d["base_currency"] == "AED"
    assert d["expense"] == 10.0
    assert d["date_from"] == "2026-07-01"
    assert d["date_to"] == "2026-07-31"
    assert d["series_granularity"] == "day"
    assert len(d["series"]) == 31
    assert d["by_category"][0]["name"] == "Food"
    assert len(d["recent"]) == 1
    assert d["net_worth"] > 0


def test_dashboard_by_category_nets_expense_return_income(seeded):
    """An income transaction categorized under an expense category (e.g. a
    refund marked as an expense return during import) should reduce that
    category's spending total, not be ignored or double-counted."""
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json=_tx(seeded, date="2026-06-16", amount=99, kind="expense",
                 splits=[{"category_id": seeded["food"]["id"], "amount": 99, "note": ""}]),
    )
    c.post(
        "/api/transactions",
        json=_tx(seeded, date="2026-06-16", amount=89, kind="income",
                 splits=[{"category_id": seeded["food"]["id"], "amount": 89, "note": ""}]),
    )
    d = c.get("/api/dashboard/summary?date_from=2026-06-01&date_to=2026-06-30").json()
    food = next(row for row in d["by_category"] if row["name"] == "Food")
    assert food["amount"] == 10.0


def test_dashboard_by_category_income_breakdown(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json=_tx(seeded, date="2026-06-10", amount=1000, kind="income",
                 splits=[{"category_id": seeded["salary"]["id"], "amount": 1000, "note": ""}]),
    )
    d = c.get("/api/dashboard/summary?date_from=2026-06-01&date_to=2026-06-30").json()
    salary = next(row for row in d["by_category_income"] if row["name"] == "Salary")
    assert salary["amount"] == 1000.0
    # the expense breakdown is unaffected by income-category splits
    assert all(row["name"] != "Salary" for row in d["by_category"])


def test_dashboard_category_drilldown_works_for_income_category(seeded):
    """Regression: _by_category used to be hardcoded to expense splits, so
    drilling into an income category (category_id filter) silently returned
    an empty breakdown instead of that category's income."""
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json=_tx(seeded, date="2026-06-10", amount=1000, kind="income",
                 splits=[{"category_id": seeded["salary"]["id"], "amount": 1000, "note": ""}]),
    )
    d = c.get(
        f"/api/dashboard/summary?date_from=2026-06-01&date_to=2026-06-30&category_id={seeded['salary']['id']}"
    ).json()
    assert len(d["by_category"]) == 1
    assert d["by_category"][0]["amount"] == 1000.0


def test_dashboard_series_hides_future_months(seeded):
    c = seeded["client"]
    d = c.get("/api/dashboard/summary?date_from=2026-01-01&date_to=2026-12-31").json()
    assert d["series_granularity"] == "month"
    labels = [pt["label"] for pt in d["series"]]
    assert labels == sorted(labels)
    assert labels[-1] <= date.today().replace(day=1).isoformat()
    assert "2026-12-01" not in labels


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}
