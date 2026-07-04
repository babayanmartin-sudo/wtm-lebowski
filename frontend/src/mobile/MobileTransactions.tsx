import { Plus, Search } from "lucide-react";
import { useState } from "react";

import { useAccounts, useCategories, useTransactions } from "../api/hooks";
import type { Transaction } from "../api/types";
import TransactionModal from "../components/TransactionModal";
import { fmtMoney } from "../lib/format";

const PAGE_SIZE = 30;

export default function MobileTransactions() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const { data } = useTransactions({ q, limit: PAGE_SIZE, offset: 0 });

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const items = data?.items ?? [];

  const groups = new Map<string, Transaction[]>();
  for (const tx of items) {
    const list = groups.get(tx.date) ?? [];
    list.push(tx);
    groups.set(tx.date, list);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activity</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-[#c6f135] px-3 py-1.5 text-xs font-semibold text-black active:scale-95"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="relative">
        <Search size={15} className="absolute top-3 left-3 text-gray-500" />
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pr-3 pl-9 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-[#c6f135]/50"
          placeholder="Search payee, note…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">No transactions match.</p>
      ) : (
        [...groups.entries()].map(([date, txs]) => (
          <div key={date}>
            <p className="mb-2 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase">{date}</p>
            <div className="flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
              {txs.map((tx) => {
                const acc = accounts.find((a) => a.id === tx.account_id);
                const cat = tx.splits[0]?.category_id ? categoryById.get(tx.splits[0].category_id) : null;
                return (
                  <button
                    key={tx.id}
                    onClick={() => setEditing(tx)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-white/5"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-black"
                      style={{ background: cat?.color ?? "#c6f135" }}
                    >
                      {(tx.payee || tx.note || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-100">
                        {tx.payee || (tx.kind === "transfer" ? "Transfer" : tx.note || "—")}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {acc?.name}
                        {cat ? ` · ${cat.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
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
                  </button>
                );
              })}
            </div>
          </div>
        ))
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
