def test_settings_defaults(seeded):
    c = seeded["client"]
    d = c.get("/api/settings").json()
    assert d["budget_threshold"] == 80.0
    assert d["overall_monthly_cap"] is None
    assert d["mashreq_sync_enabled"] is False
    assert d["amazon_sync_enabled"] is False
    assert d["llm_provider"] == ""
    assert d["llm_anthropic_api_key"] == ""
    assert d["llm_anthropic_api_key_set"] is False
    assert d["llm_anthropic_model"] == ""
    assert d["llm_openai_api_key"] == ""
    assert d["llm_openai_api_key_set"] is False
    assert d["llm_openai_model"] == ""
    assert d["llm_max_tokens"] == 1024
    assert d["insights_memory"] == ""


def test_insights_memory_round_trip_and_clear(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"insights_memory": "- main account is AED Bank"})
    d = c.get("/api/settings").json()
    assert d["insights_memory"] == "- main account is AED Bank"

    c.put("/api/settings", json={"insights_memory": ""})
    d = c.get("/api/settings").json()
    assert d["insights_memory"] == ""


def test_mashreq_password_never_returned_plaintext(seeded):
    c = seeded["client"]
    d = c.get("/api/settings").json()
    assert d["mashreq_imap_password"] == ""
    assert d["mashreq_imap_password_set"] is False

    c.put("/api/settings", json={"mashreq_imap_password": "super-secret"})
    d = c.get("/api/settings").json()
    assert d["mashreq_imap_password"] == ""
    assert d["mashreq_imap_password_set"] is True

    c.put("/api/settings", json={"mashreq_imap_password": ""})
    d = c.get("/api/settings").json()
    assert d["mashreq_imap_password_set"] is False


def test_llm_settings_round_trip(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "anthropic", "llm_anthropic_api_key": "sk-xyz"})
    d = c.get("/api/settings").json()
    assert d["llm_provider"] == "anthropic"
    assert d["llm_anthropic_api_key"] == ""  # never round-tripped
    assert d["llm_anthropic_api_key_set"] is True
    assert d["llm_anthropic_model"] == ""

    c.put("/api/settings", json={"llm_anthropic_model": "claude-sonnet-5"})
    d = c.get("/api/settings").json()
    assert d["llm_provider"] == "anthropic"  # unaffected
    assert d["llm_anthropic_model"] == "claude-sonnet-5"


def test_llm_settings_store_both_providers_independently(seeded):
    c = seeded["client"]
    c.put(
        "/api/settings",
        json={
            "llm_anthropic_api_key": "sk-ant",
            "llm_anthropic_model": "claude-sonnet-5",
            "llm_openai_api_key": "sk-oai",
            "llm_openai_model": "gpt-5",
        },
    )
    d = c.get("/api/settings").json()
    assert d["llm_anthropic_api_key_set"] is True
    assert d["llm_anthropic_model"] == "claude-sonnet-5"
    assert d["llm_openai_api_key_set"] is True
    assert d["llm_openai_model"] == "gpt-5"

    # switching the active provider toggle doesn't drop either stored key
    c.put("/api/settings", json={"llm_provider": "openai"})
    d = c.get("/api/settings").json()
    assert d["llm_provider"] == "openai"
    assert d["llm_anthropic_api_key_set"] is True
    assert d["llm_openai_api_key_set"] is True


def test_llm_max_tokens_round_trip_and_min(seeded):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_max_tokens": 4096})
    assert c.get("/api/settings").json()["llm_max_tokens"] == 4096

    c.put("/api/settings", json={"llm_max_tokens": 0})  # "off"
    assert c.get("/api/settings").json()["llm_max_tokens"] == 0

    r = c.put("/api/settings", json={"llm_max_tokens": -1})
    assert r.status_code == 422


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
