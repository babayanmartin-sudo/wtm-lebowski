---
paths:
  - "backend/**/*"
---

# Backend Architecture

## Data Model (backend/app/models.py)

**Core accounting entities:**
- `Account` — cash/bank/card/savings, per-currency, tracks `initial_balance` + computed balance from transactions
- `Transaction` — expense/income/transfer; stored in account currency + `amount_base` (base currency); nullable `loan_id`, `template_id`, `import_id`
- `Split` — splits a transaction across multiple categories; inherits transaction's currency conversion
- `Category` — expense/income; one level of parent/child nesting; child budgets roll into parent

**Features:**
- `Loan` — debt (owed by user) or receivable (owed to user); `paid` + `remaining` computed from linked transactions
- `Template` — recurring expense/income/transfer with frequency + auto-post flag
- `Budget` — monthly/yearly spending limit per category; unique constraint on `(category_id, period)`
- `Goal` — manual savings tracker (separate from transaction-linked loans); contributions tracked as manual records
- `MappingRule`, `IgnoreRule` — payee patterns for import categorization + transaction junk filtering
- `Import`, `ImportRow`, `ColumnPreset` — CSV/XLSX pipeline state

**Key design: transactions always in account currency, with `amount_base` computed via `to_base(db, amount, currency, date)` from `rates.py`. Dashboard/budget/goal queries use `amount_base` for multi-currency reporting.**

## Backend Structure (backend/app)

**Router-per-resource pattern** (fastapi):
- `routers/` — each entity (accounts, categories, transactions, budgets, goals, loans, templates, rules, ignore_rules, imports, dashboard, rates, auth)
- Router provides CRUD endpoints + domain-specific endpoints (e.g. `GET /api/dashboard/summary`)
- `schemas.py` — Pydantic models for `In` (request) and `Out` (response), all inherit `ORMModel` for SQLAlchemy mapping
- `models.py` — SQLAlchemy ORM, mapped column syntax (SQLAlchemy 2.0+)
- `services/` — shared domain logic: `balances.py` (compute balance as of a date), `matcher.py` (rule/fuzzy matching for imports), `rates.py` (exchange rates), `importer.py` (CSV parsing + type inference), `forecast.py` (net worth projection), `recurring.py` (materialize due templates)
- `auth.py` — session cookie auth + password hash (argon2)
- `db.py` — SQLAlchemy setup, migration runner (adds missing columns via `ALTER TABLE`), `Base` declarative

**Key routers of note:**
- `dashboard.py:_by_category()` — if category filter set, shows parent + children; otherwise rolls children into parents
- `transactions.py:_build()` — loan_id validation here; transfers reject loan linking
- `imports.py` — commit endpoint bulk-applies categorization from import rows to transactions; learn_ignore applies rules

## Database & Migrations

**SQLite** with SQLAlchemy ORM. Schema initialized via `create_all()` in `db.py`.

**Migration pattern** (db.py:_migrate()):
- Check table/column existence via `PRAGMA table_info(table_name)`
- If missing, run `ALTER TABLE` to add column + constraint
- Applied on app startup in lifespan context manager
- Example: loan_id addition checks if column exists, adds FK constraint if not

**Key: no explicit migration files. Schema version tracked implicitly; adding columns to models auto-migrates on next startup.**

## Known Patterns to Preserve

1. **Nullable ForeignKey with SET NULL**: used for template_id, import_id, loan_id (transaction can exist without linked template/import/loan)
2. **Service functions as parameters**: router passes db, dates, filters; service returns tuples or dicts (no pagination in service layer, router handles limit/offset)
3. **Query composition**: build WHERE clauses dynamically with _apply_filters(); avoids SQL injection
4. **ORMModel base**: all response schemas inherit from ORMModel to enable from_attributes=True
5. **Dual-mode validators**: Pydantic validators use mode="before" to intercept raw input before type coercion
