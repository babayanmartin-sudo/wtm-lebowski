import { X } from "lucide-react";
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`glass mt-10 w-full ${wide ? "max-w-3xl" : "max-w-md"} p-6`}>
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
export function CategorySelect({
  categories,
  value,
  onChange,
  kind,
  allowEmpty = true,
  emptyLabel = "— uncategorized —",
  className = "input",
}: {
  categories: Category[];
  value: number | null;
  onChange: (id: number | null) => void;
  kind?: "expense" | "income";
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const active = categories.filter((c) => !c.archived && (!kind || c.kind === kind));
  const tops = active.filter((c) => c.parent_id === null);
  return (
    <select
      className={className}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {tops.map((top) => {
        const children = active.filter((c) => c.parent_id === top.id);
        return (
          <optgroup key={top.id} label={top.name}>
            <option value={top.id}>{top.name}</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {top.name} / {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export const PALETTE = [
  "#6366f1", "#22d3ee", "#a78bfa", "#f472b6", "#fb923c",
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
