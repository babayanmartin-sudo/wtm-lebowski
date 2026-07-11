import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { Category } from "../api/types";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`glass mt-10 w-full ${wide ? "max-w-3xl" : "max-w-md"} p-4 sm:p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass flex items-center justify-center p-12 text-sm text-gray-500">{text}</div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const barColor =
    color ?? (pct >= 100 ? "#f43f5e" : pct >= 80 ? "#f59e0b" : "#34d399");
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: barColor }}
      />
    </div>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

/** Select with top-level categories as optgroups and children indented. */
/** Sentinel id for the "Uncategorized" filter option — no real category uses a negative id. */
export const UNCATEGORIZED_ID = -1;

export function CategorySelect({
  categories,
  value,
  onChange,
  kind,
  allowEmpty = true,
  emptyLabel = "— uncategorized —",
  uncategorizedOption = false,
  className = "input",
  disabled = false,
  disabledIds,
  usage,
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
  kind?: "expense" | "income";
  allowEmpty?: boolean;
  emptyLabel?: string;
  uncategorizedOption?: boolean;
  className?: string;
  disabled?: boolean;
  disabledIds?: Set<number>;
  /** Split-count per top-level category id — enables the "most used" sort toggle when provided. */
  usage?: Record<number, number>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"alpha" | "usage">("alpha");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const active = categories.filter((c) => !c.archived && (!kind || c.kind === kind));
  const tops = active.filter((c) => c.parent_id === null);
  const sortedTops = usage
    ? [...tops].sort((a, b) =>
        sortMode === "usage" ? (usage[b.id] ?? 0) - (usage[a.id] ?? 0) : a.name.localeCompare(b.name),
      )
    : tops;

  const q = query.trim().toLowerCase();
  const groups = sortedTops
    .map((top) => {
      const children = active.filter((c) => c.parent_id === top.id);
      const topMatches = !q || top.name.toLowerCase().includes(q);
      const matchingChildren = q ? children.filter((c) => c.name.toLowerCase().includes(q)) : children;
      if (q && !topMatches && matchingChildren.length === 0) return null;
      return { top, children: topMatches ? children : matchingChildren };
    })
    .filter((g): g is { top: Category; children: Category[] } => g !== null);

  const selected =
    value === UNCATEGORIZED_ID
      ? "Uncategorized"
      : active.find((c) => c.id === value)
        ? (() => {
            const c = active.find((c) => c.id === value)!;
            const parent = c.parent_id ? active.find((p) => p.id === c.parent_id) : null;
            return parent ? `${parent.name} / ${c.name}` : c.name;
          })()
        : null;

  function pick(id: number | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-1 bg-transparent text-left disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "" : "text-gray-500"}>{selected ?? emptyLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full min-w-[14rem] overflow-hidden rounded-xl border border-white/10 bg-[#12130d] shadow-xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1.5">
            <Search size={13} className="shrink-0 text-gray-500" />
            <input
              ref={searchRef}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
              placeholder="Search categories…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {usage && (
            <div className="flex gap-1 border-b border-white/10 px-2 py-1 text-xs">
              <button
                type="button"
                className={`rounded px-1.5 py-0.5 ${sortMode === "alpha" ? "bg-white/10 text-gray-200" : "text-gray-500"}`}
                onClick={() => setSortMode("alpha")}
              >
                A–Z
              </button>
              <button
                type="button"
                className={`rounded px-1.5 py-0.5 ${sortMode === "usage" ? "bg-white/10 text-gray-200" : "text-gray-500"}`}
                onClick={() => setSortMode("usage")}
              >
                Most used
              </button>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {allowEmpty && (
              <Option label={emptyLabel} selected={value === null} onClick={() => pick(null)} />
            )}
            {uncategorizedOption && (
              <Option
                label="Uncategorized"
                selected={value === UNCATEGORIZED_ID}
                onClick={() => pick(UNCATEGORIZED_ID)}
              />
            )}
            {groups.map(({ top, children }) => (
              <div key={top.id}>
                <Option
                  label={top.name}
                  selected={value === top.id}
                  disabled={disabledIds?.has(top.id)}
                  onClick={() => pick(top.id)}
                />
                {children.map((c) => (
                  <Option
                    key={c.id}
                    label={c.name}
                    indent
                    selected={value === c.id}
                    disabled={disabledIds?.has(c.id)}
                    onClick={() => pick(c.id)}
                  />
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  disabled,
  indent,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${
        indent ? "pl-7 text-gray-400" : ""
      }`}
    >
      <span className="w-3.5 shrink-0">{selected && <Check size={13} />}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export const PALETTE = [
  "#c6f135", "#6366f1", "#22d3ee", "#a78bfa", "#f472b6", "#fb923c",
  "#facc15", "#34d399", "#f43f5e", "#38bdf8", "#c084fc",
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full transition-transform ${value === c ? "scale-110 ring-2 ring-white" : "hover:scale-110"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
