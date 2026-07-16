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
    body = r.json()
    assert body["reply"] == "You spent 40 AED on groceries."
    assert body["conversation_id"] is not None


def test_ask_persists_and_replays_history(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "openai", "llm_api_key": "sk-test"})
    captured = {"call_count": 0}

    def fake_run_chat(db, provider, api_key, model, system_prompt, messages):
        captured["call_count"] += 1
        captured["messages"] = messages
        captured["provider"] = provider
        return "40 AED" if captured["call_count"] == 1 else "ok"

    monkeypatch.setattr(insights_router, "run_chat", fake_run_chat)
    first = c.post("/api/insights/ask", json={"message": "how much this month?"}).json()
    conversation_id = first["conversation_id"]

    c.post(
        "/api/insights/ask",
        json={"message": "and last month?", "conversation_id": conversation_id},
    )
    assert captured["provider"] == "openai"
    assert captured["messages"][0] == {"role": "user", "content": "how much this month?"}
    assert captured["messages"][1] == {"role": "assistant", "content": "40 AED"}
    assert captured["messages"][-1] == {"role": "user", "content": "and last month?"}


def test_ask_with_unknown_conversation_id_404s(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "anthropic", "llm_api_key": "sk-test"})
    monkeypatch.setattr(insights_router, "run_chat", lambda *a, **k: "ok")
    r = c.post("/api/insights/ask", json={"message": "hi", "conversation_id": 999})
    assert r.status_code == 404


def test_ask_maps_provider_error_to_502(seeded, monkeypatch):
    c = seeded["client"]
    c.put("/api/settings", json={"llm_provider": "anthropic", "llm_api_key": "sk-bad"})

    def raise_error(*a, **k):
        raise insights_router.InsightsError("invalid api key")

    monkeypatch.setattr(insights_router, "run_chat", raise_error)
    r = c.post("/api/insights/ask", json={"message": "hi"})
    assert r.status_code == 502
