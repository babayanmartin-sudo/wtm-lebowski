import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { MONEY_KEYS, useCategoryUsage, useInvalidating } from "../api/hooks";
import type { Account, Category, Loan, Transaction, TransactionSaveResult } from "../api/types";
import { today } from "../lib/format";
import { toast } from "../lib/toast";
import { CategorySelect, Field, Modal } from "./ui";

type Kind = "expense" | "income" | "transfer";

interface DraftSplit {
  category_id: number | null;
  amount: string;
  note: string;
}

export default function TransactionModal({
  accounts,
  categories,
  loans,
  existing,
  onClose,
}: {
  accounts: Account[];
  categories: Category[];
  loans: Loan[];
  existing: Transaction | null;
  onClose: () => void;
}) {
  const active = accounts.filter((a) => !a.archived);
  const mainAccount = active.find((a) => a.is_main) ?? active[0];
  const { data: categoryUsage = {} } = useCategoryUsage();
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense");
  const [date, setDate] = useState(existing?.date ?? today());
  const [accountId, setAccountId] = useState<number>(existing?.account_id ?? mainAccount?.id ?? 0);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [toAccountId, setToAccountId] = useState<number | null>(existing?.transfer_account_id ?? null);
  const [toAmount, setToAmount] = useState(existing?.transfer_amount ? String(existing.transfer_amount) : "");
  const [payee, setPayee] = useState(existing?.payee ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [loanId, setLoanId] = useState<number | null>(existing?.loan_id ?? null);
  const [splits, setSplits] = useState<DraftSplit[]>(
    existing && existing.kind !== "transfer"
      ? existing.splits.map((s) => ({ category_id: s.category_id, amount: String(s.amount), note: s.note }))
      : [{ category_id: null, amount: "", note: "" }],
  );
  const [error, setError] = useState("");
  const [isReturn, setIsReturn] = useState(
    () => !!existing && existing.kind === "income" && existing.splits.some((s) => s.category_id != null && categories.find((c) => c.id === s.category_id)?.kind === "expense"),
  );

  const save = useInvalidating(
    (body: object) =>
      existing
        ? api.put<TransactionSaveResult>(`/api/transactions/${existing.id}`, body)
        : api.post<TransactionSaveResult>("/api/transactions", body),
    MONEY_KEYS,
  );
  const remove = useInvalidating(
    () => api.del(`/api/transactions/${existing!.id}`),
    MONEY_KEYS,
  );

  const account = active.find((a) => a.id === accountId) ?? accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const crossCurrency = kind === "transfer" && toAccount && account && toAccount.currency !== account.currency;
  const amountNum = parseFloat(amount) || 0;
  const isSplit = splits.length > 1;
  const splitsTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const splitsMismatch = isSplit && Math.abs(splitsTotal - amountNum) > 0.005;
  const loanDirection = kind === "expense" ? "debt" : kind === "income" ? "receivable" : null;
  const matchingLoans = loans.filter((l) => !l.archived && l.direction === loanDirection);

  function changeKind(k: Kind) {
    setKind(k);
    const direction = k === "expense" ? "debt" : k === "income" ? "receivable" : null;
    if (!loans.some((l) => l.id === loanId && l.direction === direction)) setLoanId(null);
    if (k !== "income") setIsReturn(false);
  }

  const categorySelectKind = kind === "transfer" ? undefined : isReturn ? "expense" : kind;

  async function submit() {
    setError("");
    const body = {
      date,
      kind,
      account_id: accountId,
      amount: amountNum,
      payee: payee.trim(),
      note: note.trim(),
      transfer_account_id: kind === "transfer" ? toAccountId : null,
      transfer_amount:
        kind === "transfer" ? (crossCurrency ? parseFloat(toAmount) || 0 : amountNum) : null,
      loan_id: kind === "transfer" ? null : loanId,
      splits:
        kind === "transfer"
          ? []
          : (isSplit ? splits : [{ ...splits[0], amount: String(amountNum) }]).map((s) => ({
              category_id: s.category_id,
              amount: parseFloat(s.amount) || 0,
              note: s.note,
            })),
    };
    try {
      const result = await save.mutateAsync(body);
      for (const alert of result.budget_alerts) {
        toast(`${alert.category_name} is at ${alert.ratio}% of its budget`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function del() {
    await remove.mutateAsync(undefined);
    onClose();
  }

  const kindBtn = (k: Kind, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => changeKind(k)}
      className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
        kind === k ? activeClass : "text-gray-400 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal title={existing ? "Edit transaction" : "New transaction"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {kindBtn("expense", "Expense", "bg-rose-500/25 text-rose-200")}
          {kindBtn("income", "Income", "bg-emerald-500/25 text-emerald-200")}
          {kindBtn("transfer", "Transfer", "bg-sky-500/25 text-sky-200")}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={kind === "transfer" ? "From account" : "Account"}>
            <select className="input" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={`Amount${account ? ` (${account.currency})` : ""}`}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input text-lg"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>

        {kind === "transfer" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="To account">
              <select
                className="input"
                value={toAccountId ?? ""}
                onChange={(e) => setToAccountId(e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">— choose —</option>
                {active
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </Field>
            {crossCurrency && (
              <Field label={`Received (${toAccount!.currency})`}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                />
              </Field>
            )}
          </div>
        )}

        {kind !== "transfer" && (
          <>
            <Field label="Payee / merchant">
              <input
                className="input"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="e.g. Carrefour"
              />
            </Field>

            {matchingLoans.length > 0 && (
              <Field label="Link to loan (optional)">
                <select
                  className="input"
                  value={loanId ?? ""}
                  onChange={(e) => setLoanId(e.target.value === "" ? null : Number(e.target.value))}
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

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">
                  {isSplit ? `Splits (${splitsTotal.toFixed(2)} / ${amountNum.toFixed(2)})` : "Category"}
                </span>
                <button
                  type="button"
                  className="text-xs text-lime-300 hover:text-lime-200"
                  onClick={() => setSplits([...splits, { category_id: null, amount: "", note: "" }])}
                >
                  <Plus size={12} className="mr-0.5 inline" />
                  Add split
                </button>
              </div>
              {kind === "income" && (
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={isReturn}
                    onChange={(e) => setIsReturn(e.target.checked)}
                  />
                  This is a refund/return — categorize under an expense category
                </label>
              )}
              {splits.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CategorySelect
                    categories={categories}
                    kind={categorySelectKind}
                    value={s.category_id}
                    onChange={(id) => setSplits(splits.map((x, j) => (j === i ? { ...x, category_id: id } : x)))}
                    className="input min-w-0 flex-1"
                    usage={categoryUsage}
                  />
                  {isSplit && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        className="input w-28"
                        placeholder="0.00"
                        value={s.amount}
                        onChange={(e) =>
                          setSplits(splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                        }
                      />
                      <button
                        type="button"
                        className="rounded p-1.5 text-gray-500 hover:bg-rose-500/20 hover:text-rose-300"
                        onClick={() => setSplits(splits.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {splitsMismatch && (
                <p className="text-xs text-amber-400">Split amounts must add up to the total.</p>
              )}
            </div>
          </>
        )}

        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex gap-2">
          {existing && (
            <button className="btn-danger" onClick={del}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={submit}
            disabled={
              amountNum <= 0 ||
              splitsMismatch ||
              (kind === "transfer" && (!toAccountId || (crossCurrency ? !(parseFloat(toAmount) > 0) : false)))
            }
          >
            {existing ? "Save changes" : "Add transaction"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
