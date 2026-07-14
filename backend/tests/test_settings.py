def test_settings_defaults(seeded):
    c = seeded["client"]
    d = c.get("/api/settings").json()
    assert d["budget_threshold"] == 80.0
    assert d["overall_monthly_cap"] is None


def test_settings_partial_update_round_trip(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"budget_threshold": 50.0})
    d = c.get("/api/settings").json()
    assert d["budget_threshold"] == 50.0
    assert d["overall_monthly_cap"] is None  # untouched by a partial update

    c.put("/api/settings", json={"overall_monthly_cap": 5000.0})
    d = c.get("/api/settings").json()
    assert d["budget_threshold"] == 50.0  # still unaffected
    assert d["overall_monthly_cap"] == 5000.0
