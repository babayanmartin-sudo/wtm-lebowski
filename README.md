# ExpenseTracker

Lightweight self-hosted expense tracker. FastAPI + SQLite backend, React + Tailwind dark-glass frontend.

## Features

- **Accounts** — cash / bank / card / savings, per-account currency, balances
- **Categories** — expense & income, one level of subcategories, colors
- **Records** — expenses, incomes, **splits** (one purchase across several categories), **transfers** incl. cross-currency (both amounts stored exactly)
- **Recurring templates** — rent, salary, subscriptions; auto-post or confirm-on-dashboard
- **Budgets** — monthly limit per category (child spend rolls into parent), progress bars, overspend badges
- **Savings goals** — target amount + date, contributions, required monthly pace
- **Statement import** — CSV/XLSX upload, bank junk-header detection, column-mapping wizard, per-bank presets (repeat uploads skip the wizard), duplicate detection
- **Smart categorization** — rules register (exact/contains) + fuzzy matching against known merchants; learns from every correction you make
- **Multi-currency** — daily rates auto-fetched (open.er-api.com, keyless), reporting in **AED**
- **Auth** — single password, signed session cookie, argon2 hash

## Run (dev)

```bash
./run.sh
# UI:  http://localhost:5173
# API: http://localhost:8000/docs
```

First open asks you to create a password.

## Run (Docker, single port)

```bash
docker compose up -d
# http://localhost:8000  (frontend served by FastAPI)
```

Data lives in `./data/app.db` (SQLite + secret key) — back up that folder.

## Tests

```bash
cd backend && .venv/bin/python -m pytest tests
```

## Config (env vars)

| Var | Default | Meaning |
| --- | --- | --- |
| `ET_DATA_DIR` | `./data` | SQLite + secret key location |
| `ET_BASE_CURRENCY` | `AED` | Reporting currency |
| `ET_STATIC_DIR` | `frontend/dist` | Built frontend to serve |

## Import pipeline

1. Upload CSV/XLSX → encoding/delimiter auto-detect, header row found past bank preamble
2. Known header signature → saved preset applies automatically; otherwise map columns once (`date`, `amount` or `debit`+`credit`, `payee`, `note`; day-first dates, sign flip)
3. Preview: duplicates flagged (date+amount+merchant hash), categories suggested with confidence badges (`exact` / `rule` / `fuzzy`)
4. Fix any category inline → the rule register learns it → commit
