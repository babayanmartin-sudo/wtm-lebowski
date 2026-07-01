import { Pencil, Plus, PlusCircle, Target, Trash2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import { useGoals, useInvalidating } from "../api/hooks";
import type { Goal } from "../api/types";
import { ColorPicker, EmptyState, Field, Modal, PageHeader } from "../components/ui";
import { fmtDate, fmtMoney, today } from "../lib/format";

interface Draft {
  id?: number;
  name: string;
  target_amount: string;
  target_date: string;
  color: string;
}

export default function GoalsPage() {
  const { data: goals = [] } = useGoals();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const keys = [["goals"]];
  const save = useInvalidating(
    (d: Draft) => {
      const body = {
        name: d.name,
        target_amount: parseFloat(d.target_amount),
        target_date: d.target_date || null,
        color: d.color,
        icon: "target",
        archived: false,
      };
      return d.id ? api.put(`/api/goals/${d.id}`, body) : api.post("/api/goals", body);
    },
    keys,
  );
  const remove = useInvalidating((id: number) => api.del(`/api/goals/${id}`), keys);
  const contribute = useInvalidating(
    ({ id, value }: { id: number; value: number }) =>
      api.post(`/api/goals/${id}/contributions`, { date: today(), amount: value, note: "" }),
    keys,
  );

  async function submit() {
    setError("");
    try {
      await save.mutateAsync(draft!);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  function projection(g: Goal): string | null {
    if (!g.target_date) return null;
    const remaining = g.target_amount - g.saved;
    if (remaining <= 0) return "Goal reached 🎉";
    const months = Math.max(
      1,
      Math.round((new Date(g.target_date).getTime() - Date.now()) / (30 * 24 * 3600 * 1000)),
    );
    return `${fmtMoney(remaining / months)} AED/month to hit ${fmtDate(g.target_date)}`;
  }

  return (
    <div>
      <PageHeader
        title="Savings goals"
        subtitle="Put money aside with a target in mind"
        actions={
          <button
            className="btn-primary"
            onClick={() => setDraft({ name: "", target_amount: "", target_date: "", color: "#a78bfa" })}
          >
            <Plus size={16} /> Add goal
          </button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState text="No goals yet. Create one — vacation, emergency fund, new laptop…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const ratio = g.target_amount > 0 ? Math.min(1, g.saved / g.target_amount) : 0;
            const deg = ratio * 360;
            return (
              <div key={g.id} className="glass glass-hover p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full"
                      style={{
                        background: `conic-gradient(${g.color} ${deg}deg, rgba(255,255,255,0.08) ${deg}deg)`,
                      }}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#12151f] text-xs font-semibold">
                        {Math.round(ratio * 100)}%
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">{g.name}</p>
                      <p className="text-xs text-gray-500">
                        {g.target_date ? `by ${fmtDate(g.target_date)}` : "no deadline"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                      onClick={() =>
                        setDraft({
                          id: g.id,
                          name: g.name,
                          target_amount: String(g.target_amount),
                          target_date: g.target_date ?? "",
                          color: g.color,
                        })
                      }
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                      onClick={() => remove.mutate(g.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="mt-4 text-lg font-semibold tabular-nums">
                  {fmtMoney(g.saved)} <span className="text-sm text-gray-500">/ {fmtMoney(g.target_amount)} AED</span>
                </p>
                {projection(g) && <p className="mt-1 text-xs text-gray-400">{projection(g)}</p>}
                <button
                  className="btn-ghost mt-3 w-full text-sm"
                  onClick={() => {
                    setContributing(g);
                    setAmount("");
                  }}
                >
                  <PlusCircle size={15} /> Add money
                </button>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? "Edit goal" : "New goal"} onClose={() => setDraft(null)}>
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
              <Field label="Target (AED)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={draft.target_amount}
                  onChange={(e) => setDraft({ ...draft, target_amount: e.target.value })}
                />
              </Field>
              <Field label="Target date (optional)">
                <input
                  type="date"
                  className="input"
                  value={draft.target_date}
                  onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Color">
              <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
            </Field>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button
              className="btn-primary"
              onClick={submit}
              disabled={!draft.name.trim() || !(parseFloat(draft.target_amount) > 0)}
            >
              Save
            </button>
          </div>
        </Modal>
      )}

      {contributing && (
        <Modal title={`Add to “${contributing.name}”`} onClose={() => setContributing(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Amount (AED, negative to withdraw)">
              <input
                type="number"
                step="0.01"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
            <button
              className="btn-primary"
              disabled={!amount || parseFloat(amount) === 0}
              onClick={async () => {
                await contribute.mutateAsync({ id: contributing.id, value: parseFloat(amount) });
                setContributing(null);
              }}
            >
              <Target size={15} /> Save contribution
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
