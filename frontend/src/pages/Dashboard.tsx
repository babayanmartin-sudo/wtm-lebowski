import { ArrowDownRight, ArrowUpRight, Check, SkipForward, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api/client";
import {
  MONEY_KEYS,
  useAccounts,
  useBudgetStatus,
  useCategories,
  useDashboard,
  useInvalidating,
  usePendingTemplates,
} from "../api/hooks";
import { ColorDot, ProgressBar } from "../components/ui";
import { currentMonth, fmtMoney, fmtMonth } from "../lib/format";

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data } = useDashboard(month);
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: budgetStatus = [] } = useBudgetStatus(month);
  const { data: pending = [] } = usePendingTemplates();

  const postTemplate = useInvalidating(
    (id: number) => api.post(`/api/templates/${id}/post`),
    MONEY_KEYS,
  );
  const skipTemplate = useInvalidating(
    (id: number) => api.post(`/api/templates/${id}/skip`),
    MONEY_KEYS,
  );

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const activeAccounts = accounts.filter((a) => !a.archived);
  const donut = (data?.by_category ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-400">Your money at a glance</p>
        </div>
        <input
          type="month"
          className="input w-40"
          value={month}
          onChange={(e) => setMonth(e.target.value || currentMonth())}
        />
      </div>

      {pending.length > 0 && (
        <div className="glass border-amber-400/30 p-4">
          <p className="mb-2 text-sm font-medium text-amber-300">Recurring due</p>
          <div className="flex flex-col gap-2">
            {pending.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">
                  {t.name} · {fmtMoney(t.amount)} · due {t.next_due}
                </span>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => postTemplate.mutate(t.id)}>
                  <Check size={13} /> Post
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => skipTemplate.mutate(t.id)}>
                  <SkipForward size={13} /> Skip
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Net worth"
          value={data ? fmtMoney(data.net_worth, data.base_currency) : "…"}
          icon={<TrendingUp size={18} />}
          tint="from-indigo-500/25"
        />
        <StatCard
          label={`Income · ${fmtMonth(month)}`}
          value={data ? fmtMoney(data.income, data.base_currency) : "…"}
          icon={<ArrowUpRight size={18} />}
          tint="from-emerald-500/25"
        />
        <StatCard
          label={`Spent · ${fmtMonth(month)}`}
          value={data ? fmtMoney(data.expense, data.base_currency) : "…"}
          icon={<ArrowDownRight size={18} />}
          tint="from-rose-500/25"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-gray-300">Income vs spending</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.monthly ?? []} barGap={4}>
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                stroke="#4b5563"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} width={50} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "#161a26",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={fmtMonth}
              />
              <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-5">
          <h2 className="mb-2 text-sm font-semibold text-gray-300">Spending by category</h2>
          {donut.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No expenses this month.</p>
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
                  >
                    {donut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#161a26",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v) => fmtMoney(Number(v), data?.base_currency)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-col gap-1.5">
                {donut.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <ColorDot color={c.color} />
                    <span className="flex-1 text-gray-300">{c.name}</span>
                    <span className="tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-300">Accounts</h2>
          <div className="flex flex-col gap-2.5">
            {activeAccounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <ColorDot color={a.color} />
                <span className="flex-1 text-gray-300">{a.name}</span>
                <span className="tabular-nums">{fmtMoney(a.balance, a.currency)}</span>
              </div>
            ))}
            {activeAccounts.length === 0 && <p className="text-sm text-gray-500">No accounts yet.</p>}
          </div>
        </div>

        <div className="glass p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-300">Budgets · {fmtMonth(month)}</h2>
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
          <h2 className="mb-3 text-sm font-semibold text-gray-300">Recent</h2>
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
                        ? "text-indigo-300"
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
