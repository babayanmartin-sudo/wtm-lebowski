from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401  ensure models are registered

    Base.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    """create_all() only adds new tables, never new columns on existing
    ones — patch older sqlite files in place."""
    with engine.begin() as conn:
        cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(import_rows)")]
        if "ignored" not in cols:
            conn.exec_driver_sql("ALTER TABLE import_rows ADD COLUMN ignored BOOLEAN DEFAULT 0")

        rule_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(mapping_rules)")]
        if "alias" not in rule_cols:
            conn.exec_driver_sql("ALTER TABLE mapping_rules ADD COLUMN alias TEXT DEFAULT ''")

        template_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(templates)")]
        if "end_date" not in template_cols:
            conn.exec_driver_sql("ALTER TABLE templates ADD COLUMN end_date DATE")


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
