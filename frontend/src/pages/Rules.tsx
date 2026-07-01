import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { useCategories, useInvalidating, useRules } from "../api/hooks";
import { CategorySelect, ColorDot, EmptyState, Field, Modal, PageHeader } from "../components/ui";

interface Draft {
  id?: number;
  pattern: string;
  match_kind: "exact" | "contains";
  category_id: number | null;
  priority: number;
}

export default function RulesPage() {
  const [q, setQ] = useState("");
  const { data: rules = [] } = useRules(q);
  const { data: categories = [] } = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  const keys = [["rules"]];
  const save = useInvalidating(
    (d: Draft) =>
      d.id ? api.put(`/api/rules/${d.id}`, { ...d, id: undefined }) : api.post("/api/rules", d),
    keys,
  );
  const remove = useInvalidating((id: number) => api.del(`/api/rules/${id}`), keys);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Mapping rules"
        subtitle="The register that turns merchant text into categories — grows as you correct imports"
        actions={
          <button
            className="btn-primary"
            onClick={() => setDraft({ pattern: "", match_kind: "contains", category_id: null, priority: 0 })}
          >
            <Plus size={16} /> Add rule
          </button>
        }
      />

      <div className="glass mb-4 flex items-center gap-2 p-3">
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-2.5 text-gray-500" />
          <input
            className="input w-64 pl-8"
            placeholder="Search patterns…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-xs text-gray-500">{rules.length} rules</span>
      </div>

      {rules.length === 0 ? (
        <EmptyState text="No rules yet. They appear automatically when you categorize imports, or add one manually." />
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Pattern</th>
                <th className="px-4 py-2.5">Match</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5 text-right">Hits</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const cat = categoryById.get(r.category_id);
                return (
                  <tr key={r.id} className="group border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2 font-mono text-xs">{r.pattern}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          r.match_kind === "exact"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-indigo-500/15 text-indigo-300"
                        }`}
                      >
                        {r.match_kind}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1.5">
                        {cat && <ColorDot color={cat.color} />}
                        {cat?.name ?? "?"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">{r.hit_count}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          className="rounded p-1 text-gray-400 hover:bg-white/10"
                          onClick={() => setDraft({ ...r })}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="rounded p-1 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                          onClick={() => remove.mutate(r.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit rule" : "New rule"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Pattern (merchant text, digits are ignored)">
              <input
                className="input"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="e.g. CARREFOUR"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Match kind">
                <select
                  className="input"
                  value={draft.match_kind}
                  onChange={(e) => setDraft({ ...draft, match_kind: e.target.value as Draft["match_kind"] })}
                >
                  <option value="contains">contains</option>
                  <option value="exact">exact</option>
                </select>
              </Field>
              <Field label="Priority">
                <input
                  type="number"
                  className="input"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Category">
              <CategorySelect
                categories={categories}
                value={draft.category_id}
                onChange={(id) => setDraft({ ...draft, category_id: id })}
                allowEmpty={false}
              />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={!draft.pattern.trim() || !draft.category_id}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
