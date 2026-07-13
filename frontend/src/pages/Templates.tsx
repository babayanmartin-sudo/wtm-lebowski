import { Check, Pencil, Plus, Repeat, SkipForward, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import {
  MONEY_KEYS,
  useAccounts,
  useCategories,
  useInvalidating,
  useLoans,
  useTemplates,
} from "../api/hooks";
import type { Template } from "../api/types";
import { CategorySelect, EmptyState, Field, Modal, PageHeader } from "../components/ui";
import { fmtDate, fmtMoney, today } from "../lib/format";

interface Draft {
  id?: number;
  name: string;
  kind: "expense" | "income" | "transfer";
  account_id: number;
  amount: string;
  transfer_account_id: number | null;
  transfer_amount: string;
  category_id: number | null;
  loan_id: number | null;
  payee: string;
  note: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  next_due: string;
  end_date: string;
  auto_post: boolean;
  active: boolean;
}

export default function TemplatesPage() {
  const { data: templates = [] } = useTemplates();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: loans = [] } = useLoans();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const active = accounts.filter((a) => !a.archived);
  const mainAccount = active.find((a) => a.is_main) ?? active[0];

  const save = useInvalidating((d: Draft) => {
    const body = {
      ...d,
      id: undefined,
      amount: parseFloat(d.amount),
      transfer_amount: d.kind === "transfer" && d.transfer_amount ? parseFloat(d.transfer_amount) : null,
      transfer_account_id: d.kind === "transfer" ? d.transfer_account_id : null,
      loan_id: d.kind === "transfer" ? null : d.loan_id,
      end_date: d.end_date || null,
    };
    return d.id ? api.put(`/api/templates/${d.id}`, body) : api.post("/api/templates", body);
  }, MONEY_KEYS);
  const remove = useInvalidating((id: number) => api.del(`/api/templates/${id}`), MONEY_KEYS);
  const postNow = useInvalidating((id: number) => api.post(`/api/templates/${id}/post`), MONEY_KEYS);
  const skip = useInvalidating((id: number) => api.post(`/api/templates/${id}/skip`), MONEY_KEYS);

  function edit(t: Template) {
    setDraft({
      ...t,
      amount: String(t.amount),
      transfer_amount: t.transfer_amount ? String(t.transfer_amount) : "",
      end_date: t.end_date ?? "",
    });
  }

  function fresh(): Draft {
    return {
      name: "",
      kind: "expense",
      account_id: mainAccount?.id ?? 0,
      amount: "",
      transfer_account_id: null,
      transfer_amount: "",
      category_id: null,
      loan_id: null,
      payee: "",
      note: "",
      frequency: "monthly",
      interval: 1,
      next_due: today(),
      end_date: "",
      auto_post: false,
      active: true,
    };
  }

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const due = (t: Template) => t.active && t.next_due <= today();

  const loanDirection = draft?.kind === "expense" ? "debt" : draft?.kind === "income" ? "receivable" : null;
  const matchingLoans = loans.filter((l) => !l.archived && l.direction === loanDirection);

  return (
    <div>
      <PageHeader
        title="Planned"
        subtitle="Templates that post automatically or ask for confirmation"
        actions={
          <button className="btn-primary" onClick={() => setDraft(fresh())}>
            <Plus size={16} /> Add template
          </button>
        }
      />

      {templates.length === 0 ? (
        <EmptyState text="No recurring templates. Rent, salary, subscriptions — set them once." />
      ) : (
        <div className="glass overflow-hidden">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/5 px-4 py-3 last:border-0 ${
                t.active ? "" : "opacity-40"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    t.kind === "income"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : t.kind === "transfer"
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  <Repeat size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    every {t.interval > 1 ? `${t.interval} ` : ""}
                    {t.frequency.replace("ly", t.interval > 1 ? "s" : "")} · {accountById.get(t.account_id)?.name}
                    {t.auto_post ? " · auto" : ""}
                    {t.end_date ? ` · until ${fmtDate(t.end_date)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex w-full items-center justify-between gap-3 pl-12 sm:w-auto sm:pl-0">
                <span className={`text-xs ${due(t) ? "font-medium text-amber-300" : "text-gray-500"}`}>
                  {due(t) ? "due " : "next "}
                  {fmtDate(t.next_due)}
                </span>
                <span className="w-28 text-right text-sm font-medium tabular-nums">
                  {fmtMoney(t.amount, accountById.get(t.account_id)?.currency)}
                </span>
                <div className="flex gap-1">
                  {due(t) && !t.auto_post && (
                    <>
                      <button
                        title="Post now"
                        className="rounded-lg p-1.5 text-emerald-300 hover:bg-emerald-500/20"
                        onClick={() => postNow.mutate(t.id)}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        title="Skip occurrence"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                        onClick={() => skip.mutate(t.id)}
                      >
                        <SkipForward size={15} />
                      </button>
                    </>
                  )}
                  <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" onClick={() => edit(t)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                    onClick={() => remove.mutate(t.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit template" : "New template"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Rent, Salary, Netflix"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select
                  className="input"
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as Draft["kind"], loan_id: null })
                  }
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </Field>
              <Field label={draft.kind === "transfer" ? "From account" : "Account"}>
                <select
                  className="input"
                  value={draft.account_id}
                  onChange={(e) => setDraft({ ...draft, account_id: Number(e.target.value) })}
                >
                  {active.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {draft.kind === "transfer" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="To account">
                  <select
                    className="input"
                    value={draft.transfer_account_id ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        transfer_account_id: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">— choose —</option>
                    {active
                      .filter((a) => a.id !== draft.account_id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Received amount (if other currency)">
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={draft.transfer_amount}
                    onChange={(e) => setDraft({ ...draft, transfer_amount: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <>
                <Field label="Category">
                  <CategorySelect
                    categories={categories}
                    kind={draft.kind}
                    value={draft.category_id}
                    onChange={(id) => setDraft({ ...draft, category_id: id })}
                  />
                </Field>
                {matchingLoans.length > 0 && (
                  <Field label="Link to loan (optional)">
                    <select
                      className="input"
                      value={draft.loan_id ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, loan_id: e.target.value === "" ? null : Number(e.target.value) })
                      }
                    >
                      <option value="">— none —</option>
                      {matchingLoans.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Amount">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </Field>
              <Field label="Every">
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={draft.interval}
                  onChange={(e) => setDraft({ ...draft, interval: Math.max(1, Number(e.target.value)) })}
                />
              </Field>
              <Field label="Frequency">
                <select
                  className="input"
                  value={draft.frequency}
                  onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Draft["frequency"] })}
                >
                  <option value="daily">days</option>
                  <option value="weekly">weeks</option>
                  <option value="monthly">months</option>
                  <option value="yearly">years</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Next due">
                <input
                  type="date"
                  className="input"
                  value={draft.next_due}
                  onChange={(e) => setDraft({ ...draft, next_due: e.target.value })}
                />
              </Field>
              <Field label="Payee">
                <input
                  className="input"
                  value={draft.payee}
                  onChange={(e) => setDraft({ ...draft, payee: e.target.value })}
                />
              </Field>
            </div>
            <Field label="End date (optional — stops recurring after this)">
              <input
                type="date"
                className="input"
                value={draft.end_date}
                min={draft.next_due}
                onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
              />
            </Field>
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.auto_post}
                  onChange={(e) => setDraft({ ...draft, auto_post: e.target.checked })}
                />
                Post automatically
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Active
              </label>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={
                !draft.name.trim() ||
                !(parseFloat(draft.amount) > 0) ||
                (draft.kind === "transfer" && !draft.transfer_account_id)
              }
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
