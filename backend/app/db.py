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

        budget_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(budgets)")]
        if "period" not in budget_cols:
            conn.exec_driver_sql("ALTER TABLE budgets ADD COLUMN period TEXT DEFAULT 'monthly'")

        tx_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(transactions)")]
        if "loan_id" not in tx_cols:
            conn.exec_driver_sql(
                "ALTER TABLE transactions ADD COLUMN loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL"
            )
        _migrate_transaction_loan_fk(conn)

        account_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(accounts)")]
        if "is_main" not in account_cols:
            conn.exec_driver_sql("ALTER TABLE accounts ADD COLUMN is_main BOOLEAN DEFAULT 0")
        if "exclude_from_net_worth" not in account_cols:
            conn.exec_driver_sql("ALTER TABLE accounts ADD COLUMN exclude_from_net_worth BOOLEAN DEFAULT 0")

        loan_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(loans)")]
        if "currency" not in loan_cols:
            conn.exec_driver_sql("ALTER TABLE loans ADD COLUMN currency VARCHAR(3) DEFAULT 'AED'")

        _migrate_budget_uniqueness(conn)


def _migrate_transaction_loan_fk(conn) -> None:
    """loan_id may have been added via a plain ALTER TABLE lacking an
    ON DELETE action before this was fixed — rebuild just that column so
    deleting a loan clears the link instead of failing the FK constraint."""
    fks = conn.exec_driver_sql("PRAGMA foreign_key_list(transactions)").fetchall()
    loan_fk = next((fk for fk in fks if fk[2] == "loans"), None)
    if loan_fk is None or (loan_fk[6] or "").upper() == "SET NULL":
        return

    conn.exec_driver_sql("ALTER TABLE transactions ADD COLUMN loan_id_tmp INTEGER")
    conn.exec_driver_sql("UPDATE transactions SET loan_id_tmp = loan_id")
    conn.exec_driver_sql("ALTER TABLE transactions DROP COLUMN loan_id")
    conn.exec_driver_sql(
        "ALTER TABLE transactions ADD COLUMN loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL"
    )
    conn.exec_driver_sql("UPDATE transactions SET loan_id = loan_id_tmp")
    conn.exec_driver_sql("ALTER TABLE transactions DROP COLUMN loan_id_tmp")


def _migrate_budget_uniqueness(conn) -> None:
    """Older DBs have a single-column UNIQUE(category_id) on budgets (one
    budget per category, any period). Rebuild the table with
    UNIQUE(category_id, period) instead so a category can carry both a
    monthly and a yearly budget."""
    indexes = conn.exec_driver_sql("PRAGMA index_list(budgets)").fetchall()
    has_single_col_unique = False
    has_composite_unique = False
    for idx in indexes:
        idx_name, is_unique = idx[1], idx[2]
        if not is_unique:
            continue
        cols = [r[2] for r in conn.exec_driver_sql(f"PRAGMA index_info({idx_name})").fetchall()]
        if cols == ["category_id"]:
            has_single_col_unique = True
        elif set(cols) == {"category_id", "period"}:
            has_composite_unique = True

    if not has_single_col_unique or has_composite_unique:
        return

    conn.exec_driver_sql("ALTER TABLE budgets RENAME TO budgets_old")
    conn.exec_driver_sql(
        """
        CREATE TABLE budgets (
            id INTEGER PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            amount FLOAT NOT NULL,
            period TEXT NOT NULL DEFAULT 'monthly',
            UNIQUE (category_id, period)
        )
        """
    )
    conn.exec_driver_sql(
        "INSERT INTO budgets (id, category_id, amount, period) "
        "SELECT id, category_id, amount, period FROM budgets_old"
    )
    conn.exec_driver_sql("DROP TABLE budgets_old")


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
