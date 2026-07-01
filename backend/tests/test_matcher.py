from app.services.matcher import normalize


def test_normalize_strips_noise():
    assert normalize("CARREFOUR MALL BR 42 12/03/2026 ****1234") == "CARREFOUR MALL BR"


def test_normalize_collapses_punctuation():
    assert normalize("NOON.COM - ORDER #555") == "NOON COM ORDER"


def test_learn_same_payee_twice_in_one_commit_no_duplicate_rule(seeded):
    """Two rows with the same merchant categorized in one import commit
    must produce a single rule, not one per row."""
    import io

    c = seeded["client"]
    csv = (
        "Date,Description,Amount\n"
        "01/07/2026,ZOMATO ORDER 1,-10.00\n"
        "02/07/2026,ZOMATO ORDER 2,-20.00\n"
    )
    r = c.post(
        "/api/imports",
        files={"file": ("z.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    )
    imp = c.post(
        f"/api/imports/{r.json()['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    for row in imp["rows"]:
        c.patch(
            f"/api/imports/{imp['id']}/rows/{row['id']}",
            json={"category_id": seeded["food"]["id"]},
        )
    c.post(f"/api/imports/{imp['id']}/commit")
    rules = [x for x in c.get("/api/rules").json() if x["pattern"] == "ZOMATO ORDER"]
    assert len(rules) == 1


def test_duplicate_manual_rule_rejected(seeded):
    c = seeded["client"]
    body = {"pattern": "STARBUCKS", "match_kind": "contains", "category_id": seeded["food"]["id"]}
    assert c.post("/api/rules", json=body).status_code == 201
    assert c.post("/api/rules", json=body).status_code == 409


def test_matcher_precedence(seeded):
    c = seeded["client"]
    food, grocery = seeded["food"], seeded["grocery"]

    c.post("/api/rules", json={"pattern": "CARREFOUR", "match_kind": "contains", "category_id": food["id"]})
    c.post(
        "/api/rules",
        json={"pattern": "CARREFOUR CITY CENTRE", "match_kind": "exact", "category_id": grocery["id"]},
    )

    # exact beats contains
    csv = "Date,Description,Amount\n01/07/2026,CARREFOUR CITY CENTRE 99,-10.00\n02/07/2026,CARREFOUR MARINA,-20.00\n"
    import io

    r = c.post(
        "/api/imports",
        files={"file": ("s.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    )
    imp = r.json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    rows = imp["rows"]
    assert rows[0]["suggested_category_id"] == grocery["id"]
    assert rows[0]["suggestion_confidence"] == "exact"
    assert rows[1]["suggested_category_id"] == food["id"]
    assert rows[1]["suggestion_confidence"] == "rule"
