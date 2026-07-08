import { Archive, Check, Pencil, Plus, Scale, Star, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useInvalidating } from "../api/hooks";
import type { Account, Transaction } from "../api/types";
import { ColorPicker, Field, Modal, PageHeader } from "../components/ui";
import { fmtMoney } from "../lib/format";

const TYPES = ["cash", "bank", "card", "savings"];
const CURRENCIES = ["AED", "USD", "EUR", "RUB", "AMD", "GBP", "CHF", "TRY", "GEL", "RSD"];

interface Draft {
  id?: number;
  name: string;
  type: string;
  currency: string;
  initial_balance: number | string;
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
  is_main: boolean;
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
  is_main: false,
};

export default function AccountsPage() {
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [reconciling, setReconciling] = useState<Account | null>(null);
  const [actualBalance, setActualBalance] = useState("");
  const [reconcileError, setReconcileError] = useState("");
  const [reconcileDone, setReconcileDone] = useState<Transaction | null | "noop">(null);

  const save = useInvalidating(async (d: Draft) => {
    const body = { ...d, id: undefined };
    return d.id ? api.put(`/api/accounts/${d.id}`, body) : api.post("/api/accounts", body);
  }, MONEY_KEYS);

  const remove = useInvalidating((id: number) => api.del(`/api/accounts/${id}`), MONEY_KEYS);

  const reconcile = useInvalidating(
    (args: { id: number; actual_balance: number }) =>
      api.post<{ account: Account; adjustment: Transaction | null }>(
        `/api/accounts/${args.id}/reconcile`,
        { actual_balance: args.actual_balance },
      ),
    MONEY_KEYS,
  );

  function openReconcile(acc: Account) {
    setReconciling(acc);
    setActualBalance(String(acc.balance));
    setReconcileError("");
    setReconcileDone(null);
  }

  async function submitReconcile() {
    setReconcileError("");
    try {
      const result = await reconcile.mutateAsync({
        id: reconciling!.id,
        actual_balance: parseFloat(actualBalance),
      });
      setReconcileDone(result.adjustment ?? "noop");
    } catch (e) {
      setReconcileError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function submit() {
    setError("");
    try {
      const body = { ...draft! };
      await save.mutateAsync(body);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function archive(acc: Account) {
    await save.mutateAsync({ ...acc, archived: !acc.archived });
  }

  async function setMain(acc: Account) {
    if (acc.is_main) return;
    await save.mutateAsync({ ...acc, is_main: true });
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
          <div
            key={acc.id}
            onClick={() => navigate(`/transactions?account=${acc.id}`)}
            title="View transactions for this account"
            className={`glass glass-hover cursor-pointer p-5 ${acc.archived ? "opacity-50" : ""}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                  style={{ background: acc.color }}
                >
                  <Wallet size={18} />
                </div>
                <div>
                  <p className="flex items-center gap-1.5 font-medium">
                    {acc.name}
                    {acc.is_main && (
                      <span className="rounded-full bg-lime-400/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-lime-300 uppercase">
                        Main
                      </span>
                    )}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    {acc.type} · {acc.currency}
                    {acc.archived ? " · archived" : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`rounded-lg p-1.5 hover:bg-white/10 ${acc.is_main ? "text-lime-300" : "text-gray-400"}`}
                  title={acc.is_main ? "This is your main account" : "Set as main account"}
                  onClick={() => setMain(acc)}
                >
                  <Star size={15} fill={acc.is_main ? "currentColor" : "none"} />
                </button>
                <button
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                  title="Reconcile balance"
                  onClick={() => openReconcile(acc)}
                >
                  <Scale size={15} />
                </button>
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
                type="text"
                className="input"
                placeholder="0.00"
                value={draft.initial_balance}
                onChange={(e) => setDraft({ ...draft, initial_balance: e.target.value })}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  setDraft({ ...draft, initial_balance: val === "" ? 0 : Number(val) || draft.initial_balance });
                }}
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

      {reconciling && (
        <Modal title={`Reconcile “${reconciling.name}”`} onClose={() => setReconciling(null)}>
          {reconcileDone !== null ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check size={22} />
              </div>
              {reconcileDone === "noop" ? (
                <p className="text-sm text-gray-300">Already matched — no adjustment needed.</p>
              ) : (
                <p className="text-sm text-gray-300">
                  Posted a {reconcileDone.kind === "income" ? "+" : "−"}
                  {fmtMoney(reconcileDone.amount, reconcileDone.currency)} adjustment.
                </p>
              )}
              <button className="btn-primary" onClick={() => setReconciling(null)}>
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-400">
                In the app: <span className="tabular-nums text-gray-200">{fmtMoney(reconciling.balance, reconciling.currency)}</span>.
                Enter what the bank actually shows — the difference is posted as an adjustment.
              </p>
              <Field label={`Actual balance (${reconciling.currency})`}>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  autoFocus
                />
              </Field>
              {(() => {
                const delta = Math.round((parseFloat(actualBalance || "0") - reconciling.balance) * 100) / 100;
                if (!actualBalance || Math.abs(delta) < 0.005) return null;
                return (
                  <p className={`text-xs ${delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    Will post {delta > 0 ? "an income" : "an expense"} adjustment of{" "}
                    {fmtMoney(Math.abs(delta), reconciling.currency)}.
                  </p>
                );
              })()}
              {reconcileError && <p className="text-xs text-rose-400">{reconcileError}</p>}
              <button
                className="btn-primary"
                onClick={submitReconcile}
                disabled={actualBalance === "" || Number.isNaN(parseFloat(actualBalance))}
              >
                <Scale size={15} /> Reconcile
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
