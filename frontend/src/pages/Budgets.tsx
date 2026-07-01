import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { useBudgets, useBudgetStatus, useCategories, useInvalidating } from "../api/hooks";
import { CategorySelect, ColorDot, EmptyState, Field, Modal, PageHeader, ProgressBar } from "../components/ui";
import { currentMonth, fmtMoney, fmtMonth } from "../lib/format";

interface Draft {
  id?: number;
  category_id: number | null;
  amount: string;
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: budgets = [] } = useBudgets();
  const { data: status = [] } = useBudgetStatus(month);
  const { data: categories = [] } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const keys = [["budgets"], ["dashboard"]];
  const save = useInvalidating(
    (d: Draft) =>
      d.id
        ? api.put(`/api/budgets/${d.id}`, { category_id: d.category_id, amount: parseFloat(d.amount) })
        : api.post("/api/budgets", { category_id: d.category_id, amount: parseFloat(d.amount) }),
    keys,
  );
  const remove = useInvalidating((id: number) => api.del(`/api/budgets/${id}`), keys);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const statusById = new Map(status.map((s) => [s.budget_id, s]));
  const budgeted = new Set(budgets.map((b) => b.category_id));

  const totalLimit = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = status.reduce((s, b) => s + b.spent, 0);

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Monthly spending limits per category (AED)"
        actions={
          <>
            <input
              type="month"
              className="input w-40"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth())}
            />
            <button className="btn-primary" onClick={() => setDraft({ category_id: null, amount: "" })}>
              <Plus size={16} /> Add budget
            </button>
          </>
        }
      />

      {budgets.length > 0 && (
        <div className="glass mb-4 p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-300">Total · {fmtMonth(month)}</span>
            <span className={`tabular-nums ${totalSpent > totalLimit ? "text-rose-400" : "text-gray-400"}`}>
              {fmtMoney(totalSpent)} / {fmtMoney(totalLimit)} AED
            </span>
          </div>
          <ProgressBar value={totalLimit > 0 ? totalSpent / totalLimit : 0} />
        </div>
      )}

      {budgets.length === 0 ? (
        <EmptyState text="No budgets yet. Set a monthly limit for a category to start tracking." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const cat = categoryById.get(b.category_id);
            const st = statusById.get(b.id);
            const spent = st?.spent ?? 0;
            const ratio = b.amount > 0 ? spent / b.amount : 0;
            const left = b.amount - spent;
            return (
              <div key={b.id} className="glass glass-hover p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    {cat && <ColorDot color={cat.color} />}
                    {cat?.name ?? "?"}
                    {ratio >= 1 && (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
                        over budget
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                      onClick={() => setDraft({ id: b.id, category_id: b.category_id, amount: String(b.amount) })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                      onClick={() => remove.mutate(b.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <ProgressBar value={ratio} />
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="tabular-nums text-gray-400">
                    {fmtMoney(spent)} of {fmtMoney(b.amount)}
                  </span>
                  <span className={`tabular-nums ${left < 0 ? "text-rose-400" : "text-emerald-300"}`}>
                    {left < 0 ? `${fmtMoney(-left)} over` : `${fmtMoney(left)} left`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit budget" : "New budget"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            {!draft.id && (
              <Field label="Category">
                <CategorySelect
                  categories={categories.filter((c) => !budgeted.has(c.id))}
                  kind="expense"
                  value={draft.category_id}
                  onChange={(id) => setDraft({ ...draft, category_id: id })}
                  allowEmpty={false}
                />
              </Field>
            )}
            <Field label="Monthly limit (AED)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                autoFocus
              />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={!(parseFloat(draft.amount) > 0) || (!draft.id && !draft.category_id)}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
