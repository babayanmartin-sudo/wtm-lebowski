import { ChevronLeft, ChevronRight, Plus, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAccounts, useCategories, useLoans, useTransactions } from "../api/hooks";
import type { Transaction } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { CategorySelect, ErrorState, LoadingState, Select, UNCATEGORIZED_ID } from "../components/ui";
import TransactionModal from "../components/TransactionModal";
import { fmtMoney } from "../lib/format";
import { type PickerMode, parseISO, periodFor, periodLabel, shiftAnchor, toISO } from "../lib/period";
import { useSessionState } from "../lib/session";

const PAGE_SIZE = 30;
const ALL_MODES: PickerMode[] = ["day", "week", "month", "year", "custom"];

export default function MobileTransactions() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: loans = [] } = useLoans();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useSessionState("transactions.q", "");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [accountId, setAccountId] = useSessionState(
    "transactions.account",
    "",
    searchParams.get("account") ?? undefined,
  );
  const [categoryId, setCategoryId] = useSessionState<number | null>(
    "transactions.category",
    null,
    searchParams.get("category") ? Number(searchParams.get("category")) : undefined,
  );
  const [kind, setKind] = useSessionState("transactions.kind", "");
  const [amountOp, setAmountOp] = useSessionState<"" | "eq" | "gt" | "lt">("transactions.amountOp", "");
  const [amountValue, setAmountValue] = useSessionState("transactions.amountValue", "");
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>(
    "transactions.periodMode",
    "month",
    (searchParams.get("mode") as PickerMode) ?? undefined,
  );
  const [pickerDate, setPickerDate] = useSessionState(
    "transactions.periodDate",
    toISO(new Date()),
    searchParams.get("date") ?? undefined,
  );

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);
  const isCurrentMonth = pickerMode === "month" && pickerDate.slice(0, 7) === toISO(new Date()).slice(0, 7);

  const { data, isLoading, isError, error } = useTransactions({
    q,
    account_id: accountId,
    category_id: categoryId && categoryId !== UNCATEGORIZED_ID ? categoryId : undefined,
    uncategorized: categoryId === UNCATEGORIZED_ID ? "true" : undefined,
    kind,
    amount_op: amountOp || undefined,
    amount_value: amountOp && amountValue !== "" ? Number(amountValue) : undefined,
    date_from: period.from,
    date_to: period.to,
    limit: PAGE_SIZE,
    offset: 0,
  });

  const hasActiveFilter = Boolean(accountId || categoryId || kind || (amountOp && amountValue !== ""));
  const hasFilterChips = hasActiveFilter || !isCurrentMonth;

  function clearFilters() {
    setAccountId("");
    setCategoryId(null);
    setKind("");
    setAmountOp("");
    setAmountValue("");
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const items = data?.items ?? [];

  const groups = new Map<string, Transaction[]>();
  for (const tx of items) {
    const list = groups.get(tx.date) ?? [];
    list.push(tx);
    groups.set(tx.date, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activity</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-[#ffb545] px-3 py-1.5 text-xs font-semibold text-black active:scale-95"
        >
          <Plus size={14} /> Add
        </button>
      </div>

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
        {!isCurrentMonth && (
          <button
            className="rounded-full bg-white/5 p-2 text-gray-400 active:bg-white/10"
            title="Back to current month"
            onClick={() => {
              setPickerMode("month");
              setPickerDate(toISO(new Date()));
            }}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="absolute top-3 left-3 text-gray-500" />
        <input
          className="input pl-9"
          placeholder="Search payee, note…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <button
        onClick={() => setShowFilters((v) => !v)}
        className="input flex items-center justify-between text-gray-300"
      >
        Filters{hasActiveFilter ? " (active)" : ""}
        <span className="text-xs text-gray-500">{showFilters ? "Hide" : "Show"}</span>
      </button>

      {showFilters && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <Select
            className="input"
            value={accountId === "" ? null : Number(accountId)}
            onChange={(v) => setAccountId(v === null ? "" : String(v))}
            emptyLabel="All accounts"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            emptyLabel="All categories"
            uncategorizedOption
            className="input"
          />
          <Select
            className="input"
            value={kind === "" ? null : kind}
            onChange={(v) => setKind(v === null ? "" : v)}
            emptyLabel="All kinds"
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
              { value: "transfer", label: "Transfer" },
            ]}
          />
          <div className="flex items-center gap-2">
            <Select
              className="input"
              value={amountOp === "" ? null : amountOp}
              onChange={(v) => setAmountOp(v === null ? "" : v)}
              emptyLabel="Amount"
              options={[
                { value: "eq", label: "=" },
                { value: "gt", label: ">" },
                { value: "lt", label: "<" },
              ]}
            />
            {amountOp && (
              <input
                type="number"
                step="0.01"
                className="input min-w-0 flex-1"
                placeholder="0.00"
                value={amountValue}
                onChange={(e) => setAmountValue(e.target.value)}
              />
            )}
          </div>
          {hasActiveFilter && (
            <button onClick={clearFilters} className="flex items-center justify-center gap-1.5 py-1 text-xs text-gray-400">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {hasFilterChips && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          Filtering by
          {!isCurrentMonth && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}
              <button onClick={() => { setPickerMode("month"); setPickerDate(toISO(new Date())); }}>
                <X size={12} />
              </button>
            </span>
          )}
          {accountId && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {accounts.find((a) => String(a.id) === accountId)?.name ?? accountId}
              <button onClick={() => setAccountId("")}>
                <X size={12} />
              </button>
            </span>
          )}
          {categoryId && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {categoryId === UNCATEGORIZED_ID ? "Uncategorized" : (categoryById.get(categoryId)?.name ?? categoryId)}
              <button onClick={() => setCategoryId(null)}>
                <X size={12} />
              </button>
            </span>
          )}
          {kind && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {kind}
              <button onClick={() => setKind("")}>
                <X size={12} />
              </button>
            </span>
          )}
          {amountOp && amountValue !== "" && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              amount {{ eq: "=", gt: ">", lt: "<" }[amountOp]} {amountValue}
              <button onClick={() => { setAmountOp(""); setAmountValue(""); }}>
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {hasActiveFilter && data && (
        <div
          className={`flex items-center justify-between rounded-2xl border-l-4 bg-white/5 p-3 ${
            data.sum_base >= 0 ? "border-l-emerald-400" : "border-l-rose-400"
          }`}
        >
          <span className="text-xs text-gray-400">Net · {data.total} matching</span>
          <span
            className={`text-base font-semibold tabular-nums ${
              data.sum_base >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {fmtMoney(data.sum_base)}
          </span>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} />
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">No transactions match.</p>
      ) : (
        [...groups.entries()].map(([date, txs]) => (
          <div key={date}>
            <p className="mb-2 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase">{date}</p>
            <div className="flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
              {txs.map((tx) => {
                const acc = accounts.find((a) => a.id === tx.account_id);
                const cat = tx.splits[0]?.category_id ? categoryById.get(tx.splits[0].category_id) : null;
                return (
                  <button
                    key={tx.id}
                    onClick={() => setEditing(tx)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-white/5"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-black"
                      style={{ background: cat?.color ?? "#ffb545" }}
                    >
                      {(tx.payee || tx.note || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-100">
                        {tx.payee || (tx.kind === "transfer" ? "Transfer" : tx.note || "—")}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {acc?.name}
                        {cat ? ` · ${cat.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        tx.kind === "income"
                          ? "text-emerald-300"
                          : tx.kind === "transfer"
                            ? "text-sky-300"
                            : "text-gray-200"
                      }`}
                    >
                      {tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}
                      {fmtMoney(tx.amount, tx.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {(creating || editing) && (
        <TransactionModal
          accounts={accounts}
          categories={categories}
          loans={loans}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
