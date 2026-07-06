# Where's the Money, Lebowski

**v1.0** — Self-hosted expense tracker. FastAPI + SQLite backend, React +
Tailwind dark-glass frontend, with a separate lime-themed mobile layout.

## Features

- **Accounts** — cash / bank / card / savings, per-account currency, balances,
  reconciliation against your real bank balance, one account flagged **main**
  (used as the default everywhere an account is picked)
- **Categories** — expense & income, one level of subcategories, colors
- **Transactions** — expenses, incomes, **splits** (one purchase across
  several categories), **transfers** incl. cross-currency (both amounts
  stored exactly); period picker (day/week/month/year) with prev/next and
  reset; filters for account/category/kind/uncategorized/search, all
  persisted for the session; bulk edit (category/account/delete) with a
  confirmation prompt
- **Recurring/Planned templates** — rent, salary, subscriptions; auto-post or
  ask for confirmation, with an optional end date
- **Budgets** — monthly *or* yearly limit per category (a category can carry
  both at once); child spend rolls into the parent; validated so subcategory
  budgets can't exceed the parent's and a yearly limit can't exceed 12x the
  monthly one; progress bars, overspend badges
- **Savings goals** — target amount + date, manual contributions, projected
  monthly pace to hit the target
- **Loans & debts** — track a mortgage/loan you're paying off or money someone
  owes you. Unlike goals, this is driven by real transactions: mark an
  expense (debt) or income (receivable) as linked to a loan and its
  remaining balance updates automatically — the transaction still shows up
  normally everywhere (Transactions, Dashboard, category breakdowns)
- **Statement import** — CSV/XLSX upload, bank junk-header detection,
  column-mapping wizard, per-bank presets (repeat uploads skip the wizard),
  duplicate detection, permanent ignore rules for recurring non-expenses
- **Smart categorization** — rules register (exact/contains) + fuzzy matching
  against known merchants; learns from every correction (single edit or bulk)
- **Dashboard** — net worth, income/spent, day/week/month/year period nav
  with drill-down (click a bar to zoom in), account/category filters,
  category breakdown, net worth forecast from recurring templates + budgets;
  widget titles link to their full pages
- **Multi-currency** — daily rates auto-fetched (open.er-api.com, keyless),
  reporting in a configurable base currency (**AED** by default)
- **Mobile UI** — separate bottom-tab layout auto-activates under 768px width
- **Auth** — single password (argon2 hash), signed session cookie, a Profile
  page to change the password later

## Run (dev)

```bash
./run.sh
# UI:  http://localhost:5173
# API: http://localhost:8000/docs
```

First open asks you to create a password.

## Run (Docker, single port) — recommended for a VPS

```bash
mkdir -p data && chown -R 1000:1000 data   # the container runs as uid 1000
docker compose up -d
# http://<your-server>:8000  (frontend served by FastAPI, same origin)
```

- Data lives in `./data/` (`app.db` + `secret_key`) — **back up that folder**.
- Put a reverse proxy (Caddy/nginx) in front for TLS, then set
  `ET_COOKIE_SECURE=1` in `docker-compose.yml` so the session cookie is only
  ever sent over HTTPS.
- `GET /api/health` is a plain liveness check (used by the image's own
  `HEALTHCHECK`).
- Rebuild after pulling changes: `docker compose up -d --build`.

## Tests

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt   # first time only
.venv/bin/python -m pytest tests
```

## Config (env vars)

| Var | Default | Meaning |
| --- | --- | --- |
| `ET_DATA_DIR` | `./data` | SQLite + secret key location |
| `ET_BASE_CURRENCY` | `AED` | Reporting currency |
| `ET_STATIC_DIR` | `frontend/dist` | Built frontend to serve |
| `ET_COOKIE_SECURE` | `0` | Set to `1` once served over HTTPS |

## Import pipeline

1. Upload CSV/XLSX → encoding/delimiter auto-detect, header row found past
   bank preamble
2. Known header signature → saved preset applies automatically; otherwise map
   columns once (`date`, `amount` or `debit`+`credit`, `payee`, `note`;
   day-first dates, sign flip)
3. Preview: duplicates flagged (date+amount+merchant hash), categories
   suggested with confidence badges (`exact` / `rule` / `fuzzy`), recurring
   junk (e.g. internal transfers) can be marked "ignore" once and it's
   auto-skipped in every future import
4. Fix any category inline → the rule register learns it and propagates to
   every other row in the same import with the same merchant → commit
