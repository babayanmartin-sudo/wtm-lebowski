import app.routers.insights as insights_router


def test_ask_requires_configuration(seeded):
    c = seeded["client"]
    r = c.post("/api/insights/ask", json={"message": "how much did I spend?"})
    assert r.status_code == 400


def test_ask_returns_reply_when_configured(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "anthropic", "llm_api_key": "sk-test"})
    monkeypatch.setattr(insights_router, "run_chat", lambda *a, **k: "You spent 40 AED on groceries.")

    r = c.post("/api/insights/ask", json={"message": "how much on groceries?"})
    assert r.status_code == 200
    assert r.json()["reply"] == "You spent 40 AED on groceries."


def test_ask_passes_history_through(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "openai", "llm_api_key": "sk-test"})
    captured = {}

    def fake_run_chat(db, provider, api_key, model, system_prompt, messages):
        captured["messages"] = messages
        captured["provider"] = provider
        return "ok"

    monkeypatch.setattr(insights_router, "run_chat", fake_run_chat)
    c.post(
        "/api/insights/ask",
        json={
            "message": "and last month?",
            "history": [{"role": "user", "content": "how much this month?"}, {"role": "assistant", "content": "40 AED"}],
        },
    )
    assert captured["provider"] == "openai"
    assert captured["messages"][0] == {"role": "user", "content": "how much this month?"}
    assert captured["messages"][-1] == {"role": "user", "content": "and last month?"}


def test_ask_maps_provider_error_to_502(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "anthropic", "llm_api_key": "sk-bad"})

    def raise_error(*a, **k):
        raise insights_router.InsightsError("invalid api key")

    monkeypatch.setattr(insights_router, "run_chat", raise_error)
    r = c.post("/api/insights/ask", json={"message": "hi"})
    assert r.status_code == 502
