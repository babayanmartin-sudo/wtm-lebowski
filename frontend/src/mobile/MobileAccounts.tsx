import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Eye, EyeOff, GripVertical, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import { api } from "../api/client";
import { MONEY_KEYS, useAccounts, useInvalidating } from "../api/hooks";
import type { Account } from "../api/types";
import { fmtMoney } from "../lib/format";
import { ACCOUNT_ICON_KEYS, getAccountIcon } from "../lib/icons";

const TYPES = ["cash", "bank", "card", "savings"];
const CURRENCIES = ["AED", "USD", "EUR", "RUB", "AMD", "GBP", "CHF", "TRY", "GEL", "RSD"];
const PALETTE = ["#c6f135", "#6366f1", "#22d3ee", "#f472b6", "#fb923c", "#34d399", "#f43f5e", "#a78bfa"];

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

export default function MobileAccounts() {
  const { data: accounts = [] } = useAccounts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const save = useInvalidating(async (d: Draft) => {
    const body = { ...d, id: undefined };
    return d.id ? api.put(`/api/accounts/${d.id}`, body) : api.post("/api/accounts", body);
  }, MONEY_KEYS);
  const remove = useInvalidating((id: number) => api.del(`/api/accounts/${id}`), MONEY_KEYS);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function del(acc: Account) {
    if (!confirm(`Delete account “${acc.name}”?`)) return;
    try {
      await remove.mutateAsync(acc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
    <div className="flex flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <button
          onClick={() => setDraft({ ...empty })}
          className="flex items-center gap-1.5 rounded-full bg-[#c6f135] px-3 py-1.5 text-xs font-semibold text-black active:scale-95"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={active.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {active.map((acc) => (
              <SortableMobileAccountCard
                key={acc.id}
                acc={acc}
                onSetMain={() => acc.is_main || save.mutate({ ...acc, is_main: true })}
                onToggleNetWorth={() => save.mutate({ ...acc, exclude_from_net_worth: !acc.exclude_from_net_worth })}
                onEdit={() => setDraft({ ...acc })}
                onArchive={() => save.mutate({ ...acc, archived: !acc.archived })}
                onDelete={() => del(acc)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {archived.length > 0 && (
        <div className="flex flex-col gap-3">
          {archived.map((acc) => (
            <MobileAccountCard
              key={acc.id}
              acc={acc}
              onSetMain={() => acc.is_main || save.mutate({ ...acc, is_main: true })}
              onToggleNetWorth={() => save.mutate({ ...acc, exclude_from_net_worth: !acc.exclude_from_net_worth })}
              onEdit={() => setDraft({ ...acc })}
              onArchive={() => save.mutate({ ...acc, archived: !acc.archived })}
              onDelete={() => del(acc)}
            />
          ))}
        </div>
      )}
      {accounts.length === 0 && <p className="py-10 text-center text-sm text-gray-500">No accounts yet.</p>}

      {draft && (
        <div
          className="m-sheet-backdrop fixed inset-0 z-30 flex items-end bg-black/60"
          onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="m-sheet w-full rounded-t-3xl border-t border-white/10 bg-[#111309] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{draft.id ? "Edit account" : "New account"}</h2>
              <button onClick={() => setDraft(null)} className="rounded-full p-1.5 text-gray-400 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <input
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#c6f135]/50"
                placeholder="Account name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                  value={draft.currency}
                  onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                inputMode="decimal"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none"
                placeholder="Initial balance"
                value={draft.initial_balance}
                onChange={(e) => setDraft({ ...draft, initial_balance: e.target.value.replace(/,/g, ".") })}
              />
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                    className={`h-7 w-7 rounded-full transition-transform ${
                      draft.color === c ? "scale-110 ring-2 ring-white" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_ICON_KEYS.map((key) => {
                  const Icon = getAccountIcon(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setDraft({ ...draft, icon: key })}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                        draft.icon === key
                          ? "border-[#c6f135] bg-[#c6f135]/20 text-[#c6f135]"
                          : "border-white/10 bg-white/5 text-gray-400"
                      }`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={submit}
                disabled={!draft.name.trim()}
                className="mt-1 rounded-2xl bg-[#c6f135] py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MobileAccountCardProps {
  acc: Account;
  onSetMain: () => void;
  onToggleNetWorth: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  dragHandle?: ReactNode;
  dragRef?: (el: HTMLElement | null) => void;
  dragStyle?: CSSProperties;
}

function MobileAccountCard({
  acc,
  onSetMain,
  onToggleNetWorth,
  onEdit,
  onArchive,
  onDelete,
  dragHandle,
  dragRef,
  dragStyle,
}: MobileAccountCardProps) {
  const Icon = getAccountIcon(acc.icon);
  return (
    <div
      ref={dragRef}
      style={{ background: `linear-gradient(135deg, ${acc.color}, ${acc.color}bb)`, ...dragStyle }}
      className={`relative overflow-hidden rounded-3xl p-5 text-black ${acc.archived ? "opacity-50" : ""}`}
    >
      <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-black/5" />
      <div className="flex items-start justify-between">
        <Icon size={22} className="shrink-0 text-black/70" />
        <div className="flex shrink-0 gap-1">
          {dragHandle}
          <button onClick={onSetMain} className="rounded-full bg-black/10 p-1.5 active:bg-black/20">
            <Star size={13} fill={acc.is_main ? "currentColor" : "none"} />
          </button>
          <button
            onClick={onToggleNetWorth}
            className={`rounded-full p-1.5 ${
              acc.exclude_from_net_worth ? "bg-black/30 text-black active:bg-black/40" : "bg-black/10 active:bg-black/20"
            }`}
          >
            {acc.exclude_from_net_worth ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button onClick={onEdit} className="rounded-full bg-black/10 p-1.5 active:bg-black/20">
            <Pencil size={13} />
          </button>
          <button
            onClick={onArchive}
            className={`rounded-full p-1.5 ${
              acc.archived ? "bg-black/30 text-black active:bg-black/40" : "bg-black/10 active:bg-black/20"
            }`}
          >
            <Archive size={13} />
          </button>
          <button onClick={onDelete} className="rounded-full bg-black/10 p-1.5 active:bg-black/20">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <p className="mt-5 truncate text-xs font-medium text-black/60 uppercase">
        {acc.name} · {acc.type}
        {acc.is_main ? " · main" : ""}
        {acc.exclude_from_net_worth ? " · excluded" : ""}
      </p>
      <p className="truncate text-2xl font-bold tabular-nums">{fmtMoney(acc.balance, acc.currency)}</p>
      {acc.currency !== "AED" && (
        <p className="truncate text-xs text-black/60 tabular-nums">≈ {fmtMoney(acc.balance_base, "AED")}</p>
      )}
    </div>
  );
}

function SortableMobileAccountCard(props: Omit<MobileAccountCardProps, "dragHandle" | "dragRef" | "dragStyle">) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: props.acc.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-full bg-black/10 p-1.5 text-black/70 active:cursor-grabbing"
    >
      <GripVertical size={13} />
    </button>
  );
  return <MobileAccountCard {...props} dragRef={setNodeRef} dragStyle={style} dragHandle={dragHandle} />;
}
