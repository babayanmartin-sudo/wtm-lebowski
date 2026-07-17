from app.db import SessionLocal
from app.services.settings import (
    LEGACY_LLM_API_KEY_KEY,
    LEGACY_LLM_MODEL_KEY,
    LLM_PROVIDER_KEY,
    get_llm_credentials,
    set_str_setting,
)


def test_legacy_single_slot_key_used_as_fallback_for_active_provider(seeded):
    """Pre-v1.13 installs stored one shared llm_api_key/llm_model keyed by
    whichever provider was active. Upgrading must not silently drop that
    already-configured key."""
    db = SessionLocal()
    try:
        set_str_setting(db, LLM_PROVIDER_KEY, "anthropic")
        set_str_setting(db, LEGACY_LLM_API_KEY_KEY, "sk-legacy")
        set_str_setting(db, LEGACY_LLM_MODEL_KEY, "claude-sonnet-5")
        db.commit()

        api_key, model = get_llm_credentials(db, "anthropic")
        assert api_key == "sk-legacy"
        assert model == "claude-sonnet-5"

        # legacy key was only ever for the provider that was active when saved
        other_key, other_model = get_llm_credentials(db, "openai")
        assert other_key == ""
        assert other_model == ""
    finally:
        db.close()


def test_new_per_provider_key_takes_priority_over_legacy(seeded):
    db = SessionLocal()
    try:
        set_str_setting(db, LLM_PROVIDER_KEY, "anthropic")
        set_str_setting(db, LEGACY_LLM_API_KEY_KEY, "sk-legacy")
        db.commit()

        c = seeded["client"]
        c.put("/api/settings", json={"llm_anthropic_api_key": "sk-new"})

        api_key, _ = get_llm_credentials(db, "anthropic")
        assert api_key == "sk-new"
    finally:
        db.close()
