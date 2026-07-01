from app.services.matcher import normalize


def test_normalize_strips_noise():
    assert normalize("CARREFOUR MALL BR 42 12/03/2026 ****1234") == "CARREFOUR MALL BR"


def test_normalize_collapses_punctuation():
    assert normalize("NOON.COM - ORDER #555") == "NOON COM ORDER"


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
