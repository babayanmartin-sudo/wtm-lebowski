def test_pattern_with_digits_preserved(seeded):
    """Patterns with digits should be stored as-is, not stripped (regression test)."""
    c = seeded["client"]
    # Pattern with only digits should be accepted
    r = c.post("/api/rules", json={
        "pattern": "AE810260001015834372201",
        "match_kind": "exact",
        "category_id": seeded["food"]["id"]
    })
    assert r.status_code == 201
    rule = r.json()
    assert rule["pattern"] == "AE810260001015834372201"

    # Pattern with digits + spaces
    r = c.post("/api/rules", json={
        "pattern": "784 1559766323",
        "match_kind": "contains",
        "category_id": seeded["food"]["id"]
    })
    assert r.status_code == 201
    rule = r.json()
    assert rule["pattern"] == "784 1559766323"
