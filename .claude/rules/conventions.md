---
paths:
  - "backend/**/*.py"
  - "frontend/**/*.{ts,tsx}"
---

# Important Conventions

## Naming & Terminology

- **kind**: transaction type (expense/income/transfer), never "type"
- **direction**: loan direction (debt/receivable), not "type" or "role"
- **pattern**: payee string pattern for rules (raw, not normalized)
- **alias**: rule display name to replace transaction payee
- **amount_base**: amount in base currency (always AED by default)
- **paid**: on a loan, sum of linked transaction amounts (computed, not stored)

## Amount Handling

- All database amounts stored as `Float`, base currency or account currency as annotated
- Splits inherit their transaction's currency
- `to_base(db, amount, currency, date)` looks up rate and converts
- `balance_in_base(db, account, balance_in_account_currency, on_date)` converts account balance to base
- **No negative amounts in database** — sign is semantic (expense vs income in kind field)

## API Design

- **Request**: send what the UI provides (raw payee, raw patterns, user-entered amounts in their locale)
- **Response**: normalized for display (exchange-converted amounts, computed balances, strings trimmed)
- **Validation**: Pydantic validators normalize on input (e.g. parse_initial_balance), routers validate business rules (e.g. loan direction must match transaction kind)

## Pattern Matching (matcher.py)

Dual-path matching to support both fuzzy (normalized) and exact (raw, e.g. IBAN):
1. Normalize payee: `norm = payee.upper().strip()` (removes accents/spaces for fuzzy)
2. Raw payee: `raw = payee.upper().strip()` (no normalization, for ID-based rules)
3. Match check: `if rule.pattern == norm or rule.pattern == raw` (exact), `if r.pattern in norm or r.pattern in raw` (contains)
4. Preserves digit-based patterns (e.g. IBAN like "AE810260001015834372201" matches exactly)

## Locale-Aware Parsing

- `importer.py:parse_amount()` handles both US (1,234.56) and European (1.234,56) formats
- Detects locale via heuristic (if comma is present and count of commas < count of dots, assume European)
- Used for AccountIn.initial_balance and ImportRow.parsed_amount
- Pydantic field validator `@field_validator("initial_balance", mode="before")` calls parse_amount() if string input
