import { Archive, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useInvalidating } from "../api/hooks";
import type { Account } from "../api/types";
import { ColorPicker, Field, Modal, PageHeader } from "../components/ui";
import { fmtMoney } from "../lib/format";

const TYPES = ["cash", "bank", "card", "savings"];
const CURRENCIES = ["AED", "USD", "EUR", "RUB", "AMD", "GBP", "CHF", "TRY", "GEL", "RSD"];

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
  color: "#6366f1",
  icon: "wallet",
  archived: false,
  sort_order: 0,
};

export default function AccountsPage() {
  const { data: accounts = [] } = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");

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

  async function archive(acc: Account) {
    await save.mutateAsync({ ...acc, archived: !acc.archived });
  }

  async function del(acc: Account) {
    setPageError("");
    if (!confirm(`Delete account “${acc.name}”?`)) return;
    try {
      await remove.mutateAsync(acc.id);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visible = [...accounts].sort((a, b) => Number(a.archived) - Number(b.archived));

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Cash, banks and cards"
        actions={
          <button className="btn-primary" onClick={() => setDraft({ ...empty })}>
            <Plus size={16} /> Add account
          </button>
        }
      />
      {pageError && (
        <div className="glass mb-4 border-rose-400/30 p-3 text-sm text-rose-300">{pageError}</div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((acc) => (
          <div key={acc.id} className={`glass glass-hover p-5 ${acc.archived ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                  style={{ background: acc.color }}
                >
                  <Wallet size={18} />
                </div>
                <div>
                  <p className="font-medium">{acc.name}</p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    {acc.type} · {acc.currency}
                    {acc.archived ? " · archived" : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                  onClick={() => setDraft({ ...acc })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                  title={acc.archived ? "Unarchive" : "Archive"}
                  onClick={() => archive(acc)}
                >
                  <Archive size={15} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                  onClick={() => del(acc)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <p className="mt-4 text-2xl font-semibold tabular-nums">
              {fmtMoney(acc.balance, acc.currency)}
            </p>
            {acc.currency !== "AED" && (
              <p className="text-sm text-gray-500 tabular-nums">≈ {fmtMoney(acc.balance_base, "AED")}</p>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <Modal title={draft.id ? "Edit account" : "New account"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  className="input"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  className="input"
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Initial balance">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.initial_balance}
                onChange={(e) => setDraft({ ...draft, initial_balance: Number(e.target.value) })}
              />
            </Field>
            <Field label="Color">
              <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button className="btn-primary" onClick={submit} disabled={!draft.name.trim()}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
