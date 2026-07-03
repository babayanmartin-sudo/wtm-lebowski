import sqlite3

from app.db import _migrate, engine


def test_migrate_adds_missing_ignored_column():
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE import_rows DROP COLUMN ignored")
    cols_before = [
        row[1]
        for row in sqlite3.connect(engine.url.database).execute("PRAGMA table_info(import_rows)")
    ]
    assert "ignored" not in cols_before

    _migrate()

    cols_after = [
        row[1]
        for row in sqlite3.connect(engine.url.database).execute("PRAGMA table_info(import_rows)")
    ]
    assert "ignored" in cols_after


def test_migrate_idempotent_when_column_already_present():
    _migrate()
    _migrate()  # must not raise on second call
