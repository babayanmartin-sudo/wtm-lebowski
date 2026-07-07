import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useCategories, useInvalidating, useLoans, useTransactions } from "../api/hooks";
import type { Transaction } from "../api/types";
import TransactionModal from "../components/TransactionModal";
import PeriodPicker from "../components/PeriodPicker";
import { CategorySelect, ColorDot, EmptyState, PageHeader, UNCATEGORIZED_ID } from "../components/ui";
import { fmtDate, fmtMoney } from "../lib/format";
import { type PickerMode, parseISO, periodFor, shiftAnchor, toISO } from "../lib/period";
import { useSessionState } from "../lib/session";

const PAGE_SIZE = 50;
const ALL_MODES: PickerMode[] = ["day", "week", "month", "year"];

export default function TransactionsPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: loans = [] } = useLoans();
  const [searchParams] = useSearchParams();
  const [accountId, setAccountId] = useSessionState(
    "transactions.account",
    "",
    searchParams.get("account") ?? undefined,
  );
  const [loanId, setLoanId] = useSessionState<string | null>(
    "transactions.loan",
    null,
    searchParams.get("loan") ?? undefined,
  );
  const [categoryId, setCategoryId] = useSessionState<number | null>("transactions.category", null);
  const [kind, setKind] = useSessionState("transactions.kind", "");
  const [q, setQ] = useSessionState("transactions.q", "");
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("transactions.periodMode", "month");
  const [pickerDate, setPickerDate] = useSessionState("transactions.periodDate", toISO(new Date()));
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedKinds, setSelectedKinds] = useState<Map<number, Transaction["kind"]>>(new Map());
  const [bulkCategory, setBulkCategory] = useState<number | null>(null);
  const [bulkAccount, setBulkAccount] = useState<number | "">("");
  const [bulkError, setBulkError] = useState("");

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate)), [pickerMode, pickerDate]);
  const isCurrentMonth = pickerMode === "month" && pickerDate.slice(0, 7) === toISO(new Date()).slice(0, 7);

  function resetPeriod() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
  }

  const { data } = useTransactions({
    account_id: accountId,
    category_id: categoryId && categoryId !== UNCATEGORIZED_ID ? categoryId : undefined,
    uncategorized: categoryId === UNCATEGORIZED_ID ? "true" : undefined,
    loan_id: loanId ?? undefined,
    date_from: period.from,
    date_to: period.to,
    kind,
    q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const bulk = useInvalidating(
    (body: { ids: number[]; action: string; category_id?: number | null; account_id?: number }) =>
      api.post<{ updated: number }>("/api/transactions/bulk", body),
    MONEY_KEYS,
  );

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const filteredLoan = loanId ? loans.find((l) => String(l.id) === loanId) : undefined;
  const items = data?.items ?? [];

  function toggleOne(tx: Transaction, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tx.id)) next.delete(tx.id);
      else next.add(tx.id);
      return next;
    });
    setSelectedKinds((prev) => {
      const next = new Map(prev);
      if (next.has(tx.id)) next.delete(tx.id);
      else next.set(tx.id, tx.kind);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allSelected = items.length > 0 && items.every((t) => selected.has(t.id));
    if (allSelected) {
      setSelected(new Set());
      setSelectedKinds(new Map());
      return;
    }
    setSelected(new Set(items.map((t) => t.id)));
    setSelectedKinds(new Map(items.map((t) => [t.id, t.kind])));
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectedKinds(new Map());
    setBulkCategory(null);
    setBulkAccount("");
    setBulkError("");
  }

  async function applyBulkCategory() {
    const catName = bulkCategory ? (categoryById.get(bulkCategory)?.name ?? "?") : "Uncategorized";
    if (!confirm(`Set category to "${catName}" for ${selected.size} transaction(s)?`)) return;
    setBulkError("");
    try {
      await bulk.mutateAsync({ ids: [...selected], action: "set_category", category_id: bulkCategory });
      clearSelection();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function applyBulkAccount() {
    if (bulkAccount === "") return;
    setBulkError("");
    try {
      await bulk.mutateAsync({ ids: [...selected], action: "set_account", account_id: bulkAccount });
      clearSelection();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function applyBulkDelete() {
    if (!confirm(`Delete ${selected.size} transaction(s)? This cannot be undone.`)) return;
    setBulkError("");
    try {
      await bulk.mutateAsync({ ids: [...selected], action: "delete" });
      clearSelection();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Failed");
    }
  }

  function categoryLabel(tx: Transaction) {
    if (tx.kind === "transfer") {
      const to = accountById.get(tx.transfer_account_id ?? -1);
      return (
        <span className="flex items-center gap-1.5 text-sky-300">
          <ArrowLeftRight size={10} className="shrink-0" />
          <span className="truncate">to {to?.name ?? "?"}</span>
        </span>
      );
    }
    if (tx.splits.length > 1) {
      return (
        <span className="flex items-center gap-1.5 text-gray-400">
          <span className="inline-block h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{tx.splits.length} splits</span>
        </span>
      );
    }
    const cat = categoryById.get(tx.splits[0]?.category_id ?? -1);
    if (!cat) {
      return (
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="inline-block h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Uncategorized</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5">
        <ColorDot color={cat.color} />
        <span className="truncate">{cat.name}</span>
      </span>
    );
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = items.length > 0 && items.every((t) => selected.has(t.id));

  const kindsInSelection = new Set(selectedKinds.values());
  const categoryBlocked = kindsInSelection.has("expense") && kindsInSelection.has("income");
  const bulkCategoryKind = categoryBlocked
    ? undefined
    : kindsInSelection.has("income")
      ? "income"
      : kindsInSelection.has("expense")
        ? "expense"
        : undefined;

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={`${total} records`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <button
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                onClick={() => {
                  setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)));
                  setPage(0);
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <PeriodPicker
                mode={pickerMode}
                date={pickerDate}
                modes={ALL_MODES}
                onChange={(m, d) => {
                  setPickerMode(m);
                  setPickerDate(d);
                  setPage(0);
                }}
              />
              <button
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                onClick={() => {
                  setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)));
                  setPage(0);
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {!isCurrentMonth && (
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                title="Back to current month"
                onClick={() => {
                  resetPeriod();
                  setPage(0);
                }}
              >
                <RotateCcw size={13} /> Reset
              </button>
            )}
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Add
            </button>
          </>
        }
      />

      {selected.size > 0 ? (
        <div className="glass mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium text-gray-200">{selected.size} selected</span>
          <CategorySelect
            categories={categories}
            kind={bulkCategoryKind}
            value={bulkCategory}
            onChange={setBulkCategory}
            emptyLabel="Uncategorized"
            className="input w-44"
            disabled={categoryBlocked}
          />
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={applyBulkCategory}
            disabled={categoryBlocked}
            title={categoryBlocked ? "Select only Expense or only Income to set a category" : undefined}
          >
            Set category
          </button>
          <select
            className="input w-40"
            value={bulkAccount}
            onChange={(e) => setBulkAccount(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Move to account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={bulkAccount === ""} onClick={applyBulkAccount}>
            Set account
          </button>
          <button className="btn-danger px-3 py-1.5 text-xs" onClick={applyBulkDelete}>
            <Trash2 size={13} /> Delete
          </button>
          <span className="flex-1" />
          <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" onClick={clearSelection}>
            <X size={15} />
          </button>
          {categoryBlocked && (
            <p className="w-full text-xs text-amber-400">
              Expense and Income are both selected — pick only one kind to set a category.
            </p>
          )}
          {bulkError && <p className="w-full text-xs text-rose-400">{bulkError}</p>}
        </div>
      ) : (
        <div className="glass mb-4 flex flex-wrap items-center gap-2 p-3">
          <div className="relative">
            <Search size={14} className="absolute top-2.5 left-2.5 text-gray-500" />
            <input
              className="input w-52 pl-8"
              placeholder="Search payee, note…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <select
            className="input w-40"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={(id) => {
              setCategoryId(id);
              setPage(0);
            }}
            emptyLabel="All categories"
            uncategorizedOption
            className="input w-48"
          />
          <select
            className="input w-32"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All kinds</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
      )}

      {loanId && (
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-400">
          Filtering by loan
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
            {filteredLoan?.name ?? `#${loanId}`}
            <button onClick={() => setLoanId(null)}>
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {data && data.items.length === 0 ? (
        <EmptyState text="No transactions match." />
      ) : (
        <div className="glass overflow-hidden">
          <div className="flex items-center gap-4 border-b border-white/5 px-4 py-2">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              title="Select all on this page"
            />
            <span className="text-xs text-gray-500">Select all on page</span>
          </div>
          {items.map((tx) => {
            const acc = accountById.get(tx.account_id);
            return (
              <div
                key={tx.id}
                onClick={() => setEditing(tx)}
                className={`flex w-full cursor-pointer items-center gap-4 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5 ${
                  selected.has(tx.id) ? "bg-lime-500/10" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(tx.id)}
                  onClick={(e) => toggleOne(tx, e)}
                  onChange={() => {}}
                />
                <span className="w-24 shrink-0 text-xs text-gray-500">{fmtDate(tx.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {tx.payee || tx.note || (tx.kind === "transfer" ? "Transfer" : "—")}
                  </span>
                  <span className="block text-xs text-gray-500">{acc?.name}</span>
                </span>
                <span className="hidden w-44 shrink-0 text-xs sm:block">{categoryLabel(tx)}</span>
                <span
                  className={`w-36 shrink-0 text-right text-sm font-medium tabular-nums ${
                    tx.kind === "income"
                      ? "text-emerald-300"
                      : tx.kind === "transfer"
                        ? "text-sky-300"
                        : "text-gray-200"
                  }`}
                >
                  {tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}
                  {fmtMoney(tx.amount, tx.currency)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-400">
          <button className="btn-ghost px-3 py-1" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            className="btn-ghost px-3 py-1"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next <ArrowRight size={13} />
          </button>
        </div>
      )}

      {(creating || editing) && (
        <TransactionModal
          accounts={accounts}
          categories={categories}
          loans={loans}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
