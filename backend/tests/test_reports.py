def test_preview_totals_match_included_and_excluded_categories(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 15.0,
            "splits": [{"category_id": None, "amount": 15.0, "note": ""}],
        },
    )

    body = {
        "date_from": "2026-07-01",
        "date_to": "2026-07-31",
        "include_category_ids": [seeded["grocery"]["id"]],
    }
    d = c.post("/api/reports/preview", json=body).json()
    assert d["expense"] == 40.0
    assert d["count"] == 1
    assert d["average"] == 40.0

    excl = c.post(
        "/api/reports/preview",
        json={"date_from": "2026-07-01", "date_to": "2026-07-31", "exclude_category_ids": [seeded["grocery"]["id"]]},
    ).json()
    assert excl["expense"] == 15.0


def test_preview_includes_recent_transactions_respecting_filters(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "payee": "Carrefour",
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-06",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 15.0,
            "splits": [{"category_id": None, "amount": 15.0, "note": ""}],
        },
    )

    d = c.post(
        "/api/reports/preview",
        json={"date_from": "2026-07-01", "date_to": "2026-07-31"},
    ).json()
    assert len(d["recent"]) == 2

    filtered = c.post(
        "/api/reports/preview",
        json={
            "date_from": "2026-07-01",
            "date_to": "2026-07-31",
            "include_category_ids": [seeded["grocery"]["id"]],
        },
    ).json()
    assert len(filtered["recent"]) == 1
    assert filtered["recent"][0]["payee"] == "Carrefour"


def test_save_list_load_delete_round_trip(seeded):
    c = seeded["client"]
    filters = {"date_from": "2026-07-01", "date_to": "2026-07-31", "include_category_ids": [seeded["food"]["id"]]}
    r = c.post("/api/reports", json={"name": "July Food", "description": "test", "filters": filters})
    assert r.status_code == 200
    report_id = r.json()["id"]

    listing = c.get("/api/reports").json()
    assert any(rep["id"] == report_id and rep["name"] == "July Food" for rep in listing)
    assert "filters" not in listing[0]

    detail = c.get(f"/api/reports/{report_id}").json()
    assert detail["filters"] == filters

    c.delete(f"/api/reports/{report_id}")
    assert c.get(f"/api/reports/{report_id}").status_code == 404


def test_export_csv_returns_rows(seeded):
    c = seeded["client"]
    c.post(
        "/api/transactions",
        json={
            "date": "2026-07-05",
            "kind": "expense",
            "account_id": seeded["aed"]["id"],
            "amount": 40.0,
            "payee": "Carrefour",
            "splits": [{"category_id": seeded["grocery"]["id"], "amount": 40.0, "note": ""}],
        },
    )
    filters = {"date_from": "2026-07-01", "date_to": "2026-07-31"}
    report_id = c.post("/api/reports", json={"name": "July", "filters": filters}).json()["id"]

    r = c.get(f"/api/reports/{report_id}/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "date,payee,category,amount"
    assert any("Carrefour" in line for line in lines[1:])
