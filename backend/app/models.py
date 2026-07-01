from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    type: Mapped[str] = mapped_column(String, default="bank")  # cash|bank|card|savings
    currency: Mapped[str] = mapped_column(String(3), default="AED")
    initial_balance: Mapped[float] = mapped_column(Float, default=0.0)
    color: Mapped[str] = mapped_column(String, default="#6366f1")
    icon: Mapped[str] = mapped_column(String, default="wallet")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("name", "parent_id", name="uq_category_name_parent"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String, default="expense")  # expense|income
    color: Mapped[str] = mapped_column(String, default="#22d3ee")
    icon: Mapped[str] = mapped_column(String, default="tag")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    parent: Mapped["Category | None"] = relationship(remote_side=[id], backref="children")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String, index=True)  # expense|income|transfer
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)  # always positive, in account currency
    currency: Mapped[str] = mapped_column(String(3))
    amount_base: Mapped[float] = mapped_column(Float)  # in base currency (AED)
    # transfers only:
    transfer_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    transfer_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # in destination currency
    payee: Mapped[str] = mapped_column(String, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    template_id: Mapped[int | None] = mapped_column(ForeignKey("templates.id", ondelete="SET NULL"), nullable=True)
    import_id: Mapped[int | None] = mapped_column(ForeignKey("imports.id", ondelete="SET NULL"), nullable=True)
    dedupe_hash: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    transfer_account: Mapped["Account | None"] = relationship(foreign_keys=[transfer_account_id])
    splits: Mapped[list["Split"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="Split.id"
    )


class Split(Base):
    __tablename__ = "splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    amount: Mapped[float] = mapped_column(Float)  # in transaction currency
    amount_base: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String, default="")

    transaction: Mapped[Transaction] = relationship(back_populates="splits")
    category: Mapped["Category | None"] = relationship()


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # expense|income|transfer
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    amount: Mapped[float] = mapped_column(Float)
    transfer_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    transfer_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    payee: Mapped[str] = mapped_column(String, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    frequency: Mapped[str] = mapped_column(String, default="monthly")  # daily|weekly|monthly|yearly
    interval: Mapped[int] = mapped_column(Integer, default=1)
    next_due: Mapped[date] = mapped_column(Date)
    auto_post: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    transfer_account: Mapped["Account | None"] = relationship(foreign_keys=[transfer_account_id])
    category: Mapped["Category | None"] = relationship()


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), unique=True)
    amount: Mapped[float] = mapped_column(Float)  # monthly limit in base currency

    category: Mapped[Category] = relationship()


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    target_amount: Mapped[float] = mapped_column(Float)  # base currency
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    color: Mapped[str] = mapped_column(String, default="#a78bfa")
    icon: Mapped[str] = mapped_column(String, default="target")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    contributions: Mapped[list["GoalContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="GoalContribution.date"
    )


class GoalContribution(Base):
    __tablename__ = "goal_contributions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)  # base currency, may be negative (withdrawal)
    note: Mapped[str] = mapped_column(String, default="")

    goal: Mapped[Goal] = relationship(back_populates="contributions")


class MappingRule(Base):
    __tablename__ = "mapping_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pattern: Mapped[str] = mapped_column(String, index=True)  # normalized merchant text
    match_kind: Mapped[str] = mapped_column(String, default="exact")  # exact|contains
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    priority: Mapped[int] = mapped_column(Integer, default=0)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    category: Mapped[Category] = relationship()


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("date", "currency", name="uq_rate_date_currency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    currency: Mapped[str] = mapped_column(String(3))
    rate_to_base: Mapped[float] = mapped_column(Float)  # 1 unit of currency = X base


class Import(Base):
    __tablename__ = "imports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    status: Mapped[str] = mapped_column(String, default="mapping")  # mapping|preview|done|cancelled
    headers: Mapped[list] = mapped_column(JSON, default=list)
    mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    options: Mapped[dict] = mapped_column(JSON, default=dict)  # date format, decimal sep...
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    account: Mapped[Account] = relationship()
    rows: Mapped[list["ImportRow"]] = relationship(
        back_populates="import_", cascade="all, delete-orphan", order_by="ImportRow.row_index"
    )


class ImportRow(Base):
    __tablename__ = "import_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id", ondelete="CASCADE"), index=True)
    row_index: Mapped[int] = mapped_column(Integer)
    raw: Mapped[list] = mapped_column(JSON)  # original cell values
    parsed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    parsed_amount: Mapped[float | None] = mapped_column(Float, nullable=True)  # signed
    parsed_payee: Mapped[str] = mapped_column(String, default="")
    parsed_note: Mapped[str] = mapped_column(String, default="")
    suggested_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    suggestion_confidence: Mapped[str] = mapped_column(String, default="")  # exact|rule|fuzzy|""
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    dedupe_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    skip: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str] = mapped_column(String, default="")

    import_: Mapped[Import] = relationship(back_populates="rows")


class ColumnPreset(Base):
    __tablename__ = "column_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    header_signature: Mapped[str] = mapped_column(String, unique=True, index=True)
    mapping: Mapped[dict] = mapped_column(JSON)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
