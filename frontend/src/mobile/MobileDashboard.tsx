import { ArrowDownRight, ArrowUpRight, Check, SkipForward, Wallet } from "lucide-react";

import { api } from "../api/client";
import {
  MONEY_KEYS,
  useAccounts,
  useCategories,
  useDashboard,
  useInvalidating,
  usePendingTemplates,
} from "../api/hooks";
import { fmtMoney } from "../lib/format";
import { monthPeriod, toISO } from "../lib/period";

export default function MobileDashboard() {
  const period = monthPeriod(new Date());
  const { data } = useDashboard({ date_from: period.from, date_to: period.to });
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: pending = [] } = usePendingTemplates();

  const postTemplate = useInvalidating((id: number) => api.post(`/api/templates/${id}/post`), MONEY_KEYS);
  const skipTemplate = useInvalidating((id: number) => api.post(`/api/templates/${id}/skip`), MONEY_KEYS);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const activeAccounts = accounts.filter((a) => !a.archived);
  const monthLabel = toISO(new Date()).slice(0, 7);

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Overview</p>
          <h1 className="text-xl font-semibold">Your money, {monthLabel}</h1>
        </div>
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
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-emerald-300">
            <ArrowUpRight size={16} />
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">Income</span>
          </div>
          <p className="truncate text-lg font-semibold tabular-nums">
            {data ? fmtMoney(data.income, data.base_currency) : "…"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-rose-300">
            <ArrowDownRight size={16} />
            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">Spent</span>
          </div>
          <p className="truncate text-lg font-semibold tabular-nums">
            {data ? fmtMoney(data.expense, data.base_currency) : "…"}
          </p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl bg-amber-400/10 p-4">
          <p className="mb-2 text-xs font-semibold text-amber-300">Recurring due</p>
          <div className="flex flex-col gap-2">
            {pending.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-200">
                  {t.name} · {fmtMoney(t.amount)}
                </span>
                <button
                  className="rounded-full bg-white/10 p-1.5 text-emerald-300 active:bg-white/20"
                  onClick={() => postTemplate.mutate(t.id)}
                >
                  <Check size={14} />
                </button>
                <button
                  className="rounded-full bg-white/10 p-1.5 text-gray-300 active:bg-white/20"
                  onClick={() => skipTemplate.mutate(t.id)}
                >
                  <SkipForward size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
        <h2 className="mb-3 text-sm font-semibold text-gray-200">Recent transactions</h2>
        <div className="flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
          {(data?.recent ?? []).slice(0, 8).map((tx) => {
            const cat = tx.splits[0]?.category_id ? categoryById.get(tx.splits[0].category_id) : null;
            return (
              <div key={tx.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-black"
                  style={{ background: cat?.color ?? "#c6f135" }}
                >
                  {(tx.payee || tx.note || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-100">
                    {tx.payee || (tx.kind === "transfer" ? "Transfer" : tx.note || "—")}
                  </p>
                  <p className="truncate text-xs text-gray-500">{tx.date}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    tx.kind === "income" ? "text-emerald-300" : "text-gray-200"
                  }`}
                >
                  {tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}
                  {fmtMoney(tx.amount, tx.currency)}
                </span>
              </div>
            );
          })}
          {(data?.recent ?? []).length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-gray-500">No transactions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
