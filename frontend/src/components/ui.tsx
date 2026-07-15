import { AlertTriangle, Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { Category } from "../api/types";

/** Icon size scale — pick the smallest that fits the role, don't invent a
 * new number:
 *   12  inline chip/tag close (X), decorative connector icons
 *   14  row-action icons (edit/delete/archive/…), inline button icons
 *   16  nav icons (desktop sidebar), Modal close, section-header chevrons
 *   20  mobile-only nav/menu icons (bigger on purpose — touch target, not
 *       drift; keep desktop equivalents at 16)
 *   24+ hero/empty-state icons (e.g. Import's upload dropzone) — contextual,
 *       no fixed value */

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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
            <X size={16} />
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

/** Small inline spinner — was reimplemented ad hoc in one place (Profile's
 * refresh-rates button) and nowhere else, so every other loading query just
 * rendered blank/empty instead. */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-gray-500 ${className}`}
      aria-label="Loading"
    />
  );
}

/** Full-width loading placeholder for a page/section's primary query. */
export function LoadingState({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="glass flex items-center justify-center gap-2 p-12 text-sm text-gray-500">
      <Spinner />
      {text}
    </div>
  );
}

/** Full-width error placeholder for a failed page/section query — a failed
 * fetch used to silently render as an empty list, indistinguishable from
 * "you have no data yet." */
export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="glass flex flex-col items-center gap-2 p-12 text-center text-sm text-rose-300">
      <AlertTriangle size={20} />
      <span>Couldn't load this — {message}</span>
    </div>
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

export function ProgressBar({
  value,
  color,
  threshold = 80,
}: {
  value: number;
  color?: string;
  /** % at which the bar turns amber (below 100%, which is always "over budget" rose). */
  threshold?: number;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const barColor =
    color ?? (pct >= 100 ? "#f43f5e" : pct >= threshold ? "#f59e0b" : "#34d399");
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: barColor }}
      />
    </div>
  );
}

/** Success-state icon circle — was duplicated at two different sizes
 * (h-12/icon-22 vs h-14/icon-26) for the same "operation succeeded" concept. */
export function SuccessIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
      <Check size={22} />
    </div>
  );
}

/** "Pick one of N" pill toggle — was implemented two different ways
 * (outline+tint active state vs. solid-fill active state) across pages.
 * Standardized on the solid-fill treatment. */
export function SegmentedToggle<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  return (
    <div className="flex h-9 rounded-md border border-white/10 p-0.5 text-xs">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={`flex items-center justify-center rounded-sm px-2.5 py-1.5 transition-colors ${
            value === opt.value ? "bg-lime-400 text-black" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ColorDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

const BADGE_COLORS = {
  gray: "border-white/15 text-gray-400",
  rose: "border-rose-500/40 text-rose-300",
  amber: "border-amber-500/40 text-amber-300",
  emerald: "border-emerald-500/40 text-emerald-300",
  sky: "border-sky-500/40 text-sky-300",
  lime: "border-lime-400/40 text-lime-300",
} as const;

/** Small uppercase status/label tag — hairline border, no fill, mono type
 * (the one recipe every page used to hand-roll separately, filled/rounded-full before Signal Room). */
export function Badge({
  children,
  color = "gray",
  className = "",
  title,
}: {
  children: ReactNode;
  color?: keyof typeof BADGE_COLORS;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${BADGE_COLORS[color]} ${className}`}
    >
      {children}
    </span>
  );
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
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
    if (!open || !rootRef.current) return;
    // Positioned `fixed` (computed here) instead of `absolute` in the
    // normal flow — an ancestor with overflow-x-auto (e.g. Import's table
    // wrapper) forces overflow-y to auto too per the CSS spec, which was
    // clipping an absolutely-positioned panel instead of letting it float
    // above everything.
    const rect = rootRef.current.getBoundingClientRect();
    const PANEL_MIN_WIDTH = 224;
    const PANEL_MAX_HEIGHT = 320;
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    const openUp = rect.bottom + PANEL_MAX_HEIGHT > window.innerHeight && rect.top > PANEL_MAX_HEIGHT;
    const left = Math.min(
      Math.max(rect.left, 8),
      window.innerWidth - width - 8,
    );
    setPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left,
      width,
      openUp,
    });
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
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
        <span className={`min-w-0 truncate ${selected ? "" : "text-gray-500"}`}>{selected ?? emptyLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-500" />
      </button>
      {open && pos && (
        <div
          className="fixed z-50 max-h-72 overflow-hidden rounded-xl border border-white/10 bg-[var(--color-panel)] shadow-xl"
          style={{
            top: pos.openUp ? undefined : pos.top,
            bottom: pos.openUp ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
          }}
        >
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

/** Generic themed dropdown — same trigger/panel/checkmark shell as
 * CategorySelect (no search box), for plain option lists. Native <select>
 * uses the browser's own chrome and can't be restyled to match, which was
 * the actual reason two dropdowns sitting side by side looked unrelated. */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  emptyLabel = "",
  allowEmpty = true,
  className = "input",
  disabled = false,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: { value: T; label: string }[];
  emptyLabel?: string;
  allowEmpty?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setAlign(rect.left + Math.max(rect.width, 224) > window.innerWidth ? "right" : "left");
  }, [open]);

  const selected = options.find((o) => o.value === value)?.label ?? null;

  function pick(v: T | null) {
    onChange(v);
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
        <span className={`min-w-0 truncate ${selected ? "" : "text-gray-500"}`}>{selected ?? emptyLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-500" />
      </button>
      {open && (
        <div
          className={`absolute z-20 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-[var(--color-panel)] py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {allowEmpty && <Option label={emptyLabel} selected={value === null} onClick={() => pick(null)} />}
          {options.map((opt) => (
            <Option
              key={opt.value}
              label={opt.label}
              selected={value === opt.value}
              onClick={() => pick(opt.value)}
            />
          ))}
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
  "#ffb545", "#6366f1", "#22d3ee", "#a78bfa", "#f472b6", "#fb923c",
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
