import app.routers.insights as insights_router


def _configure(client):
    client.put("/api/settings", json={"llm_provider": "anthropic", "llm_anthropic_api_key": "sk-test"})


def test_list_conversations_empty(seeded):
    c = seeded["client"]
    assert c.get("/api/insights/conversations").json() == []


def test_conversation_created_on_first_ask_and_listed(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c)
    monkeypatch.setattr(insights_router, "run_chat", lambda *a, **k: "40 AED")

    r = c.post("/api/insights/ask", json={"message": "how much on groceries this month?"})
    conversation_id = r.json()["conversation_id"]

    listing = c.get("/api/insights/conversations").json()
    assert len(listing) == 1
    assert listing[0]["id"] == conversation_id
    assert listing[0]["title"] == "how much on groceries this month?"


def test_get_conversation_detail_includes_messages(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c)
    monkeypatch.setattr(insights_router, "run_chat", lambda *a, **k: "40 AED")

    conversation_id = c.post("/api/insights/ask", json={"message": "how much?"}).json()["conversation_id"]
    detail = c.get(f"/api/insights/conversations/{conversation_id}").json()
    assert detail["messages"] == [
        {"role": "user", "content": "how much?"},
        {"role": "assistant", "content": "40 AED"},
    ]


def test_get_unknown_conversation_404s(seeded):
    c = seeded["client"]
    assert c.get("/api/insights/conversations/999").status_code == 404


def test_delete_conversation(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c)
    monkeypatch.setattr(insights_router, "run_chat", lambda *a, **k: "ok")

    conversation_id = c.post("/api/insights/ask", json={"message": "hi"}).json()["conversation_id"]
    r = c.delete(f"/api/insights/conversations/{conversation_id}")
    assert r.status_code == 200
    assert c.get(f"/api/insights/conversations/{conversation_id}").status_code == 404


def test_delete_unknown_conversation_404s(seeded):
    c = seeded["client"]
    assert c.delete("/api/insights/conversations/999").status_code == 404


def test_system_prompt_includes_memory(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c)
    c.put("/api/settings", json={"insights_memory": "- main account is AED Bank"})
    captured = {}

    def fake_run_chat(db, provider, api_key, model, system_prompt, messages, max_tokens=1024):
        captured["system_prompt"] = system_prompt
        return "ok"

    monkeypatch.setattr(insights_router, "run_chat", fake_run_chat)
    c.post("/api/insights/ask", json={"message": "hi"})
    assert "main account is AED Bank" in captured["system_prompt"]


def test_system_prompt_omits_memory_block_when_empty(seeded, monkeypatch):
    c = seeded["client"]
    _configure(c)
    captured = {}

    def fake_run_chat(db, provider, api_key, model, system_prompt, messages, max_tokens=1024):
        captured["system_prompt"] = system_prompt
        return "ok"

    monkeypatch.setattr(insights_router, "run_chat", fake_run_chat)
    c.post("/api/insights/ask", json={"message": "hi"})
    assert "Known preferences" not in captured["system_prompt"]
