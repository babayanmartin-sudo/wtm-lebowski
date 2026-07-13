import { EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { useCategories, useIgnoreRules, useInvalidating, useRules } from "../api/hooks";
import {
  Badge,
  CategorySelect,
  ColorDot,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
} from "../components/ui";
import { useSessionState } from "../lib/session";
import { toast } from "../lib/toast";

interface Draft {
  id?: number;
  pattern: string;
  match_kind: "exact" | "contains";
  category_id: number | null;
  alias: string;
  priority: number;
}

interface IgnoreDraft {
  id?: number;
  pattern: string;
  match_kind: "exact" | "contains";
  priority: number;
}

export default function RulesPage() {
  const [q, setQ] = useSessionState("rules.q", "");
  const { data: rules = [], isLoading: rulesLoading, isError: rulesIsError, error: rulesError } = useRules(q);
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

  const [iq, setIq] = useSessionState("rules.ignoreQ", "");
  const {
    data: ignoreRules = [],
    isLoading: ignoreLoading,
    isError: ignoreIsError,
    error: ignoreError,
  } = useIgnoreRules(iq);
  const [idraft, setIdraft] = useState<IgnoreDraft | null>(null);
  const [ierror, setIerror] = useState("");
  const ikeys = [["ignore-rules"]];
  const isave = useInvalidating(
    (d: IgnoreDraft) =>
      d.id
        ? api.put(`/api/ignore-rules/${d.id}`, { ...d, id: undefined })
        : api.post("/api/ignore-rules", d),
    ikeys,
  );
  const iremove = useInvalidating((id: number) => api.del(`/api/ignore-rules/${id}`), ikeys);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
      toast(draft!.id ? "Rule updated" : "Rule created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function isubmit() {
    setIerror("");
    try {
      await isave.mutateAsync(idraft!);
      setIdraft(null);
      toast(idraft!.id ? "Ignore rule updated" : "Ignore rule created");
    } catch (e) {
      setIerror(e instanceof Error ? e.message : "Failed");
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
            onClick={() =>
              setDraft({ pattern: "", match_kind: "contains", category_id: null, alias: "", priority: 0 })
            }
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

      {rulesLoading ? (
        <LoadingState />
      ) : rulesIsError ? (
        <ErrorState error={rulesError} />
      ) : rules.length === 0 ? (
        <EmptyState text="No rules yet. They appear automatically when you categorize imports, or add one manually." />
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Pattern</th>
                <th className="px-4 py-2.5">Alias</th>
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
                    <td className="px-4 py-2 text-xs text-gray-300">{r.alias || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge color={r.match_kind === "exact" ? "emerald" : "sky"}>{r.match_kind}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1.5">
                        {cat && <ColorDot color={cat.color} />}
                        {cat?.name ?? "?"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-400">{r.hit_count}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="rounded p-1 text-gray-400 hover:bg-white/10"
                          onClick={() => setDraft({ ...r })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="rounded p-1 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                          onClick={() => remove.mutate(r.id, { onSuccess: () => toast("Rule deleted") })}
                        >
                          <Trash2 size={14} />
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
            <Field label="Alias (optional — replaces the payee shown for matches)">
              <input
                className="input"
                value={draft.alias}
                onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
                placeholder="e.g. Carrefour Supermarket"
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

      <PageHeader
        title="Ignored merchants"
        subtitle="Transactions matching these are auto-skipped in every import, now and in future"
        actions={
          <button
            className="btn-primary"
            onClick={() => setIdraft({ pattern: "", match_kind: "contains", priority: 0 })}
          >
            <Plus size={16} /> Add ignore rule
          </button>
        }
      />

      <div className="glass mb-4 flex items-center gap-2 p-3">
        <div className="relative">
          <Search size={14} className="absolute top-2.5 left-2.5 text-gray-500" />
          <input
            className="input w-64 pl-8"
            placeholder="Search patterns…"
            value={iq}
            onChange={(e) => setIq(e.target.value)}
          />
        </div>
        <span className="text-xs text-gray-500">{ignoreRules.length} rules</span>
      </div>

      {ignoreLoading ? (
        <LoadingState />
      ) : ignoreIsError ? (
        <ErrorState error={ignoreError} />
      ) : ignoreRules.length === 0 ? (
        <EmptyState text="No ignore rules yet. Click the eye-off icon on a row during import to add one." />
      ) : (
        <div className="glass overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Pattern</th>
                <th className="px-4 py-2.5">Match</th>
                <th className="px-4 py-2.5 text-right">Hits</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ignoreRules.map((r) => (
                <tr key={r.id} className="group border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-4 py-2 font-mono text-xs">
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <EyeOff size={12} />
                      {r.pattern}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge color={r.match_kind === "exact" ? "emerald" : "sky"}>{r.match_kind}</Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">{r.hit_count}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-white/10"
                        onClick={() => setIdraft({ ...r })}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                        onClick={() => iremove.mutate(r.id, { onSuccess: () => toast("Ignore rule deleted") })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {idraft && (
        <Modal title={idraft.id ? "Edit ignore rule" : "New ignore rule"} onClose={() => setIdraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Pattern (merchant text, digits are ignored)">
              <input
                className="input"
                value={idraft.pattern}
                onChange={(e) => setIdraft({ ...idraft, pattern: e.target.value })}
                placeholder="e.g. INTERNAL TRANSFER"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Match kind">
                <select
                  className="input"
                  value={idraft.match_kind}
                  onChange={(e) =>
                    setIdraft({ ...idraft, match_kind: e.target.value as IgnoreDraft["match_kind"] })
                  }
                >
                  <option value="contains">contains</option>
                  <option value="exact">exact</option>
                </select>
              </Field>
              <Field label="Priority">
                <input
                  type="number"
                  className="input"
                  value={idraft.priority}
                  onChange={(e) => setIdraft({ ...idraft, priority: Number(e.target.value) })}
                />
              </Field>
            </div>
            {ierror && <p className="text-xs text-rose-400">{ierror}</p>}
            <button className="btn-primary" onClick={isubmit} disabled={!idraft.pattern.trim()}>
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
