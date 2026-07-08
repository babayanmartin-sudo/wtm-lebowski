import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useAccounts, useDashboard } from "../api/hooks";
import { fmtMoney } from "../lib/format";
import { type PickerMode, parseISO, periodFor, periodLabel, shiftAnchor, toISO } from "../lib/period";
import { useSessionState } from "../lib/session";
import PeriodPicker from "../components/PeriodPicker";

const ALL_MODES: PickerMode[] = ["day", "week", "month", "year"];

export default function MobileDashboard() {
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("dashboard.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("dashboard.date", toISO(new Date()));
  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate)), [pickerMode, pickerDate]);
  const { data } = useDashboard({ date_from: period.from, date_to: period.to });
  const { data: accounts = [] } = useAccounts();

  const activeAccounts = accounts.filter((a) => !a.archived);
  const donut = (data?.by_category ?? []).slice(0, 6);

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <div>
        <p className="text-sm text-gray-400">Overview</p>
        <h1 className="text-xl font-semibold">{periodLabel(pickerMode, period.from)}</h1>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="rounded-full bg-white/5 p-2 text-gray-400 active:bg-white/10"
          onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1">
          <PeriodPicker
            mode={pickerMode}
            date={pickerDate}
            modes={ALL_MODES}
            triggerClassName="w-full"
            onChange={(m, d) => {
              setPickerMode(m);
              setPickerDate(d);
            }}
          />
        </div>
        <button
          className="rounded-full bg-white/5 p-2 text-gray-400 active:bg-white/10"
          onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#c6f135] to-[#8fd11a] p-5 text-black">
        <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full bg-black/5" />
        <p className="text-xs font-medium tracking-wide text-black/60 uppercase">Net worth</p>
        <p className="mt-1 truncate text-3xl font-bold tabular-nums">
          {data ? fmtMoney(data.net_worth, data.base_currency) : "…"}
        </p>
        <p className="mt-1 text-xs text-black/60">{activeAccounts.length} active accounts</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-2xl bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-emerald-300">
            <ArrowUpRight size={16} />
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">Income</span>
          </div>
          <p className="truncate text-lg font-semibold tabular-nums">
            {data ? fmtMoney(data.income, data.base_currency) : "…"}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-rose-300">
            <ArrowDownRight size={16} />
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">Spent</span>
          </div>
          <p className="truncate text-lg font-semibold tabular-nums">
            {data ? fmtMoney(data.expense, data.base_currency) : "…"}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Accounts</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {activeAccounts.map((a) => (
            <div
              key={a.id}
              className="flex w-40 shrink-0 flex-col justify-between rounded-2xl p-4"
              style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}99)` }}
            >
              <Wallet size={18} className="text-white/80" />
              <div className="mt-4">
                <p className="truncate text-xs text-white/70">{a.name}</p>
                <p className="truncate text-sm font-semibold text-white tabular-nums">
                  {fmtMoney(a.balance, a.currency)}
                </p>
              </div>
            </div>
          ))}
          {activeAccounts.length === 0 && <p className="text-sm text-gray-500">No accounts yet.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-200">Spending by category</h2>
        <div className="rounded-2xl bg-white/5 p-4">
          {donut.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No expenses this month.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={75}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {donut.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#374151",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#ffffff",
                      padding: 8,
                    }}
                    wrapperStyle={{ color: "#ffffff" }}
                    labelStyle={{ color: "#ffffff" }}
                    itemStyle={{ color: "#ffffff" }}
                    formatter={(v, name) => [fmtMoney(Number(v), data?.base_currency), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-col gap-2">
                {donut.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1 truncate text-gray-300">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
