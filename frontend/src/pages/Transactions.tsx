import { ArrowLeftRight, ArrowRight, Plus, Search, Trash2, X } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useCategories, useInvalidating, useTransactions } from "../api/hooks";
import type { Transaction } from "../api/types";
import TransactionModal from "../components/TransactionModal";
import { CategorySelect, ColorDot, EmptyState, PageHeader } from "../components/ui";
import { fmtDate, fmtMoney } from "../lib/format";

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<number | null>(null);
  const [bulkAccount, setBulkAccount] = useState<number | "">("");
  const [bulkError, setBulkError] = useState("");

  const { data } = useTransactions({
    account_id: accountId,
    category_id: categoryId ?? undefined,
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
  const items = data?.items ?? [];

  function toggleOne(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const allSelected = items.length > 0 && items.every((t) => prev.has(t.id));
      if (allSelected) return new Set();
      return new Set(items.map((t) => t.id));
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkCategory(null);
    setBulkAccount("");
    setBulkError("");
  }

  async function applyBulkCategory() {
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
        <span className="flex items-center gap-1.5 text-indigo-300">
          <ArrowLeftRight size={13} /> to {to?.name ?? "?"}
        </span>
      );
    }
    if (tx.splits.length > 1) {
      return <span className="text-gray-400">{tx.splits.length} splits</span>;
    }
    const cat = categoryById.get(tx.splits[0]?.category_id ?? -1);
    if (!cat) return <span className="text-gray-500">Uncategorized</span>;
    return (
      <span className="flex items-center gap-1.5">
        <ColorDot color={cat.color} /> {cat.name}
      </span>
    );
  }

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = items.length > 0 && items.every((t) => selected.has(t.id));

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={`${total} records`}
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Add
          </button>
        }
      />

      {selected.size > 0 ? (
        <div className="glass mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium text-gray-200">{selected.size} selected</span>
          <CategorySelect
            categories={categories}
            value={bulkCategory}
            onChange={setBulkCategory}
            emptyLabel="Uncategorized"
            className="input w-44"
          />
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={applyBulkCategory}>
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
                  selected.has(tx.id) ? "bg-indigo-500/10" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(tx.id)}
                  onClick={(e) => toggleOne(tx.id, e)}
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
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    tx.kind === "income"
                      ? "text-emerald-300"
                      : tx.kind === "transfer"
                        ? "text-indigo-300"
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
