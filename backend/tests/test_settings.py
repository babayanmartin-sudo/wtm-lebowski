def test_settings_defaults(seeded):
    c = seeded["client"]
    d = c.get("/api/settings").json()
    assert d["budget_threshold"] == 80.0
    assert d["overall_monthly_cap"] is None
    assert d["mashreq_sync_enabled"] is False
    assert d["amazon_sync_enabled"] is False


def test_sync_enabled_flags_round_trip_independently(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"mashreq_sync_enabled": True})
    d = c.get("/api/settings").json()
    assert d["mashreq_sync_enabled"] is True
    assert d["amazon_sync_enabled"] is False  # untouched

    c.put("/api/settings", json={"amazon_sync_enabled": True})
    d = c.get("/api/settings").json()
    assert d["mashreq_sync_enabled"] is True  # still unaffected
    assert d["amazon_sync_enabled"] is True

    c.put("/api/settings", json={"mashreq_sync_enabled": False})
    d = c.get("/api/settings").json()
    assert d["mashreq_sync_enabled"] is False
    assert d["amazon_sync_enabled"] is True


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
