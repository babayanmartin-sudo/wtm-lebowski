# Changelog

## v1.2.0 — 2026-07-09

### Dashboard

- **Category breakdown now covers income too.** `_by_category()` was
  hardcoded to expense splits, so drilling into an income category
  silently returned an empty breakdown. The "Spending by category" card
  is renamed **Category** and shows expense and income pies side by
  side; each pie only dims/filters for a `categoryId` that actually
  belongs to its own kind — selecting an expense slice no longer greys
  out or empties the income pie. (`ac7e561`, `4ce320a`, `eaded67`,
  `7b6260c`)
- **Expense-return income now nets into category spending.** An income
  transaction categorized under an expense category (e.g. a refund)
  used to be invisible in both directions. Now it's netted against the
  category's expense total, symmetric for both kinds.
- **Recent Transactions widget respects the selected period.** It
  previously ignored `date_from`/`date_to` entirely and always showed
  the globally most-recent transactions. Also raised the display cap
  from 7 to the backend's existing limit of 10.
- **"Recent Transactions" link now carries the active filters** (period
  mode/date, account, category) through to the Transactions page
  instead of linking to a bare, unfiltered view.
- **Drill-down gets a "Back" step.** Clicking a bar to zoom into a
  period (e.g. year → month) previously only had "Reset to current
  month" as a way out, losing any account/category filter. A
  `periodHistory` stack now lets you step back one level at a time;
  manually picking a period via the picker still clears the stack.
- **Compact stat row.** Net worth / Income / Spent collapsed from three
  large gradient cards into a single glass bar with divider-separated
  segments (tint color moved to icon/value instead of a background
  gradient). Net worth forecast chart moved off Dashboard onto the
  Budgets page, next to the total-progress card it's actually driven by.
- **Removed the duplicate period label** that showed the selected
  period twice (a standalone subtitle plus the picker's own trigger),
  on both desktop and mobile.
- **New: clearable "Filtering by" chip for period zoom**, matching the
  existing account/category chips — shows on Dashboard, Mobile
  Dashboard, Transactions, and Mobile Transactions whenever the period
  isn't the current month, with an X to jump back.

### Transactions

- **Amount filter** (`=` / `>` / `<` against a value), compared against
  `amount_base` so it works across mixed-currency accounts.
- **Net sum for the filtered set.** `sum_base` — signed (income adds,
  expense subtracts, transfers excluded), computed server-side over the
  *entire* filtered result, not just the current page — shown whenever
  any filter is active. Later moved to its own banner row, separate
  from the filter chips.
- **Mobile filter parity with desktop:** account, category, kind,
  amount, loan, and period chips all now appear consistently on the
  mobile Transactions view too.

### Accounts

- **Live rate ticker** (`RateTicker.tsx`): a static row at the top of
  the Accounts page showing every currency in active use against the
  main account's currency, with per-currency color and flag. Backend's
  `GET /api/rates` now also returns `previous_rate_to_base`. (An
  earlier version auto-scrolled with an up/down trend indicator; that
  animation and the day-over-day arrow were dropped per feedback in
  favor of a plain static row.)
- **Fixed overflow and cramped-name layout on account cards/list**:
  long names or the MAIN/Excluded badge were pushing action icons past
  the card edge, or squeezing the name down to one character. Cards
  now split name+badges and action icons onto two rows; list view stays
  single-line (name flex-1/truncate, balance+actions shrink-0), since
  it isn't grid-width-constrained like cards.
- Only the Accounts section header navigates to the Accounts page now
  — individual account rows on the mobile home page no longer do.

### Mobile home page

- Redesigned to match the desktop Dashboard: compact stat row, category
  pies (expense + income), and Recent Transactions respecting the
  period — same set of fixes as the desktop Dashboard above, applied to
  `MobileDashboard.tsx`.
- **Fixed a bug in the mobile category filter chip:** it looked up the
  active category in the top-6-sliced pie data instead of the full
  category list. A category selected on desktop (which isn't limited to
  the top slice) but outside mobile's top-6 would make the chip vanish
  — leaving the dashboard still server-side filtered with no visible
  way to clear it. Now resolved against the full category map, same as
  desktop.
- Net worth / Income / Spent stat rows restyled to match desktop
  (colored icon, gray uppercase label, bold value), stacked one per row
  instead of a horizontal divided strip.
