import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAccounts, useBudgetStatus, useCategories, useDashboard } from "../api/hooks";
import type { CategoryTotal } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { CategorySelect, ColorDot, ProgressBar } from "../components/ui";
import { chartTooltipProps } from "../lib/charts";
import { fmtMoney } from "../lib/format";
import { useSessionState } from "../lib/session";
import {
  type PickerMode,
  bucketLabel,
  granularityToMode,
  parseISO,
  periodFor,
  periodLabel,
  shiftAnchor,
  toISO,
} from "../lib/period";

const ALL_MODES: PickerMode[] = ["day", "week", "month", "year", "custom"];

export default function DashboardPage() {
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("dashboard.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("dashboard.date", toISO(new Date()));
  const [accountId, setAccountId] = useSessionState<number | null>("dashboard.account", null);
  const [categoryId, setCategoryId] = useSessionState<number | null>("dashboard.category", null);

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);

  const { data } = useDashboard({
    date_from: period.from,
    date_to: period.to,
    account_id: accountId ?? undefined,
    category_id: categoryId ?? undefined,
  });
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const budgetMonth = period.from.slice(0, 7);
  const { data: budgetStatus = [] } = useBudgetStatus(budgetMonth);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const donut = (data?.by_category ?? []).slice(0, 8);
  const donutIncome = (data?.by_category_income ?? []).slice(0, 8);
  const granularityData = data?.series_granularity ?? "day";
  const transactionsLink = useMemo(() => {
    const params = new URLSearchParams({ mode: pickerMode, date: pickerDate });
    if (accountId) params.set("account", String(accountId));
    if (categoryId) params.set("category", String(categoryId));
    return `/transactions?${params.toString()}`;
  }, [pickerMode, pickerDate, accountId, categoryId]);

  const [periodHistory, setPeriodHistory] = useState<{ mode: PickerMode; date: string }[]>([]);

  function goToMonth() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
    setPeriodHistory([]);
  }

  function drillInto(label: string) {
    setPeriodHistory((h) => [...h, { mode: pickerMode, date: pickerDate }]);
    setPickerMode(granularityToMode(granularityData));
    setPickerDate(label);
  }

  function drillBack() {
    setPeriodHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPickerMode(prev.mode);
      setPickerDate(prev.date);
      return h.slice(0, -1);
    });
  }

  function resetView() {
    goToMonth();
    setAccountId(null);
    setCategoryId(null);
  }

  function toggleCategory(id: number | null) {
    if (id === null) return;
    setCategoryId((prev) => (prev === id ? null : id));
  }

  const zoomed = pickerMode !== "month";
  const hasFilter = accountId !== null || categoryId !== null;
  const filterAccount = accounts.find((a) => a.id === accountId);
  const filterCategory = categoryId ? categoryById.get(categoryId) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
              disabled={pickerMode === "custom"}
              onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
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
                setPeriodHistory([]);
              }}
            />
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
              disabled={pickerMode === "custom"}
              onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {(zoomed || hasFilter) && (
            <button className="btn-ghost px-3 py-1.5 text-xs" title="Back to current month, clear filters" onClick={resetView}>
              <RotateCcw size={13} /> Reset
            </button>
          )}

          <select
            className="input w-40"
            value={accountId ?? ""}
            onChange={(e) => setAccountId(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">All accounts</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel="All categories"
            className="input w-40"
          />
        </div>
      </div>

      {(hasFilter || zoomed) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          Filtering by
          {zoomed && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}
              <button onClick={goToMonth}>
                <X size={12} />
              </button>
            </span>
          )}
          {filterAccount && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {filterAccount.name}
              <button onClick={() => setAccountId(null)}>
                <X size={12} />
              </button>
            </span>
          )}
          {filterCategory && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              <ColorDot color={filterCategory.color} />
              {filterCategory.name}
              <button onClick={() => setCategoryId(null)}>
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="glass flex flex-wrap items-center divide-x divide-white/10 p-4">
        <StatInline
          label="Net worth"
          value={data ? fmtMoney(data.net_worth, data.base_currency) : "…"}
          icon={<TrendingUp size={15} />}
          color="text-lime-400"
        />
        <StatInline
          label="Income"
          value={data ? fmtMoney(data.income, data.base_currency) : "…"}
          icon={<ArrowUpRight size={15} />}
          color="text-emerald-400"
        />
        <StatInline
          label="Spent"
          value={data ? fmtMoney(data.expense, data.base_currency) : "…"}
          icon={<ArrowDownRight size={15} />}
          color="text-rose-400"
        />
      </div>

      <div className="glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Income vs spending</h2>
          <div className="flex items-center gap-2">
            {periodHistory.length > 0 && (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={drillBack}>
                <ChevronLeft size={12} /> Back
              </button>
            )}
            {zoomed ? (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={goToMonth}>
                <RotateCcw size={12} /> Reset
              </button>
            ) : (
              <span className="text-xs text-gray-500">Click a bar to zoom in</span>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data?.series ?? []}
            barGap={4}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (typeof label === "string") drillInto(label);
            }}
            className="cursor-pointer"
          >
            <XAxis
              dataKey="label"
              tickFormatter={(v) => bucketLabel(v, granularityData)}
              stroke="#4b5563"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              {...chartTooltipProps}
              formatter={(v, name) => [v, name]}
              labelFormatter={(v) => bucketLabel(String(v), granularityData)}
            />
            <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Category</h2>
          {categoryId ? (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setCategoryId(null)}>
              <RotateCcw size={12} /> Reset
            </button>
          ) : (
            (donut.length > 0 || donutIncome.length > 0) && (
              <span className="text-xs text-gray-500">Click a slice to filter</span>
            )
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CategoryPie
            title="Expense"
            items={donut}
            emptyText="No expenses in this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
          <CategoryPie
            title="Income"
            items={donutIncome}
            emptyText="No income in this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass p-5">
          <Link
            to="/accounts"
            className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-300 transition-colors hover:text-lime-300"
          >
            Accounts
            <ChevronRight size={14} className="text-gray-500" />
          </Link>
          <div className="flex flex-col gap-2.5">
            {activeAccounts.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccountId((prev) => (prev === a.id ? null : a.id))}
                className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-white/5 ${
                  accountId && accountId !== a.id ? "opacity-40" : ""
                }`}
              >
                <ColorDot color={a.color} />
                <span className="flex-1 text-gray-300">{a.name}</span>
                <span className="tabular-nums">{fmtMoney(a.balance, a.currency)}</span>
              </button>
            ))}
            {activeAccounts.length === 0 && <p className="text-sm text-gray-500">No accounts yet.</p>}
          </div>
        </div>

        <div className="glass p-5">
          <Link
            to="/budgets"
            className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-300 transition-colors hover:text-lime-300"
          >
            Budgets · {budgetMonth}
            <ChevronRight size={14} className="text-gray-500" />
          </Link>
          <div className="flex flex-col gap-3">
            {budgetStatus.map((b) => {
              const cat = categoryById.get(b.category_id);
              const ratio = b.amount > 0 ? b.spent / b.amount : 0;
              return (
                <div key={b.budget_id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300">
                      {cat && <ColorDot color={cat.color} />}
                      {cat?.name ?? "?"}
                    </span>
                    <span className={`tabular-nums ${ratio >= 1 ? "text-rose-400" : "text-gray-400"}`}>
                      {fmtMoney(b.spent)} / {fmtMoney(b.amount)}
                      {b.period === "yearly" ? "/yr" : "/mo"}
                    </span>
                  </div>
                  <ProgressBar value={ratio} />
                </div>
              );
            })}
            {budgetStatus.length === 0 && <p className="text-sm text-gray-500">No budgets set.</p>}
          </div>
        </div>

        <div className="glass p-5">
          <Link
            to={transactionsLink}
            className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-300 transition-colors hover:text-lime-300"
          >
            Recent transactions
            <ChevronRight size={14} className="text-gray-500" />
          </Link>
          <div className="flex flex-col gap-2">
            {(data?.recent ?? []).slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-gray-500">{tx.date.slice(5)}</span>
                <span className="flex-1 truncate text-gray-300">
                  {tx.payee || (tx.kind === "transfer" ? "Transfer" : tx.note || "—")}
                </span>
                <span
                  className={`tabular-nums text-xs ${
                    tx.kind === "income"
                      ? "text-emerald-300"
                      : tx.kind === "transfer"
                        ? "text-sky-300"
                        : "text-gray-300"
                  }`}
                >
                  {tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}
                  {fmtMoney(tx.amount, tx.currency)}
                </span>
              </div>
            ))}
            {(data?.recent ?? []).length === 0 && (
              <p className="text-sm text-gray-500">Nothing yet — add your first transaction.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryPie({
  title,
  items,
  emptyText,
  categoryId,
  onToggle,
  baseCurrency,
}: {
  title: string;
  items: CategoryTotal[];
  emptyText: string;
  categoryId: number | null;
  onToggle: (id: number | null) => void;
  baseCurrency: string | undefined;
}) {
  // a categoryId belonging to the other pie's kind shouldn't dim this one
  const activeCategoryId = categoryId != null && items.some((i) => i.category_id === categoryId)
    ? categoryId
    : null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={items}
                dataKey="amount"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                strokeWidth={0}
                onClick={(entry) => onToggle(entry.category_id)}
                className="cursor-pointer"
              >
                {items.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeCategoryId && entry.category_id !== activeCategoryId ? 0.35 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                {...chartTooltipProps}
                formatter={(v, name) => [fmtMoney(Number(v), baseCurrency), name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-col gap-1.5">
            {items.map((c) => (
              <button
                key={c.name}
                onClick={() => onToggle(c.category_id)}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5 ${
                  activeCategoryId && c.category_id !== activeCategoryId ? "opacity-40" : ""
                }`}
              >
                <ColorDot color={c.color} />
                <span className="flex-1 text-gray-300">{c.name}</span>
                <span className="tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatInline({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 first:pl-0 last:pr-0">
      <span className={color}>{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
