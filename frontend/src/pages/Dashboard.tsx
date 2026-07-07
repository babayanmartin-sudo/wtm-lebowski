import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAccounts, useBudgetStatus, useCategories, useDashboard, useProjection } from "../api/hooks";
import PeriodPicker from "../components/PeriodPicker";
import { CategorySelect, ColorDot, ProgressBar } from "../components/ui";
import { fmtMoney, fmtMonth } from "../lib/format";
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

const ALL_MODES: PickerMode[] = ["day", "week", "month", "year"];

export default function DashboardPage() {
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("dashboard.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("dashboard.date", toISO(new Date()));
  const [accountId, setAccountId] = useSessionState<number | null>("dashboard.account", null);
  const [categoryId, setCategoryId] = useSessionState<number | null>("dashboard.category", null);
  const [forecastMonths, setForecastMonths] = useSessionState("dashboard.forecastMonths", 12);

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate)), [pickerMode, pickerDate]);

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
  const { data: forecast } = useProjection(forecastMonths);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const activeAccounts = accounts.filter((a) => !a.archived);
  const donut = (data?.by_category ?? []).slice(0, 8);
  const granularityData = data?.series_granularity ?? "day";

  function goToMonth() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
  }

  function drillInto(label: string) {
    setPickerMode(granularityToMode(granularityData));
    setPickerDate(label);
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
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">{periodLabel(pickerMode, period.from)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
              onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
            >
              <ChevronLeft size={16} />
            </button>
            <PeriodPicker mode={pickerMode} date={pickerDate} modes={ALL_MODES} onChange={(m, d) => { setPickerMode(m); setPickerDate(d); }} />
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
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

      {hasFilter && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          Filtering by
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Net worth"
          value={data ? fmtMoney(data.net_worth, data.base_currency) : "…"}
          icon={<TrendingUp size={18} />}
          tint="from-lime-500/25"
        />
        <StatCard
          label="Income"
          value={data ? fmtMoney(data.income, data.base_currency) : "…"}
          icon={<ArrowUpRight size={18} />}
          tint="from-emerald-500/25"
        />
        <StatCard
          label="Spent"
          value={data ? fmtMoney(data.expense, data.base_currency) : "…"}
          icon={<ArrowDownRight size={18} />}
          tint="from-rose-500/25"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Income vs spending</h2>
            {zoomed ? (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={goToMonth}>
                <RotateCcw size={12} /> Reset
              </button>
            ) : (
              <span className="text-xs text-gray-500">Click a bar to zoom in</span>
            )}
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
                contentStyle={{
                  background: "#374151",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "#ffffff",
                }}
                labelFormatter={(v) => bucketLabel(String(v), granularityData)}
              />
              <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Spending by category</h2>
            {categoryId ? (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setCategoryId(null)}>
                <RotateCcw size={12} /> Reset
              </button>
            ) : (
              donut.length > 0 && <span className="text-xs text-gray-500">Click to filter</span>
            )}
          </div>
          {donut.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No expenses in this period.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    strokeWidth={0}
                    onClick={(entry) => toggleCategory(entry.category_id)}
                    className="cursor-pointer"
                  >
                    {donut.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        opacity={categoryId && entry.category_id !== categoryId ? 0.35 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1f2637",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#ffffff",
                    }}
                    formatter={(v) => fmtMoney(Number(v), data?.base_currency)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-col gap-1.5">
                {donut.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => toggleCategory(c.category_id)}
                    className={`flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5 ${
                      categoryId && c.category_id !== categoryId ? "opacity-40" : ""
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
      </div>

      <div className="glass p-5">
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
              contentStyle={{
                background: "#1f2637",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 12,
                fontSize: 12,
                color: "#ffffff",
              }}
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
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke="#c6f135"
              strokeWidth={2}
              fill="url(#nwGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
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
            to="/transactions"
            className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-300 transition-colors hover:text-lime-300"
          >
            Recent transactions
            <ChevronRight size={14} className="text-gray-500" />
          </Link>
          <div className="flex flex-col gap-2">
            {(data?.recent ?? []).slice(0, 7).map((tx) => (
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

function StatCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className={`glass glass-hover bg-gradient-to-br ${tint} to-transparent p-5`}>
      <div className="mb-3 flex items-center justify-between text-gray-400">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
