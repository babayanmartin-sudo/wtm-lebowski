# Changelog

## v1.3.2 — 2026-07-13

### UI consistency (#37)

- Fixed chart tooltips rendering with a hardcoded gray theme that
  clashed with the app's dark-glass UI.
- Added the real sidebar logo, replacing the emoji placeholder.
- Consolidated 4 stray near-black hex literals into the theme's
  `--color-bg`/`--color-panel` tokens.
- Fixed the brand accent being two different greens: Tailwind's stock
  `lime-400` and the custom `#c6f135` were used interchangeably;
  overrode the token so both resolve to the same color.
- Normalized row-action icon sizes (13/14/15px → 14px) and header
  "Add" icons (→16px) across Categories/Rules/Accounts/Templates.
- Unified account avatar size/radius between list and card views.
- Matched PeriodPicker's dropdown radius to CategorySelect's.
- Added a shared `Badge` component, retrofitting 9 hand-rolled status
  pills (Budgets, Rules, Accounts, Import) onto one consistent style.
- Fixed mobile input fields silently drifting from desktop (hand-typed
  recipe instead of the shared `.input` class) and a duplicated/
  drifted color palette in the mobile account picker.
- Added a shared `SuccessIcon`, deduplicating two different sizes used
  for the same "operation succeeded" concept.
- Unified the two different hover-to-reveal techniques for row action
  buttons, and added a shared `SegmentedToggle` component replacing
  two different "pick one of N" toggle styles.
- Added column headers (Date/Payee/Category/Amount) to the
  Transactions list, and fixed its selected-row highlight opacity to
  match the rest of the app.

## v1.3.1 — 2026-07-12

### Bug fixes

- **Fixed #36: couldn't re-include a category excluded from reports.**
  The excluded-state indicator next to a category name was a static,
  non-interactive icon; the real toggle was hidden in the row's
  hover-only action group. The indicator is now itself the toggle —
  click it to include the category again. A separate non-interactive
  badge still shows when exclusion is inherited from a parent category.

## v1.3.0 — 2026-07-11

### Transactions

- **Reclassify existing income as a refund/return.** An income transaction
  can now be marked "refund/return" (single edit + bulk), which unlocks
  the category picker to expense categories. Netting logic already
  existed (v1.2.0); this closes the gap where the UI blocked assigning
  an expense category to an income transaction.

### Categories

- **Exclude a category from reports.** New per-category toggle
  (`excluded_from_reports`); excluding a parent cascades to all its
  subcategories automatically. Dashboard category breakdown now filters
  these out. Category stays usable when categorizing transactions —
  only reporting/dashboard aggregation is affected.
- **Searchable category picker.** `CategorySelect` is now a combobox with
  fuzzy search and an A–Z / most-used sort toggle, replacing the plain
  `<select>`, across Transactions (row + bulk) and the transaction
  edit modal.

### Bug fixes

- **Fixed #35: category drill-down showed 0% for all subcategories** when
  the parent category itself had no direct spending. Total is now
  parent-direct + sum(children), so percentages compute correctly.

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
