# Changelog

## v1.11.2 — 2026-07-17

### Ask widget

- Prompt box is now an auto-growing textarea instead of a single-line
  input — long prompts wrap live while typing. Enter sends, Shift+Enter
  inserts a newline.

## v1.11.1 — 2026-07-17

### Mashreq/Amazon sync cleanup (#44)

- Mashreq mailbox password no longer round-trips to the client on
  Profile load; Profile only sends a new password when retyped.
- Renamed internal `MASHREQ_IMAP_*` settings constants to `SYNC_IMAP_*`
  (mailbox backs both Mashreq and Amazon sync).
- Deduped mailbox credential loading and card-account JSON handling.

## v1.11.0 — 2026-07-17

### Home page cleanup + auto-sync

- Home (desktop + mobile): removed Account/Category filter dropdowns,
  the Budgets panel, and Recent Transactions panel. "Income vs spending"
  title now links to Reports with the current date range. Net
  worth/Income/Spent no longer show a currency code. (#47, #48, #49, #50)
- Profile: new "Automatically sync all configured emails" toggle with a
  frequency (minutes, min 15) — runs Mashreq + Amazon sync on a
  background schedule. When off, a "Sync All" button appears on the
  Import page to run both once on demand. (#51)
- Fixed Profile page rendering as a single narrow mobile-style column on
  desktop — cards now lay out in a responsive grid. (#52)
- Fixed mobile landscape layout: bottom nav, content, and the menu sheet
  now respect safe-area insets and the menu sheet scrolls instead of
  overflowing off-screen. (#53)

## v1.10.0 — 2026-07-16

### Ask widget memory + chat history

- Conversations with the Ask widget now persist server-side (new
  `insights_conversations` table) instead of resetting on reload — a
  history icon lists past chats, a "New chat" button starts fresh.
- The assistant can call a new `remember` tool to save durable
  preferences ("my main account is X") to a persistent memory blob,
  included in the system prompt on every future request.
- Profile → AI Assistant now shows the stored memory with a "Clear
  memory" button.

## v1.9.2 — 2026-07-16

### Ask widget formatting

- Assistant replies now render as markdown (bullet/numbered lists, bold
  numbers, paragraph breaks) instead of one dense block of squished text —
  added `react-markdown` with Tailwind-mapped list/paragraph spacing.
- System prompt now explicitly asks the model to format multi-figure
  answers as a list and bold key numbers.

## v1.9.1 — 2026-07-16

### Mobile

- Ask widget (AI Chat Q&A) now also available on the mobile Home page,
  reusing the same component as desktop.

## v1.9.0 — 2026-07-16

### AI Chat Q&A on spending (#43)

- New "Ask" widget on the Dashboard: type a question about your spending
  ("how much did I spend on groceries last month?") and get an answer
  backed by your real data.
- Provider-agnostic: choose Anthropic (Claude) or OpenAI (GPT) per your
  own API key, configured in a new "AI Assistant" Profile section.
- The model answers by calling 5 read-only tool functions
  (`get_summary`, `get_category_breakdown`, `search_transactions`,
  `get_budget_status`, `get_accounts_balances`) that reuse the existing
  dashboard/reports/transactions aggregation code — no full transaction
  dump goes into the prompt, only what a question actually needs.
  Tool-use loop capped at 5 iterations per question.
- Chat history is ephemeral (frontend-only state) — nothing is persisted
  server-side.
- Split from #43's original broader scope; the non-LLM insight ideas
  (subscription detection, period comparison, savings suggestions) moved
  to #46.

## v1.8.1 — 2026-07-16

### UI reordering

- Budgets: Net worth forecast moved to the bottom of the page, below the
  budget cards.
- Goals & Loans: Loans section now comes first, Goals second.
- New Transaction modal: Category/splits now sit directly under Amount,
  before Payee and the loan-link field.

## v1.8.0 — 2026-07-16

### Reports: clickable charts + recent transactions (#45)

- **Clickable bar chart**: click a bar to zoom the report into that period
  (day/week/month, matching the series granularity), with a "Back" step to
  undo one zoom level at a time — same drill pattern as the Dashboard.
- **Clickable category pies**: click a slice (or its legend row) to filter
  the report down to that one category; click again to clear.
- **Recent transactions panel**: shows the 10 most recent transactions
  matching the report's active filters, with a clickable "Recent
  transactions" title linking through to the Transactions page with the
  same date range / account / category carried over.
- Backend: `POST /api/reports/preview` now returns a `recent` list
  (reuses `dashboard.py:_recent`, extended with exclude-category support).

## v1.7.1 — 2026-07-16

### Make Mashreq/Amazon sync opt-in

- Both syncs are personal-use features, not general product surface —
  each now has its own Profile toggle (**Enable Mashreq sync** / **Enable
  Amazon sync**), off by default. `POST /api/imports/mashreq-sync` and
  `/amazon-sync` reject with 400 while disabled, and the "Sync Mashreq"/
  "Sync Amazon" buttons on Import only render once enabled.

## v1.7.0 — 2026-07-16

### Email-based bank/retail sync (#40)

- **Mashreq alert sync.** Forward Mashreq's "Transaction Confirmation on
  Mashreq Card" emails to a dedicated mailbox; a "Sync Mashreq" button on
  Import pulls unseen alerts over IMAP, parses card/amount/merchant/
  timestamp, maps card suffix → account, and feeds them into the existing
  CSV-import review queue (dedupe, ignore-rules, category suggestion all
  reused as-is).
- **Amazon order sync.** Same mailbox, "Ordered: ..." emails. Handles two
  different Amazon plain-text templates — a multi-order digest, and a
  "single big item" template whose per-item price loses its decimal point
  in plain-text conversion (falls back to the order's own Total for
  single-item orders). One row per line item; posts to a single default
  Amazon account (no card info in these emails).
- **Amazon refund sync.** New "Refund on order ..." template — parses the
  total refund amount and item name into an income-signed row flagged
  `expense_return`, the same mechanism already used for manual
  expense-return reclassification, so it nets correctly against the
  original purchase's category.
- **Original date, not forward date.** A forwarded email's own `Date`
  header is when it was forwarded, not sent — the real date is extracted
  from the forwarded quote text instead (RFC2822 parse, then a
  Russian-locale month map for Gmail's localized "Forward" format, then a
  fuzzy fallback).
- Profile page gained a "Mailbox sync" section (IMAP host/port/user/
  password/folder, Mashreq card→account mapping, default Amazon account,
  "Test connection" button) and now keeps the password/threshold/mailbox
  sections collapsed by default instead of showing every field at once.
- Fixed an unbounded IMAP socket (no timeout previously — a stalled mail
  server could hang the "Sync" button forever) and a settings-save race
  where a background refetch could silently clobber an in-progress,
  unsaved Profile edit.
- Fixed `CategorySelect`'s dropdown being clipped inside Import's
  horizontally-scrolling table (an `overflow-x-auto` ancestor forces
  `overflow-y` to clip too, per the CSS spec) — now positions via fixed
  viewport coordinates instead of relative-to-trigger.

## v1.6.1 — 2026-07-14

### Bug fix

- **Overall monthly budget cap now respects `excluded_from_reports`.**
  `GET /api/budgets/overall-status` summed every expense transaction
  regardless of category exclusion flags (cascading parent→child), unlike
  the Dashboard totals and category breakdown, which already filtered them
  out. Now consistent everywhere.

## v1.6.0 — 2026-07-14

### Budgets (#41, #42)

- **Configurable budget warning threshold** (#41): the amber-warning cutoff
  on budget progress bars was hardcoded at 80%. Now a global default,
  editable in Profile ("Budget warning threshold"), applied everywhere a
  budget's `ProgressBar` renders. Saving a transaction that pushes a
  touched category's budget to or past the threshold now fires a toast.
  No per-budget override (descoped).
- **Overall monthly budget cap** (#42): a single top-level spending limit,
  independent of the sum of category budgets, tracked against total
  expense across all categories for the month. Inline-editable on the
  Budgets page; shown as a stat on both desktop and mobile Dashboard when
  set.
- New `GET/PUT /api/settings` (backing both features) and
  `GET /api/budgets/overall-status`.

## v1.5.1 — 2026-07-14

### Reports

- Quick date presets (This month / This year / Last 30 days / Last 90 days)
  on the Reports page — closes out the remaining wanted scope of #32.
  Transaction-level ID filters, PDF/JSON export, drag-drop filter reorder,
  and auto-save drafts were explicitly descoped.

## v1.5.0 — 2026-07-14

### Reports (#32 MVP)

- New **Reports** page: build a filtered view of transactions (date range,
  account, include/exclude categories) with live totals (income, expense,
  count, average), an income-vs-spending chart, and expense/income category
  breakdowns — same charting components as Dashboard.
- **Save/load named reports.** Saves the filter definition (not a result
  snapshot) so a loaded report always recomputes against current data.
- **CSV export** for a saved report (date/payee/category/amount rows) — new
  `StreamingResponse`-based export pattern, first in the backend.
- **Reset + removable filter chips**, matching the Dashboard's "Filtering
  by" row — one-click clear-all or drop a single filter.
- Backend: `_apply_filters()` in `dashboard.py` gained category-exclude
  support (`exclude_cat_ids`), reused by both Dashboard and Reports.
- Deferred to a follow-up (per #32's full spec): transaction-level
  include/exclude, PDF/JSON export, drag-drop filter reorder, auto-save
  drafts, quick presets.

## v1.4.2 — 2026-07-14

### UI consistency, wrap-up of #37

- **Loading/error states everywhere.** Failed or slow queries used to
  render silently as an empty list. New shared `Spinner`/`LoadingState`/
  `ErrorState`, wired into every page's primary query (desktop + mobile).
- **Themed `Select` component**, replacing native `<select>` in filter
  rows (Dashboard, Transactions, mobile equivalents) — native selects
  render with the browser's own chrome and couldn't be restyled to
  match `CategorySelect`'s panel, so dropdowns sitting side by side
  looked like two unrelated UI systems.
- Fixed `CategorySelect`/`PeriodPicker` panels overflowing the
  viewport near the right edge (was making the browser auto-scroll
  the whole page left to chase the autofocused search input).
- Fixed the "Exclude from reports" toggle flashing old-then-new state
  — now updates optimistically.
- Fixed height mismatches across filter/header controls: `SegmentedToggle`,
  `.btn-primary`, and several `PeriodPicker` instances never had a
  pinned height and drifted a few px from their neighbors.
- Widened the Amount filter select (text was clipped).
- Documented the icon-size and border-radius scales; normalized the
  flagged outliers (sidebar nav, Modal close, mobile menu close).
- New toast system for save/delete confirmations (Categories, Accounts,
  Budgets, Goals, Templates, Rules) — previously most of these closed
  silently with no feedback.

## v1.4.1 — 2026-07-13

### Bug fixes

- **Fixed #39: `excluded_from_reports` not applied to Income vs spending
  totals/series.** The flag was only wired into the category-breakdown
  query (`_by_category`) — the top-line Income/Spent stats and the
  Dashboard bar chart summed every transaction with no exclusion
  check at all. Now filtered consistently (cascading parent→child)
  everywhere the flag applies.

## v1.4.0 — 2026-07-13

### Signal Room — new theme (#38)

Retheme from the dark-glass/lime look to "Signal Room": an ops-console
aesthetic — graphite ground, amber accent reserved for flags/primary
actions/emphasis, one monospace typeface app-wide, hairline borders
instead of glass blur.

- New color tokens: graphite bg/panel, amber accent, `--color-line`
  hairline border color. The full `lime-*` Tailwind ramp is overridden
  to the amber scale, so existing `lime-400`/`text-lime-300` usage
  recolors from 5 lines instead of a file-by-file sweep.
- `--font-sans` now equals `--font-mono` — the whole app (not just
  numbers) renders in one monospace face.
- `.glass`: hairline border + solid panel instead of backdrop blur.
  `.btn-*`/`.input`: sharper `rounded-md` corners.
- New shared components: `Badge` (hairline tag, replacing filled
  pills), `SegmentedToggle` (hairline "pick one of N" control),
  `SuccessIcon` (dedup'd two different sizes).
- Charts (Dashboard, Budgets, mobile dashboard): tooltip/bar/line/axis
  colors moved off the old gray-700/lime-green palette onto
  graphite/amber.
- Dashboard rebuilt to actually match the theme's composition: hairline-
  divided stat grid (icons dropped), mono uppercase captions
  throughout, recent-transaction rows show a category tag + amber
  "Return" flag, mono tabular numbers everywhere.
- Consistency fixes bundled in: uniform filter-control heights
  (Dashboard/Transactions), fixed text overflowing its box in
  `CategorySelect`/`PeriodPicker` triggers, shortened filter
  placeholder labels ("All accounts" → "Accounts", etc.), "Recurring/
  Planned" renamed to "Planned", removed the redundant "Exchange
  rates" card from Profile (already on Accounts).
- Mobile: added account filter to Home (was date-only), fixed Net
  worth/Income/Spent colors and the Income/Spent amount not matching
  its arrow color, added the exchange-rate ticker to Accounts, fixed
  inconsistent edge padding across pages, fixed the mobile menu's
  "Planned" label and the Templates row both overflowing/overlapping
  under the new (wider) monospace font.

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
