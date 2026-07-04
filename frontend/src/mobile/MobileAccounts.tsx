import { Archive, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useInvalidating } from "../api/hooks";
import type { Account } from "../api/types";
import { fmtMoney } from "../lib/format";

const TYPES = ["cash", "bank", "card", "savings"];
const CURRENCIES = ["AED", "USD", "EUR", "RUB", "AMD", "GBP", "CHF", "TRY", "GEL", "RSD"];
const PALETTE = ["#c6f135", "#6366f1", "#22d3ee", "#f472b6", "#fb923c", "#34d399", "#f43f5e", "#a78bfa"];

interface Draft {
  id?: number;
  name: string;
  type: string;
  currency: string;
  initial_balance: number;
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
}

const empty: Draft = {
  name: "",
  type: "bank",
  currency: "AED",
  initial_balance: 0,
  color: "#c6f135",
  icon: "wallet",
  archived: false,
  sort_order: 0,
};

export default function MobileAccounts() {
  const { data: accounts = [] } = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const save = useInvalidating(async (d: Draft) => {
    const body = { ...d, id: undefined };
    return d.id ? api.put(`/api/accounts/${d.id}`, body) : api.post("/api/accounts", body);
  }, MONEY_KEYS);
  const remove = useInvalidating((id: number) => api.del(`/api/accounts/${id}`), MONEY_KEYS);

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function del(acc: Account) {
    if (!confirm(`Delete account “${acc.name}”?`)) return;
    try {
      await remove.mutateAsync(acc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visible = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived));

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <button
          onClick={() => setDraft({ ...empty })}
          className="flex items-center gap-1.5 rounded-full bg-[#c6f135] px-3 py-1.5 text-xs font-semibold text-black active:scale-95"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}

      <div className="flex flex-col gap-3">
        {visible.map((acc) => (
          <div
            key={acc.id}
            className={`relative overflow-hidden rounded-3xl p-5 text-black ${acc.archived ? "opacity-50" : ""}`}
            style={{ background: `linear-gradient(135deg, ${acc.color}, ${acc.color}bb)` }}
          >
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-black/5" />
            <div className="flex items-start justify-between">
              <Wallet size={22} className="text-black/70" />
              <div className="flex gap-1">
                <button
                  onClick={() => setDraft({ ...acc })}
                  className="rounded-full bg-black/10 p-1.5 active:bg-black/20"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => save.mutate({ ...acc, archived: !acc.archived })}
                  className="rounded-full bg-black/10 p-1.5 active:bg-black/20"
                >
                  <Archive size={13} />
                </button>
                <button
                  onClick={() => del(acc)}
                  className="rounded-full bg-black/10 p-1.5 active:bg-black/20"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="mt-5 truncate text-xs font-medium text-black/60 uppercase">
              {acc.name} · {acc.type}
            </p>
            <p className="truncate text-2xl font-bold tabular-nums">{fmtMoney(acc.balance, acc.currency)}</p>
            {acc.currency !== "AED" && (
              <p className="text-xs text-black/60 tabular-nums">≈ {fmtMoney(acc.balance_base, "AED")}</p>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="py-10 text-center text-sm text-gray-500">No accounts yet.</p>}
      </div>

      {draft && (
        <div
          className="m-sheet-backdrop fixed inset-0 z-30 flex items-end bg-black/60"
          onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="m-sheet w-full rounded-t-3xl border-t border-white/10 bg-[#111309] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{draft.id ? "Edit account" : "New account"}</h2>
              <button onClick={() => setDraft(null)} className="rounded-full p-1.5 text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#c6f135]/50"
                placeholder="Account name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="number"
                step="0.01"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                placeholder="Initial balance"
                value={draft.initial_balance}
                onChange={(e) => setDraft({ ...draft, initial_balance: Number(e.target.value) })}
              />
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      draft.color === c ? "scale-110 ring-2 ring-white" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <button
                onClick={submit}
                disabled={!draft.name.trim()}
                className="mt-1 rounded-2xl bg-[#c6f135] py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
