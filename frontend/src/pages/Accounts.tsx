import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Scale,
  Star,
  Trash2,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useInvalidating } from "../api/hooks";
import type { Account, Transaction } from "../api/types";
import { ColorPicker, Field, Modal, PageHeader } from "../components/ui";
import RateTicker from "../components/RateTicker";
import { fmtMoney } from "../lib/format";
import { ACCOUNT_ICON_KEYS, getAccountIcon } from "../lib/icons";

const TYPES = ["cash", "bank", "card", "savings"];
const CURRENCIES = ["AED", "USD", "EUR", "RUB", "AMD", "GBP", "CHF", "TRY", "GEL", "RSD"];

interface Draft {
  id?: number;
  name: string;
  type: string;
  currency: string;
  initial_balance: number | string;
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
  is_main: boolean;
  exclude_from_net_worth: boolean;
}

const empty: Draft = {
  name: "",
  type: "bank",
  currency: "AED",
  initial_balance: 0,
  color: "#c6f135",
  icon: "wallet",
  archived: false,
  sort_order: 0,
  is_main: false,
  exclude_from_net_worth: false,
};

export default function AccountsPage() {
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [reconciling, setReconciling] = useState<Account | null>(null);
  const [actualBalance, setActualBalance] = useState("");
  const [reconcileError, setReconcileError] = useState("");
  const [reconcileDone, setReconcileDone] = useState<Transaction | null | "noop">(null);
  const [viewMode, setViewMode] = useState<"card" | "list">(
    () => (localStorage.getItem("accounts-view") as "card" | "list") || "card",
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function setView(mode: "card" | "list") {
    setViewMode(mode);
    localStorage.setItem("accounts-view", mode);
  }

  const save = useInvalidating(async (d: Draft) => {
    const body = { ...d, id: undefined };
    return d.id ? api.put(`/api/accounts/${d.id}`, body) : api.post("/api/accounts", body);
  }, MONEY_KEYS);

  const remove = useInvalidating((id: number) => api.del(`/api/accounts/${id}`), MONEY_KEYS);

  const reconcile = useInvalidating(
    (args: { id: number; actual_balance: number }) =>
      api.post<{ account: Account; adjustment: Transaction | null }>(
        `/api/accounts/${args.id}/reconcile`,
        { actual_balance: args.actual_balance },
      ),
    MONEY_KEYS,
  );

  function openReconcile(acc: Account) {
    setReconciling(acc);
    setActualBalance(String(acc.balance));
    setReconcileError("");
    setReconcileDone(null);
  }

  async function submitReconcile() {
    setReconcileError("");
    try {
      const result = await reconcile.mutateAsync({
        id: reconciling!.id,
        actual_balance: parseFloat(actualBalance),
      });
      setReconcileDone(result.adjustment ?? "noop");
    } catch (e) {
      setReconcileError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function submit() {
    setError("");
    try {
      const body = { ...draft! };
      await save.mutateAsync(body);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function archive(acc: Account) {
    await save.mutateAsync({ ...acc, archived: !acc.archived });
  }

  async function setMain(acc: Account) {
    if (acc.is_main) return;
    await save.mutateAsync({ ...acc, is_main: true });
  }

  async function toggleNetWorth(acc: Account) {
    await save.mutateAsync({ ...acc, exclude_from_net_worth: !acc.exclude_from_net_worth });
  }

  async function del(acc: Account) {
    setPageError("");
    if (!confirm(`Delete account “${acc.name}”?`)) return;
    try {
      await remove.mutateAsync(acc.id);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const active = [...accounts]
    .filter((a) => !a.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const archived = accounts.filter((a) => a.archived);

  async function handleDragEnd(e: DragEndEvent) {
    const { active: dragged, over } = e;
    if (!over || dragged.id === over.id) return;
    const fromIdx = active.findIndex((a) => a.id === dragged.id);
    const toIdx = active.findIndex((a) => a.id === over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...active];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await Promise.all(
      reordered.map((acc, idx) =>
        acc.sort_order === idx ? null : save.mutateAsync({ ...acc, sort_order: idx }),
      ),
    );
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Cash, banks and cards"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 p-0.5">
              <button
                className={`rounded-md p-1.5 ${viewMode === "card" ? "bg-white/10 text-lime-300" : "text-gray-500"}`}
                title="Card view"
                onClick={() => setView("card")}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-white/10 text-lime-300" : "text-gray-500"}`}
                title="List view"
                onClick={() => setView("list")}
              >
                <List size={15} />
              </button>
            </div>
            <button className="btn-primary" onClick={() => setDraft({ ...empty })}>
              <Plus size={16} /> Add account
            </button>
          </div>
        }
      />
      {pageError && (
        <div className="glass mb-4 border-rose-400/30 p-3 text-sm text-rose-300">{pageError}</div>
      )}
      <RateTicker />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={active.map((a) => a.id)}
          strategy={viewMode === "list" ? verticalListSortingStrategy : rectSortingStrategy}
        >
          <div
            className={
              viewMode === "list"
                ? "flex flex-col gap-2"
                : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            }
          >
            {active.map((acc) => (
              <SortableAccountItem
                key={acc.id}
                acc={acc}
                viewMode={viewMode}
                onOpen={() => navigate(`/transactions?account=${acc.id}`)}
                onSetMain={() => setMain(acc)}
                onToggleNetWorth={() => toggleNetWorth(acc)}
                onReconcile={() => openReconcile(acc)}
                onEdit={() => setDraft({ ...acc })}
                onArchive={() => archive(acc)}
                onDelete={() => del(acc)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {archived.length > 0 && (
        <div
          className={`mt-4 ${
            viewMode === "list" ? "flex flex-col gap-2" : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {archived.map((acc) => (
            <AccountItemBody
              key={acc.id}
              acc={acc}
              viewMode={viewMode}
              onOpen={() => navigate(`/transactions?account=${acc.id}`)}
              onSetMain={() => setMain(acc)}
              onToggleNetWorth={() => toggleNetWorth(acc)}
              onReconcile={() => openReconcile(acc)}
              onEdit={() => setDraft({ ...acc })}
              onArchive={() => archive(acc)}
              onDelete={() => del(acc)}
            />
          ))}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit account" : "New account"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  className="input"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  className="input"
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Initial balance">
              <input
                type="text"
                inputMode="decimal"
                className="input"
                placeholder="0.00"
                value={draft.initial_balance}
                onChange={(e) => setDraft({ ...draft, initial_balance: e.target.value.replace(/,/g, ".") })}
              />
            </Field>
            <Field label="Color">
              <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </Field>
            <Field label="Icon">
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_ICON_KEYS.map((key) => {
                  const Icon = getAccountIcon(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDraft({ ...draft, icon: key })}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                        draft.icon === key
                          ? "border-lime-400 bg-lime-400/20 text-lime-300"
                          : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button className="btn-primary" onClick={submit} disabled={!draft.name.trim()}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {reconciling && (
        <Modal title={`Reconcile “${reconciling.name}”`} onClose={() => setReconciling(null)}>
          {reconcileDone !== null ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check size={22} />
              </div>
              {reconcileDone === "noop" ? (
                <p className="text-sm text-gray-300">Already matched — no adjustment needed.</p>
              ) : (
                <p className="text-sm text-gray-300">
                  Posted a {reconcileDone.kind === "income" ? "+" : "−"}
                  {fmtMoney(reconcileDone.amount, reconcileDone.currency)} adjustment.
                </p>
              )}
              <button className="btn-primary" onClick={() => setReconciling(null)}>
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-400">
                In the app: <span className="tabular-nums text-gray-200">{fmtMoney(reconciling.balance, reconciling.currency)}</span>.
                Enter what the bank actually shows — the difference is posted as an adjustment.
              </p>
              <Field label={`Actual balance (${reconciling.currency})`}>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  autoFocus
                />
              </Field>
              {(() => {
                const delta = Math.round((parseFloat(actualBalance || "0") - reconciling.balance) * 100) / 100;
                if (!actualBalance || Math.abs(delta) < 0.005) return null;
                return (
                  <p className={`text-xs ${delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    Will post {delta > 0 ? "an income" : "an expense"} adjustment of{" "}
                    {fmtMoney(Math.abs(delta), reconciling.currency)}.
                  </p>
                );
              })()}
              {reconcileError && <p className="text-xs text-rose-400">{reconcileError}</p>}
              <button
                className="btn-primary"
                onClick={submitReconcile}
                disabled={actualBalance === "" || Number.isNaN(parseFloat(actualBalance))}
              >
                <Scale size={14} /> Reconcile
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

interface AccountItemProps {
  acc: Account;
  viewMode: "card" | "list";
  onOpen: () => void;
  onSetMain: () => void;
  onToggleNetWorth: () => void;
  onReconcile: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  dragHandle?: ReactNode;
  dragRef?: (el: HTMLElement | null) => void;
  dragStyle?: CSSProperties;
}

function AccountItemBody({
  acc,
  viewMode,
  onOpen,
  onSetMain,
  onToggleNetWorth,
  onReconcile,
  onEdit,
  onArchive,
  onDelete,
  dragHandle,
  dragRef,
  dragStyle,
}: AccountItemProps) {
  const Icon = getAccountIcon(acc.icon);
  const actions = (
    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
      {dragHandle}
      <button
        className={`rounded-lg p-1.5 hover:bg-white/10 ${acc.is_main ? "text-lime-300" : "text-gray-400"}`}
        title={acc.is_main ? "This is your main account" : "Set as main account"}
        onClick={onSetMain}
      >
        <Star size={14} fill={acc.is_main ? "currentColor" : "none"} />
      </button>
      <button
        className={`rounded-lg p-1.5 hover:bg-white/10 ${acc.exclude_from_net_worth ? "text-amber-300" : "text-gray-400"}`}
        title={acc.exclude_from_net_worth ? "Excluded from net worth — click to include" : "Exclude from net worth"}
        onClick={onToggleNetWorth}
      >
        {acc.exclude_from_net_worth ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" title="Reconcile balance" onClick={onReconcile}>
        <Scale size={14} />
      </button>
      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" onClick={onEdit}>
        <Pencil size={14} />
      </button>
      <button
        className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
        title={acc.archived ? "Unarchive" : "Archive"}
        onClick={onArchive}
      >
        <Archive size={14} />
      </button>
      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );

  const badges = (
    <>
      {acc.is_main && (
        <span className="rounded-full bg-lime-400/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-lime-300 uppercase">
          Main
        </span>
      )}
      {acc.exclude_from_net_worth && (
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
          Excluded
        </span>
      )}
    </>
  );

  if (viewMode === "list") {
    return (
      <div
        ref={dragRef}
        style={dragStyle}
        onClick={onOpen}
        title="View transactions for this account"
        className={`glass glass-hover flex cursor-pointer items-center gap-3 p-3 ${acc.archived ? "opacity-50" : ""}`}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: acc.color }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{acc.name}</span>
            <span className="flex shrink-0 items-center gap-1.5">{badges}</span>
          </p>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {acc.type} · {acc.currency}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(acc.balance, acc.currency)}</p>
        {actions}
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      onClick={onOpen}
      title="View transactions for this account"
      className={`glass glass-hover cursor-pointer p-5 ${acc.archived ? "opacity-50" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: acc.color }}
        >
          <Icon size={18} />
        </div>
        <p className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{acc.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">{badges}</span>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {acc.type} · {acc.currency}
          {acc.archived ? " · archived" : ""}
        </p>
        {actions}
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums">{fmtMoney(acc.balance, acc.currency)}</p>
      {acc.currency !== "AED" && (
        <p className="text-sm text-gray-500 tabular-nums">≈ {fmtMoney(acc.balance_base, "AED")}</p>
      )}
    </div>
  );
}

function SortableAccountItem(props: Omit<AccountItemProps, "dragHandle" | "dragRef" | "dragStyle">) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.acc.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-lg p-1.5 text-gray-500 hover:bg-white/10 active:cursor-grabbing"
      title="Drag to reorder"
    >
      <GripVertical size={15} />
    </button>
  );
  return <AccountItemBody {...props} dragRef={setNodeRef} dragStyle={style} dragHandle={dragHandle} />;
}
