# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

**Dev mode**: `./run.sh` starts both backend (FastAPI on :8000) and frontend (Vite on :5173 w/ `/api` proxy).
**Tests**: `cd backend && .venv/bin/python -m pytest tests`
**Build**: `npm run build` in `frontend/`; Docker: `docker compose up -d`
**Env**: set `ET_BASE_CURRENCY`, `ET_DATA_DIR`, `ET_STATIC_DIR`, `ET_COOKIE_SECURE` in `.env` or `docker-compose.yml`

## Architecture

### Data Model (backend/app/models.py)

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

### Backend Structure (backend/app)

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

### Frontend Structure (frontend/src)

**Framework**: React + TypeScript, Vite, Tailwind + custom dark-glass theme (lime accent)

**File layout:**
- `api/client.ts` — axios wrapper with auth + error handling
- `api/hooks.ts` — TanStack Query hooks (useQuery/useMutation); MONEY_KEYS invalidates on transaction changes
- `api/types.ts` — TypeScript interfaces mirroring backend schemas
- `pages/` — one page per resource (Accounts, Categories, Transactions, Budgets, Goals, Templates, Rules, Import, Dashboard, Login, Profile)
- `components/` — reusable (TransactionModal, TransactionTable, CategorySelect, etc.)
- `mobile/` — separate bottom-tab layout, activated on viewport < 768px
- `lib/` — utilities (formatting, date helpers, icon mapping)

**Key patterns:**
- Pages fetch data via hooks (e.g. `useTransactions()`, `useCategories()`), render tables/forms
- TransactionModal handles create/edit/delete, shows loan picker for expense/income (not transfer)
- Category picker often scoped (e.g. budgets filtered by kind/period)
- Forms manage validation via React state + optional Pydantic validator errors from backend

### Database & Migrations

**SQLite** with SQLAlchemy ORM. Schema initialized via `create_all()` in `db.py`.

**Migration pattern** (db.py:_migrate()):
- Check table/column existence via `PRAGMA table_info(table_name)`
- If missing, run `ALTER TABLE` to add column + constraint
- Applied on app startup in lifespan context manager
- Example: loan_id addition checks if column exists, adds FK constraint if not

**Key: no explicit migration files. Schema version tracked implicitly; adding columns to models auto-migrates on next startup.**

## Important Conventions

### Naming & Terminology

- **kind**: transaction type (expense/income/transfer), never "type"
- **direction**: loan direction (debt/receivable), not "type" or "role"
- **pattern**: payee string pattern for rules (raw, not normalized)
- **alias**: rule display name to replace transaction payee
- **amount_base**: amount in base currency (always AED by default)
- **paid**: on a loan, sum of linked transaction amounts (computed, not stored)

### Amount Handling

- All database amounts stored as `Float`, base currency or account currency as annotated
- Splits inherit their transaction's currency
- `to_base(db, amount, currency, date)` looks up rate and converts
- `balance_in_base(db, account, balance_in_account_currency, on_date)` converts account balance to base
- **No negative amounts in database** — sign is semantic (expense vs income in kind field)

### API Design

- **Request**: send what the UI provides (raw payee, raw patterns, user-entered amounts in their locale)
- **Response**: normalized for display (exchange-converted amounts, computed balances, strings trimmed)
- **Validation**: Pydantic validators normalize on input (e.g. parse_initial_balance), routers validate business rules (e.g. loan direction must match transaction kind)

### Pattern Matching (matcher.py)

Dual-path matching to support both fuzzy (normalized) and exact (raw, e.g. IBAN):
1. Normalize payee: `norm = payee.upper().strip()` (removes accents/spaces for fuzzy)
2. Raw payee: `raw = payee.upper().strip()` (no normalization, for ID-based rules)
3. Match check: `if rule.pattern == norm or rule.pattern == raw` (exact), `if r.pattern in norm or r.pattern in raw` (contains)
4. Preserves digit-based patterns (e.g. IBAN like "AE810260001015834372201" matches exactly)

### Locale-Aware Parsing

- `importer.py:parse_amount()` handles both US (1,234.56) and European (1.234,56) formats
- Detects locale via heuristic (if comma is present and count of commas < count of dots, assume European)
- Used for AccountIn.initial_balance and ImportRow.parsed_amount
- Pydantic field validator `@field_validator("initial_balance", mode="before")` calls parse_amount() if string input

### Testing

- Tests in `backend/tests/`; pytest fixtures in conftest.py
- `client` fixture creates fresh DB per test, sets up auth password
- `seeded` fixture adds AED + USD accounts, common categories (grocery, food, entertainment, income, housing)
- Each test creates its own records; no shared state
- Imports: use TestClient to POST /api/imports, then /api/imports/{id}/mapping, verify rows, commit
- Mock rates don't auto-fetch; tests set them explicitly or use default 1.0

## Key Files & Patterns

### Transaction Submission (backend/app/routers/transactions.py:_build)

```python
def _build(db, body: TransactionIn):
    # 1. Create Transaction record, validate currency
    # 2. For expense/income: build splits (validate categories), set loan_id if provided
    #    - loan must exist, direction must match kind
    # 3. For transfer: validate both accounts, set transfer_amount
    # 4. Compute amount_base via to_base()
    # 5. Return Transaction + splits for serialization
```

**Loan linking constraint:** expense → direction="debt", income → direction="receivable", transfer → no loan allowed.

### Dashboard Category Breakdown (backend/app/routers/dashboard.py:_by_category)

```python
if category_id:
    # Show selected category + its children
    children = [c.id for c in categories.values() if c.parent_id == category_id]
    wanted = ([category_id] + children) if children else [category_id]
else:
    # Roll children into their parents
    for cid, amount in amounts.items():
        top = categories[cid].parent_id if cid and categories[cid].parent_id else cid
        totals[top] += amount
```

**Result: with filter, both parent total + child breakdown; without filter, category hierarchy collapses one level.**

### Import Suggestion (backend/app/services/matcher.py:suggest)

```python
def suggest(db, payee, category_kind):
    norm = normalize(payee)  # fuzzy
    raw = payee.upper().strip()
    
    # 1. Exact rule match (highest priority)
    # 2. Contains rule match (lower priority)
    # 3. Fuzzy match against transaction payees (learn from history)
    # Return (category_id, confidence: "exact" | "rule" | "fuzzy" | "")
```

**Key: Fuzzy matching searches only against archived=false transactions to avoid old data noise.**

### Loan Balance Computation

```python
# backend/app/routers/loans.py:_out
paid = db.execute(
    select(func.sum(Transaction.amount_base))
    .where(
        Transaction.loan_id == loan.id,
        Transaction.kind == ("expense" if loan.direction == "debt" else "income")
    )
).scalar() or 0.0
remaining = loan.principal_amount - paid
```

**Always computed live; not stored. Mirrors `compute_budget_status` pattern in budgets.py.**

## Common Tasks

### Add a new transaction field

1. **Model** (models.py: Transaction): add Mapped[type] = mapped_column(...)
2. **Schema** (schemas.py: TransactionIn/Out): add field
3. **Router** (transactions.py): extract from request body in _build()
4. **Migration** (db.py:_migrate): add ALTER TABLE check if not existing in tests
5. **Tests**: verify field persists round-trip

### Add a new category breakdown in Dashboard

1. **Router** (dashboard.py): extend _by_category() logic or add new function
2. **Schema** (dashboard.py:summary response): add field to return dict
3. **Frontend** (Dashboard.tsx): display new breakdown, add filter controls if needed

### Add validation rule

1. **Schema** (schemas.py): use Pydantic `@field_validator` (before/after mode) or Field(...) constraints
2. **Router**: extract, validate business logic (e.g. loan direction matches tx kind), raise HTTPException(400, msg)
3. **Tests**: add test case that triggers validation, verify 400 response + error message

### Add new import parsing preset

1. **Router** (imports.py:apply_mapping): detect bank via header signature in detect_preset()
2. **Model** (ColumnPreset): add preset row with header_signature + mapping
3. **Tests**: test CSV with that bank's headers auto-applies preset

## Debugging Tips

- **Currency conversion issues**: check `to_base()` rate lookup date; test assumes default 1.0 unless explicitly set
- **Categorization not learning**: check matcher.py suggest() — fuzzy matches only non-archived transactions; rules must exist
- **Import row not suggesting category**: check duplicate detection (is_duplicate flag), rule priority ordering, then fuzzy fallback
- **Loan remaining shows wrong**: verify transaction kind matches loan direction (expense for debt, income for receivable)
- **Dashboard category filter shows nothing**: check wanted list construction — parent must be included if children exist

## Tools & Commands

```bash
# Backend
cd backend
.venv/bin/uvicorn app.main:app --reload --port 8000  # dev with hot reload
.venv/bin/python -m pytest tests -xvs  # run tests, stop on first failure
.venv/bin/python -m pytest tests -k "test_name"  # run one test
.venv/bin/python -m pytest tests --tb=short  # short traceback

# Frontend
cd frontend
npm run dev  # Vite dev server :5173
npm run build  # build for production
npm run preview  # test production build

# Docker
docker compose up -d  # prod build, runs both backend + frontend on :8000
docker compose down
docker compose logs -f app
```

## Versioning & Releases

Tags use semver: `v1.0.0`, `v1.0.1`, etc.
- **Minor fixes**: append patch version (1.0.2)
- **Features**: increment minor (1.1.0)
- Create tag: `git tag v1.0.2 && git push origin v1.0.2`
- GitHub Actions may auto-release (check Actions tab if configured)

## Known Patterns to Preserve

1. **Nullable ForeignKey with SET NULL**: used for template_id, import_id, loan_id (transaction can exist without linked template/import/loan)
2. **Service functions as parameters**: router passes db, dates, filters; service returns tuples or dicts (no pagination in service layer, router handles limit/offset)
3. **Query composition**: build WHERE clauses dynamically with _apply_filters(); avoids SQL injection
4. **ORMModel base**: all response schemas inherit from ORMModel to enable from_attributes=True
5. **Dual-mode validators**: Pydantic validators use mode="before" to intercept raw input before type coercion

