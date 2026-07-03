import io


def test_rule_alias_crud(seeded):
    c = seeded["client"]
    r = c.post(
        "/api/rules",
        json={
            "pattern": "SPINNEYS DXB",
            "match_kind": "exact",
            "category_id": seeded["grocery"]["id"],
            "alias": "Spinneys Supermarket",
        },
    )
    assert r.status_code == 201
    rule = r.json()
    assert rule["alias"] == "Spinneys Supermarket"

    r = c.put(
        f"/api/rules/{rule['id']}",
        json={
            "pattern": "SPINNEYS DXB",
            "match_kind": "exact",
            "category_id": seeded["grocery"]["id"],
            "alias": "  Spinneys  ",
        },
    )
    assert r.json()["alias"] == "Spinneys"

    # alias is optional — defaults to empty string
    r2 = c.post(
        "/api/rules",
        json={"pattern": "OTHER SHOP", "match_kind": "exact", "category_id": seeded["food"]["id"]},
    )
    assert r2.json()["alias"] == ""


def test_exact_rule_alias_applied_to_import_payee(seeded):
    c = seeded["client"]
    c.post(
        "/api/rules",
        json={
            "pattern": "SPINNEYS DXB",
            "match_kind": "exact",
            "category_id": seeded["grocery"]["id"],
            "alias": "Spinneys Supermarket",
        },
    )
    csv = "Date,Description,Amount\n01/07/2026,SPINNEYS DXB 4412,-50.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    row = imp["rows"][0]
    assert row["parsed_payee"] == "Spinneys Supermarket"
    assert row["category_id"] == seeded["grocery"]["id"]

    c.post(f"/api/imports/{imp['id']}/commit")
    tx = c.get("/api/transactions").json()["items"][0]
    assert tx["payee"] == "Spinneys Supermarket"


def test_contains_rule_alias_applied(seeded):
    c = seeded["client"]
    c.post(
        "/api/rules",
        json={
            "pattern": "UBER",
            "match_kind": "contains",
            "category_id": seeded["food"]["id"],
            "alias": "Uber",
        },
    )
    csv = "Date,Description,Amount\nDate,Description,Amount\n01/07/2026,UBER TRIP 92AK3,-20.00\n"
    csv = "Date,Description,Amount\n01/07/2026,UBER TRIP 92AK3,-20.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    assert imp["rows"][0]["parsed_payee"] == "Uber"


def test_rule_without_alias_keeps_parsed_payee_unchanged(seeded):
    c = seeded["client"]
    c.post(
        "/api/rules",
        json={"pattern": "SPINNEYS DXB", "match_kind": "exact", "category_id": seeded["grocery"]["id"]},
    )
    csv = "Date,Description,Amount\n01/07/2026,SPINNEYS DXB 4412,-50.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    assert imp["rows"][0]["parsed_payee"] == "SPINNEYS DXB"


def test_fuzzy_match_never_applies_alias(seeded):
    """Fuzzy matches come from transaction history, not a specific rule —
    there is no alias to apply even if an unrelated exact rule has one."""
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-06-01",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 10,
            "payee": "SPINNEYS DXB BRANCH ONE",
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 10, "note": ""}],
        },
    )
    csv = "Date,Description,Amount\n01/07/2026,SPINNEYS DXB BRANCH TWO,-15.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    row = imp["rows"][0]
    assert row["suggestion_confidence"] == "fuzzy"
    assert row["parsed_payee"] == "SPINNEYS DXB BRANCH TWO"
