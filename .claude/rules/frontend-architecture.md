---
paths:
  - "frontend/**/*"
---

# Frontend Structure (frontend/src)

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
