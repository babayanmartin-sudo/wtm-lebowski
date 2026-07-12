import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api/client";
import { useBudgets, useBudgetStatus, useCategories, useInvalidating, useProjection } from "../api/hooks";
import type { BudgetPeriod } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { CategorySelect, ColorDot, EmptyState, Field, Modal, PageHeader, ProgressBar } from "../components/ui";
import { chartTooltipProps } from "../lib/charts";
import { fmtMoney, fmtMonth } from "../lib/format";
import { toISO } from "../lib/period";
import { useSessionState } from "../lib/session";

interface Draft {
  id?: number;
  category_id: number | null;
  amount: string;
  period: BudgetPeriod;
}

export default function BudgetsPage() {
  const [periodDate, setPeriodDate] = useSessionState("budgets.date", toISO(new Date()));
  const month = periodDate.slice(0, 7);
  const { data: budgets = [] } = useBudgets();
  const { data: status = [] } = useBudgetStatus(month);
  const { data: categories = [] } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [forecastMonths, setForecastMonths] = useSessionState("budgets.forecastMonths", 12);
  const { data: forecast } = useProjection(forecastMonths);

  const keys = [["budgets"], ["dashboard"], ["projection"]];
  const save = useInvalidating(
    (d: Draft) => {
      const body = { category_id: d.category_id, amount: parseFloat(d.amount), period: d.period };
      return d.id ? api.put(`/api/budgets/${d.id}`, body) : api.post("/api/budgets", body);
    },
    keys,
  );
  const remove = useInvalidating((id: number) => api.del(`/api/budgets/${id}`), keys);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const statusById = new Map(status.map((s) => [s.budget_id, s]));

  // a category can carry one budget per period — track which periods are taken
  const budgetedPeriods = new Map<number, Set<BudgetPeriod>>();
  for (const b of budgets) {
    const set = budgetedPeriods.get(b.category_id) ?? new Set<BudgetPeriod>();
    set.add(b.period);
    budgetedPeriods.set(b.category_id, set);
  }
  const availableFor = (period: BudgetPeriod) =>
    categories.filter((c) => c.kind === "expense" && !c.archived && !budgetedPeriods.get(c.id)?.has(period));
  const disabledIdsFor = (period: BudgetPeriod) =>
    new Set(categories.filter((c) => budgetedPeriods.get(c.id)?.has(period)).map((c) => c.id));

  // yearly budgets are amortized to a monthly-equivalent so the combined total stays meaningful
  const monthlyEquivalent = (amount: number, period: BudgetPeriod) =>
    period === "yearly" ? amount / 12 : amount;
  const totalLimit = budgets.reduce((s, b) => s + monthlyEquivalent(b.amount, b.period), 0);
  const totalSpent = budgets.reduce((s, b) => {
    const spent = statusById.get(b.id)?.spent ?? 0;
    return s + monthlyEquivalent(spent, b.period);
  }, 0);

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
        subtitle="Monthly or yearly spending limits per category (AED)"
        actions={
          <>
            <PeriodPicker mode="month" date={periodDate} modes={["month"]} onChange={(_m, d) => setPeriodDate(d)} />
            <button
              className="btn-primary"
              onClick={() => {
                const firstAvailable = availableFor("monthly")[0];
                setDraft({ category_id: firstAvailable?.id ?? null, amount: "", period: "monthly" });
              }}
            >
              <Plus size={16} /> Add budget
            </button>
          </>
        }
      />

      {budgets.length > 0 && (
        <div className="glass mb-4 p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-300">
              Total · {fmtMonth(month)} <span className="text-xs text-gray-500">(monthly-equivalent)</span>
            </span>
            <span className={`tabular-nums ${totalSpent > totalLimit ? "text-rose-400" : "text-gray-400"}`}>
              {fmtMoney(totalSpent)} / {fmtMoney(totalLimit)} AED
            </span>
          </div>
          <ProgressBar value={totalLimit > 0 ? totalSpent / totalLimit : 0} />
        </div>
      )}

      <div className="glass mb-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">
            Net worth forecast
            <span className="ml-2 text-xs font-normal text-gray-500">
              from recurring transactions + budgets
            </span>
          </h2>
          <div className="flex rounded-lg bg-white/5 p-1 text-xs">
            {[6, 12, 24].map((m) => (
              <button
                key={m}
                onClick={() => setForecastMonths(m)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  forecastMonths === m ? "bg-lime-400 text-black" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={forecast?.points ?? []}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c6f135" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#c6f135" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
              stroke="#4b5563"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#4b5563"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={70}
              domain={["auto", "auto"]}
              tickFormatter={(v) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)}
            />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={fmtMonth}
              formatter={(v) => [fmtMoney(Number(v), forecast?.base_currency), "Net worth"]}
            />
            {forecast && (
              <ReferenceLine
                y={forecast.current_net_worth}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{
                  value: "today",
                  position: "insideTopRight",
                  fill: "#64748b",
                  fontSize: 10,
                }}
              />
            )}
            <Area type="monotone" dataKey="net_worth" stroke="#c6f135" strokeWidth={2} fill="url(#nwGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {budgets.length === 0 ? (
        <EmptyState text="No budgets yet. Set a monthly or yearly limit for a category to start tracking." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const cat = categoryById.get(b.category_id);
            const st = statusById.get(b.id);
            const spent = st?.spent ?? 0;
            const ratio = b.amount > 0 ? spent / b.amount : 0;
            const left = b.amount - spent;
            const suffix = b.period === "yearly" ? "/yr" : "/mo";
            return (
              <div key={b.id} className="glass glass-hover p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    {cat && <ColorDot color={cat.color} />}
                    {cat?.name ?? "?"}
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                      {b.period}
                    </span>
                    {ratio >= 1 && (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
                        over budget
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                      onClick={() =>
                        setDraft({
                          id: b.id,
                          category_id: b.category_id,
                          amount: String(b.amount),
                          period: b.period,
                        })
                      }
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
                    {suffix}
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
                  categories={categories}
                  kind="expense"
                  value={draft.category_id}
                  onChange={(id) => setDraft({ ...draft, category_id: id })}
                  allowEmpty={false}
                  disabledIds={disabledIdsFor(draft.period)}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Period">
                <select
                  className="input"
                  value={draft.period}
                  onChange={(e) => {
                    const period = e.target.value as BudgetPeriod;
                    setDraft((prev) => {
                      if (!prev) return prev;
                      if (prev.id) return { ...prev, period }; // editing: category is fixed
                      const stillValid =
                        prev.category_id !== null && !budgetedPeriods.get(prev.category_id)?.has(period);
                      const category_id = stillValid ? prev.category_id : (availableFor(period)[0]?.id ?? null);
                      return { ...prev, period, category_id };
                    });
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>
              <Field label={`${draft.period === "yearly" ? "Yearly" : "Monthly"} limit (AED)`}>
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
            </div>
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
