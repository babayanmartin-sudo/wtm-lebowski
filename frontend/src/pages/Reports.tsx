import { Check, ChevronDown, Download, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAccounts, useCategories, useDeleteReport, useReportPreview, useSaveReport, useSavedReports } from "../api/hooks";
import { api } from "../api/client";
import type { Category, ReportFilters } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { ColorDot, ErrorState, Field, LoadingState, Modal, PageHeader, Select } from "../components/ui";
import { CHART_COLORS, chartTooltipProps } from "../lib/charts";
import { fmtMoney } from "../lib/format";
import { bucketLabel, encodeCustomRange, type PickerMode, parseISO, periodFor, periodLabel, toISO } from "../lib/period";
import { useSessionState } from "../lib/session";
import { toast } from "../lib/toast";

export default function ReportsPage() {
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("reports.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("reports.date", toISO(new Date()));
  const [accountId, setAccountId] = useSessionState<number | null>("reports.account", null);
  const [includeIds, setIncludeIds] = useSessionState<number[]>("reports.include", []);
  const [excludeIds, setExcludeIds] = useSessionState<number[]>("reports.exclude", []);
  const [saveOpen, setSaveOpen] = useState(false);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);

  const filters = useMemo(
    () => ({
      date_from: period.from,
      date_to: period.to,
      account_id: accountId ?? undefined,
      include_category_ids: includeIds,
      exclude_category_ids: excludeIds,
    }),
    [period, accountId, includeIds, excludeIds],
  );

  const { data, isLoading, isError, error } = useReportPreview(filters);
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: savedReports = [] } = useSavedReports();
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const saveReport = useSaveReport();
  const deleteReport = useDeleteReport();

  const zoomed = pickerMode !== "month";
  const hasFilter = accountId !== null || includeIds.length > 0 || excludeIds.length > 0;
  const filterAccount = accounts.find((a) => a.id === accountId);

  function resetView() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
    setAccountId(null);
    setIncludeIds([]);
    setExcludeIds([]);
    setActiveReportId(null);
  }

  function removeInclude(id: number) {
    setIncludeIds((v) => v.filter((i) => i !== id));
    setActiveReportId(null);
  }

  function removeExclude(id: number) {
    setExcludeIds((v) => v.filter((i) => i !== id));
    setActiveReportId(null);
  }

  function applyPreset(preset: "month" | "year" | "last30" | "last90") {
    const today = new Date();
    if (preset === "month") {
      setPickerMode("month");
      setPickerDate(toISO(today));
    } else if (preset === "year") {
      setPickerMode("year");
      setPickerDate(toISO(today));
    } else {
      const days = preset === "last30" ? 29 : 89;
      const from = new Date(today);
      from.setDate(from.getDate() - days);
      setPickerMode("custom");
      setPickerDate(encodeCustomRange(toISO(from), toISO(today)));
    }
    setActiveReportId(null);
  }

  function loadReport(id: number, f: ReportFilters) {
    setActiveReportId(id);
    setPickerMode("custom");
    setPickerDate(encodeCustomRange(f.date_from, f.date_to));
    setAccountId(f.account_id ?? null);
    setIncludeIds(f.include_category_ids ?? []);
    setExcludeIds(f.exclude_category_ids ?? []);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reports"
        subtitle="Build a filtered view of your transactions, then save it for later"
        actions={
          <button className="btn-primary" onClick={() => setSaveOpen(true)}>
            <Save size={16} /> Save report
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset("month")}>
          This month
        </button>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset("year")}>
          This year
        </button>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset("last30")}>
          Last 30 days
        </button>
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => applyPreset("last90")}>
          Last 90 days
        </button>
      </div>

      <div className="glass flex flex-wrap items-center gap-2 p-3">
        <PeriodPicker
          mode={pickerMode}
          date={pickerDate}
          modes={["day", "week", "month", "year", "custom"]}
          triggerClassName="h-9 w-56"
          onChange={(m, d) => {
            setPickerMode(m);
            setPickerDate(d);
            setActiveReportId(null);
          }}
        />
        <Select
          className="input h-9 w-40"
          value={accountId}
          onChange={(v) => {
            setAccountId(v);
            setActiveReportId(null);
          }}
          emptyLabel="Accounts"
          options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
        />
        <CategoryMultiSelect
          categories={categories}
          label="Include categories"
          value={includeIds}
          onChange={(v) => {
            setIncludeIds(v);
            setActiveReportId(null);
          }}
        />
        <CategoryMultiSelect
          categories={categories}
          label="Exclude categories"
          value={excludeIds}
          onChange={(v) => {
            setExcludeIds(v);
            setActiveReportId(null);
          }}
        />
        {(zoomed || hasFilter) && (
          <button className="btn-ghost h-9 px-3 text-sm" title="Back to current month, clear filters" onClick={resetView}>
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      {(hasFilter || zoomed) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          Filtering by
          {zoomed && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}
              <button
                onClick={() => {
                  setPickerMode("month");
                  setPickerDate(toISO(new Date()));
                  setActiveReportId(null);
                }}
              >
                <X size={12} />
              </button>
            </span>
          )}
          {filterAccount && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              {filterAccount.name}
              <button
                onClick={() => {
                  setAccountId(null);
                  setActiveReportId(null);
                }}
              >
                <X size={12} />
              </button>
            </span>
          )}
          {includeIds.map((id) => {
            const cat = categoryById.get(id);
            if (!cat) return null;
            return (
              <span key={`inc-${id}`} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                <ColorDot color={cat.color} />
                {cat.name}
                <button onClick={() => removeInclude(id)}>
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {excludeIds.map((id) => {
            const cat = categoryById.get(id);
            if (!cat) return null;
            return (
              <span key={`exc-${id}`} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                <ColorDot color={cat.color} />
                not {cat.name}
                <button onClick={() => removeExclude(id)}>
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} />
      ) : (
        <>
          <div className="glass grid grid-cols-1 divide-y divide-[var(--color-line)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <StatCell label="Income" value={data ? fmtMoney(data.income, data.base_currency) : "…"} color="text-emerald-400" />
            <StatCell label="Expense" value={data ? fmtMoney(data.expense, data.base_currency) : "…"} color="text-rose-400" />
            <StatCell label="Transactions" value={data ? String(data.count) : "…"} />
            <StatCell label="Average" value={data ? fmtMoney(data.average, data.base_currency) : "…"} />
          </div>

          <div className="glass p-5">
            <h2 className="mb-4 font-mono text-xs tracking-wide text-gray-500 uppercase">Income vs spending</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.series ?? []} barGap={4}>
                <XAxis
                  dataKey="label"
                  tickFormatter={(v) => bucketLabel(v, data?.series_granularity ?? "day")}
                  stroke={CHART_COLORS.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  {...chartTooltipProps}
                  formatter={(v, name) => [v, name]}
                  labelFormatter={(v) => bucketLabel(String(v), data?.series_granularity ?? "day")}
                />
                <Bar dataKey="income" fill={CHART_COLORS.income} radius={[2, 2, 0, 0]} />
                <Bar dataKey="expense" fill={CHART_COLORS.expense} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass p-5">
            <h2 className="mb-2 font-mono text-xs tracking-wide text-gray-500 uppercase">By category</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ReportPie title="Expense" items={data?.by_category ?? []} emptyText="No expenses matched." baseCurrency={data?.base_currency} />
              <ReportPie title="Income" items={data?.by_category_income ?? []} emptyText="No income matched." baseCurrency={data?.base_currency} />
            </div>
          </div>

          <div className="glass p-5">
            <h2 className="mb-3 font-mono text-xs tracking-wide text-gray-500 uppercase">Saved reports</h2>
            {savedReports.length === 0 ? (
              <p className="text-sm text-gray-500">No saved reports yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {savedReports.map((r) => (
                  <SavedReportRow
                    key={r.id}
                    id={r.id}
                    name={r.name}
                    description={r.description}
                    active={activeReportId === r.id}
                    onLoad={loadReport}
                    onDelete={() => deleteReport.mutate(r.id, { onSuccess: () => toast("Report deleted") })}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {saveOpen && (
        <SaveReportModal
          onClose={() => setSaveOpen(false)}
          onSave={async (name, description) => {
            await saveReport.mutateAsync({ name, description, filters });
            setSaveOpen(false);
            toast("Report saved");
          }}
        />
      )}
    </div>
  );
}

function SaveReportModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    try {
      await onSave(name, description);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Modal title="Save report" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Description (optional)">
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="btn-primary" onClick={submit} disabled={!name.trim()}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function SavedReportRow({
  id,
  name,
  description,
  active,
  onLoad,
  onDelete,
}: {
  id: number;
  name: string;
  description: string;
  active: boolean;
  onLoad: (id: number, filters: ReportFilters) => void;
  onDelete: () => void;
}) {
  async function load() {
    const detail = await api.get<{ filters: ReportFilters }>(`/api/reports/${id}`);
    onLoad(id, detail.filters);
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-white/5 p-3 ${active ? "bg-white/5" : ""}`}>
      <button className="flex-1 text-left" onClick={load}>
        <div className="text-sm text-gray-200">{name}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </button>
      <a className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" href={`/api/reports/${id}/export.csv`} download>
        <Download size={14} />
      </a>
      <button className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300" onClick={onDelete}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ReportPie({
  title,
  items,
  emptyText,
  baseCurrency,
}: {
  title: string;
  items: { category_id: number | null; name: string; color: string; amount: number }[];
  emptyText: string;
  baseCurrency: string | undefined;
}) {
  return (
    <div>
      <h3 className="mb-1 font-mono text-xs tracking-wide text-gray-500 uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={items} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                {items.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip {...chartTooltipProps} formatter={(v, name) => [fmtMoney(Number(v), baseCurrency), name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-col gap-1.5">
            {items.map((c) => (
              <div key={c.name} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                <ColorDot color={c.color} />
                <span className="flex-1 text-gray-300">{c.name}</span>
                <span className="font-mono tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <span className="font-mono text-[11px] tracking-widest text-gray-500 uppercase">{label}</span>
      <span className={`font-mono text-lg tracking-tight tabular-nums ${color ?? ""}`}>{value}</span>
    </div>
  );
}

function CategoryMultiSelect({
  categories,
  label,
  value,
  onChange,
}: {
  categories: Category[];
  label: string;
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = categories.filter((c) => !c.archived);
  const tops = active.filter((c) => c.parent_id === null);
  const selectedSet = new Set(value);

  function toggle(id: number) {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div ref={rootRef} className="input relative h-9 w-48">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-1 bg-transparent text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`min-w-0 truncate ${value.length ? "" : "text-gray-500"}`}>
          {value.length ? `${label.split(" ")[0]} (${value.length})` : label}
        </span>
        <ChevronDown size={14} className="shrink-0 text-gray-500" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[var(--color-panel)] py-1 shadow-xl">
          {tops.map((top) => (
            <div key={top.id}>
              <MultiOption category={top} selected={selectedSet.has(top.id)} onClick={() => toggle(top.id)} />
              {active
                .filter((c) => c.parent_id === top.id)
                .map((c) => (
                  <MultiOption key={c.id} category={c} indent selected={selectedSet.has(c.id)} onClick={() => toggle(c.id)} />
                ))}
            </div>
          ))}
          {tops.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No categories.</p>}
        </div>
      )}
    </div>
  );
}

function MultiOption({
  category,
  indent,
  selected,
  onClick,
}: {
  category: Category;
  indent?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-white/5 ${indent ? "pl-7" : ""}`}
      onClick={onClick}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {selected && <Check size={12} className="text-lime-400" />}
      </span>
      <ColorDot color={category.color} />
      <span className="min-w-0 flex-1 truncate">{category.name}</span>
    </button>
  );
}
