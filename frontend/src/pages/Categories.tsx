import { Archive, BarChart3, ChevronLeft, ChevronRight, CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "../api/client";
import { useCategories, useDashboard, useInvalidating } from "../api/hooks";
import type { Category } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { ColorDot, ColorPicker, Field, Modal, PageHeader } from "../components/ui";
import { fmtMoney } from "../lib/format";
import { type PickerMode, parseISO, periodFor, periodLabel, shiftAnchor, toISO } from "../lib/period";

const DRILL_MODES: PickerMode[] = ["month", "year", "custom"];

interface Draft {
  id?: number;
  name: string;
  parent_id: number | null;
  kind: "expense" | "income";
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
}

const empty: Draft = {
  name: "",
  parent_id: null,
  kind: "expense",
  color: "#22d3ee",
  icon: "tag",
  archived: false,
  sort_order: 0,
};

export default function CategoriesPage() {
  const { data: categories = [] } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [drillCat, setDrillCat] = useState<Category | null>(null);

  const keys = [["categories"], ["dashboard"], ["budgets"]];
  const save = useInvalidating(async (d: Draft) => {
    const body = { ...d, id: undefined };
    return d.id ? api.put(`/api/categories/${d.id}`, body) : api.post("/api/categories", body);
  }, keys);
  const remove = useInvalidating((id: number) => api.del(`/api/categories/${id}`), keys);

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function del(cat: Category) {
    setPageError("");
    if (!confirm(`Delete category “${cat.name}”?`)) return;
    try {
      await remove.mutateAsync(cat.id);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function section(kind: "expense" | "income") {
    const tops = categories.filter((c) => c.kind === kind && c.parent_id === null);
    return (
      <div className="glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {kind === "expense" ? "Expenses" : "Income"}
          </h2>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setDraft({ ...empty, kind })}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="flex flex-col">
          {tops.map((top) => (
            <div key={top.id}>
              <Row cat={top} />
              {categories
                .filter((c) => c.parent_id === top.id)
                .map((child) => (
                  <Row key={child.id} cat={child} child />
                ))}
            </div>
          ))}
          {tops.length === 0 && <p className="py-4 text-sm text-gray-500">No categories yet.</p>}
        </div>
      </div>
    );
  }

  function Row({ cat, child }: { cat: Category; child?: boolean }) {
    return (
      <div
        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 ${
          cat.archived ? "opacity-40" : ""
        } ${child ? "ml-6" : ""}`}
      >
        {child && <CornerDownRight size={13} className="text-gray-600" />}
        <ColorDot color={cat.color} />
        <button className="flex-1 truncate text-left text-sm hover:underline" onClick={() => setDrillCat(cat)}>
          {cat.name}
        </button>
        <div className="hidden gap-1 group-hover:flex">
          <button
            title="Drill down"
            className="rounded p-1 text-gray-400 hover:bg-white/10"
            onClick={() => setDrillCat(cat)}
          >
            <BarChart3 size={13} />
          </button>
          {!child && (
            <button
              title="Add subcategory"
              className="rounded p-1 text-gray-400 hover:bg-white/10"
              onClick={() => setDraft({ ...empty, kind: cat.kind, parent_id: cat.id, color: cat.color })}
            >
              <Plus size={13} />
            </button>
          )}
          <button
            className="rounded p-1 text-gray-400 hover:bg-white/10"
            onClick={() => setDraft({ ...cat })}
          >
            <Pencil size={13} />
          </button>
          <button
            title={cat.archived ? "Unarchive" : "Archive"}
            className="rounded p-1 text-gray-400 hover:bg-white/10"
            onClick={() => save.mutate({ ...cat, archived: !cat.archived })}
          >
            <Archive size={13} />
          </button>
          <button
            className="rounded p-1 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
            onClick={() => del(cat)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  const parents = categories.filter((c) => c.parent_id === null && c.kind === draft?.kind);

  return (
    <div>
      <PageHeader title="Categories" subtitle="Organize spending and income, one nesting level" />
      {pageError && (
        <div className="glass mb-4 border-rose-400/30 p-3 text-sm text-rose-300">{pageError}</div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {section("expense")}
        {section("income")}
      </div>

      {draft && (
        <Modal title={draft.id ? "Edit category" : "New category"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Parent (optional)">
              <select
                className="input"
                value={draft.parent_id ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, parent_id: e.target.value === "" ? null : Number(e.target.value) })
                }
              >
                <option value="">— top level —</option>
                {parents
                  .filter((p) => p.id !== draft.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Color">
              <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button className="btn-primary" onClick={submit} disabled={!draft.name.trim()}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {drillCat && <CategoryDrilldown cat={drillCat} onClose={() => setDrillCat(null)} />}
    </div>
  );
}

function CategoryDrilldown({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const [pickerMode, setPickerMode] = useState<PickerMode>("month");
  const [pickerDate, setPickerDate] = useState(toISO(new Date()));
  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);
  const { data } = useDashboard({ date_from: period.from, date_to: period.to, category_id: cat.id });

  const rows = (data?.by_category ?? []).filter((c) => c.category_id !== cat.id);
  const total = data?.by_category.find((c) => c.category_id === cat.id)?.amount ?? 0;
  const childTotal = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Modal title={`${cat.name} — drill-down`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1">
          <button
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
            disabled={pickerMode === "custom"}
            onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
          >
            <ChevronLeft size={16} />
          </button>
          <PeriodPicker
            mode={pickerMode}
            date={pickerDate}
            modes={DRILL_MODES}
            onChange={(m, d) => {
              setPickerMode(m);
              setPickerDate(d);
            }}
          />
          <button
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
            disabled={pickerMode === "custom"}
            onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-xs text-gray-500">{periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}</p>

        <div className="flex items-center justify-between rounded-xl bg-white/5 p-3">
          <span className="text-sm text-gray-300">Total ({cat.kind})</span>
          <span className="text-lg font-semibold tabular-nums">{fmtMoney(total, data?.base_currency)}</span>
        </div>

        {rows.length > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">Subcategory breakdown</p>
            {rows
              .sort((a, b) => b.amount - a.amount)
              .map((r) => (
                <div key={r.category_id ?? "uncategorized"} className="flex items-center gap-2 py-1 text-sm">
                  <ColorDot color={r.color} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="tabular-nums text-gray-300">{fmtMoney(r.amount, data?.base_currency)}</span>
                  <span className="w-10 shrink-0 text-right text-xs text-gray-500">
                    {total > 0 ? Math.round((r.amount / total) * 100) : 0}%
                  </span>
                </div>
              ))}
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2 text-xs text-gray-500">
              <span>Sum of subcategories</span>
              <span className="tabular-nums">{fmtMoney(childTotal, data?.base_currency)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No subcategories for this period.</p>
        )}
      </div>
    </Modal>
  );
}
