import { Archive, CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { useCategories, useInvalidating } from "../api/hooks";
import type { Category } from "../api/types";
import { ColorDot, ColorPicker, Field, Modal, PageHeader } from "../components/ui";

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
        <span className="flex-1 text-sm">{cat.name}</span>
        <div className="hidden gap-1 group-hover:flex">
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
            onClick={() => remove.mutate(cat.id)}
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
    </div>
  );
}
