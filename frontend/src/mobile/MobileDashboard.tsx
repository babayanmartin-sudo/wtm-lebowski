import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useAccounts, useDashboard, useOverallBudgetStatus } from "../api/hooks";
import type { CategoryTotal } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { ErrorState, LoadingState } from "../components/ui";
import { AskWidget } from "../pages/Dashboard";
import { chartTooltipProps } from "../lib/charts";
import { fmtMoney } from "../lib/format";
import { type PickerMode, parseISO, periodFor, periodLabel, shiftAnchor, toISO } from "../lib/period";
import { useSessionState } from "../lib/session";

const ALL_MODES: PickerMode[] = ["day", "week", "month", "year", "custom"];

export default function MobileDashboard() {
  const navigate = useNavigate();
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("dashboard.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("dashboard.date", toISO(new Date()));
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);
  const { data, isLoading, isError, error } = useDashboard({
    date_from: period.from,
    date_to: period.to,
    category_id: categoryId ?? undefined,
  });
  const { data: accounts = [] } = useAccounts();
  const { data: overallBudget } = useOverallBudgetStatus(period.from.slice(0, 7));

  const activeAccounts = accounts.filter((a) => !a.archived);
  const donut = (data?.by_category ?? []).slice(0, 6);
  const donutIncome = (data?.by_category_income ?? []).slice(0, 6);
  const zoomed = pickerMode !== "month";

  function toggleCategory(id: number | null) {
    if (id === null) return;
    setCategoryId((prev) => (prev === id ? null : id));
  }

  function goToMonth() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
  }

  const reportsLink = useMemo(() => {
    const params = new URLSearchParams({ mode: pickerMode, date: pickerDate });
    return `/reports?${params.toString()}`;
  }, [pickerMode, pickerDate]);


  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Overview</h1>

      <div className="flex items-center gap-1">
        <button
          className="rounded-full bg-white/5 p-2 text-gray-400 active:bg-white/10 disabled:opacity-30"
          disabled={pickerMode === "custom"}
          onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1">
          <PeriodPicker
            mode={pickerMode}
            date={pickerDate}
            modes={ALL_MODES}
            triggerClassName="h-9 w-full"
            onChange={(m, d) => {
              setPickerMode(m);
              setPickerDate(d);
            }}
          />
        </div>
        <button
          className="rounded-full bg-white/5 p-2 text-gray-400 active:bg-white/10 disabled:opacity-30"
          disabled={pickerMode === "custom"}
          onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {zoomed && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          Filtering by
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
            {periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}
            <button onClick={goToMonth}>
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} />
      ) : (
        <>
      <Link
        to={reportsLink}
        className="text-xs font-semibold uppercase tracking-wide text-gray-500 active:text-lime-300"
      >
        Income vs spending
      </Link>
      <div className="flex flex-col rounded-2xl bg-white/5 px-4 py-1">
        <MobileStat
          label="Net worth"
          value={data ? fmtMoney(data.net_worth) : "…"}
          icon={<TrendingUp size={14} />}
          color="text-gray-100"
        />
        <MobileStat
          label="Income"
          value={data ? fmtMoney(data.income) : "…"}
          icon={<ArrowUpRight size={14} />}
          color="text-emerald-400"
        />
        <MobileStat
          label="Spent"
          value={data ? fmtMoney(data.expense) : "…"}
          icon={<ArrowDownRight size={14} />}
          color="text-rose-400"
        />
        {overallBudget?.cap != null && (
          <MobileStat
            label="Overall budget"
            value={`${fmtMoney(overallBudget.spent)} / ${fmtMoney(overallBudget.cap)}`}
            icon={<TrendingUp size={14} />}
            color={overallBudget.spent > overallBudget.cap ? "text-rose-400" : "text-gray-100"}
          />
        )}
      </div>

      <div>
        <button
          onClick={() => navigate("/accounts")}
          className="mb-3 flex w-full items-center justify-between text-sm font-semibold text-gray-200 active:text-lime-300"
        >
          Accounts
          <ChevronRight size={15} className="text-gray-500" />
        </button>
        <div className="flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
          {activeAccounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-xl px-2 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{a.name}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-gray-300">
                {fmtMoney(a.balance, a.currency)}
              </span>
            </div>
          ))}
          {activeAccounts.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">No accounts yet.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-200">Category</h2>
        <div className="flex flex-col gap-4 rounded-2xl bg-white/5 p-4">
          <MobileCategoryPie
            title="Expense"
            items={donut}
            emptyText="No expenses this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
          <MobileCategoryPie
            title="Income"
            items={donutIncome}
            emptyText="No income this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
        </div>
      </div>

      <AskWidget />
        </>
      )}
    </div>
  );
}

function MobileStat({
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
    <div className="flex items-center gap-2 py-2.5">
      <span className={color}>{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`ml-auto truncate text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function MobileCategoryPie({
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
  const activeCategoryId = categoryId != null && items.some((i) => i.category_id === categoryId)
    ? categoryId
    : null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">{emptyText}</p>
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
          <div className="mt-1 flex flex-col gap-2">
            {items.map((c) => (
              <button
                key={c.name}
                onClick={() => onToggle(c.category_id)}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs ${
                  activeCategoryId && c.category_id !== activeCategoryId ? "opacity-40" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate text-gray-300">{c.name}</span>
                <span className="shrink-0 tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
