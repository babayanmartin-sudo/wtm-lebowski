from app.db import SessionLocal
from app.services import insights_tools
from app.services.settings import INSIGHTS_MEMORY_KEY, INSIGHTS_MEMORY_MAX_CHARS, get_str_setting


def test_remember_appends_note(seeded):
    db = SessionLocal()
    try:
        r = insights_tools.remember(db, note="main account is AED Bank")
        assert r["ok"] is True
        stored = get_str_setting(db, INSIGHTS_MEMORY_KEY, "")
        assert "main account is AED Bank" in stored
    finally:
        db.close()


def test_remember_appends_multiple_notes(seeded):
    db = SessionLocal()
    try:
        insights_tools.remember(db, note="first fact")
        insights_tools.remember(db, note="second fact")
        stored = get_str_setting(db, INSIGHTS_MEMORY_KEY, "")
        assert "first fact" in stored
        assert "second fact" in stored
    finally:
        db.close()


def test_remember_ignores_empty_note(seeded):
    db = SessionLocal()
    try:
        r = insights_tools.remember(db, note="   ")
        assert r["ok"] is False
    finally:
        db.close()


def test_remember_caps_total_length(seeded):
    db = SessionLocal()
    try:
        for i in range(200):
            insights_tools.remember(db, note=f"fact number {i} is a reasonably long sentence to fill space")
        stored = get_str_setting(db, INSIGHTS_MEMORY_KEY, "")
        assert len(stored) <= INSIGHTS_MEMORY_MAX_CHARS
        # most recent fact must survive the trim, oldest ones may not
        assert "fact number 199" in stored
        assert "fact number 0 " not in stored
    finally:
        db.close()
