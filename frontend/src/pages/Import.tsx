import { AlertTriangle, Check, CopyX, EyeOff, FileUp, Mail, Pencil, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useState } from "react";

import { api } from "../api/client";
import {
  MONEY_KEYS,
  useAccounts,
  useCategories,
  useImport,
  useInvalidating,
  useMashreqSync,
} from "../api/hooks";
import type { ImportDetail, ImportRow } from "../api/types";
import { Badge, CategorySelect, ErrorState, Field, PageHeader, SuccessIcon } from "../components/ui";
import { fmtMoney } from "../lib/format";
import { toast } from "../lib/toast";

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "date", label: "Date", hint: "required" },
  { key: "amount", label: "Amount", hint: "signed, or unsigned + Debit/Credit column below" },
  { key: "direction", label: "Debit/Credit column", hint: "text values like 'Debit'/'Credit', pairs with Amount" },
  { key: "debit", label: "Debit (money out)", hint: "alternative: separate debit+credit amount columns" },
  { key: "credit", label: "Credit (money in)", hint: "" },
  { key: "payee", label: "Payee / description", hint: "" },
  { key: "note", label: "Note", hint: "" },
];

export default function ImportPage() {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const { data: imp, refetch, isError: importIsError, error: importError } = useImport(importId);
  const [mapping, setMapping] = useState<Record<string, number | "">>({});
  const [dayfirst, setDayfirst] = useState(true);
  const [negate, setNegate] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [editMapping, setEditMapping] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(true);

  const commit = useInvalidating(() => api.post(`/api/imports/${importId}/commit`), MONEY_KEYS);
  const mashreqSync = useMashreqSync();

  async function syncMashreq() {
    setError("");
    try {
      const result = await mashreqSync.mutateAsync(undefined);
      if (result.imports.length === 1) {
        setImportId(result.imports[0].id);
      } else if (result.imports.length > 1) {
        toast(`Synced into ${result.imports.length} imports — open each from its account`);
      } else {
        toast("No new Mashreq alerts found");
      }
      if (result.unmapped_count > 0) {
        toast(`${result.unmapped_count} alert(s) skipped — unmapped card, add it in Profile`);
      }
      if (result.unparsed_count > 0) {
        toast(`${result.unparsed_count} alert(s) couldn't be parsed`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mashreq sync failed");
    }
  }

  const active = accounts.filter((a) => !a.archived);
  const mainAccount = active.find((a) => a.is_main) ?? active[0];
  const account = accounts.find((a) => a.id === (imp?.account_id ?? accountId));

  function loadDraftFrom(detail: ImportDetail) {
    const m: Record<string, number | ""> = {};
    for (const [k, v] of Object.entries(detail.mapping ?? {})) m[k] = v as number;
    setMapping(m);
    setDayfirst((detail.options?.dayfirst as boolean) ?? true);
    setNegate((detail.options?.negate as boolean) ?? false);
  }

  async function upload(file: File) {
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("account_id", String(accountId ?? mainAccount?.id));
      const created = await api.postForm<ImportDetail>("/api/imports", form);
      setImportId(created.id);
      loadDraftFrom(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyMapping() {
    setError("");
    setBusy(true);
    try {
      const clean: Record<string, number> = {};
      for (const [k, v] of Object.entries(mapping)) if (v !== "") clean[k] = v as number;
      await api.post(`/api/imports/${importId}/mapping`, {
        mapping: clean,
        options: { dayfirst, negate },
        preset_name: presetName,
      });
      setEditMapping(false);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mapping failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchRow(
    row: ImportRow,
    patch: { category_id?: number | null; skip?: boolean; is_duplicate?: boolean; kind?: string | null },
  ) {
    await api.patch(`/api/imports/${importId}/rows/${row.id}`, patch);
    refetch();
  }

  async function toggleExpenseReturn(row: ImportRow) {
    await patchRow(row, { kind: row.kind === "expense_return" ? null : "expense_return" });
  }

  async function unmarkDuplicate(row: ImportRow) {
    await patchRow(row, { is_duplicate: false });
  }

  async function ignoreRow(row: ImportRow) {
    setError("");
    try {
      await api.post(`/api/imports/${importId}/rows/${row.id}/ignore`);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ignore");
    }
  }

  async function doCommit() {
    setError("");
    try {
      await commit.mutateAsync(undefined);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    }
  }

  async function cancelImport() {
    if (importId) await api.del(`/api/imports/${importId}`).catch(() => undefined);
    reset();
  }

  function reset() {
    setImportId(null);
    setMapping({});
    setPresetName("");
    setEditMapping(false);
    setError("");
  }

  const importable = (imp?.rows ?? []).filter((r) => !r.skip && !r.error && r.parsed_amount !== null);
  const dupes = (imp?.rows ?? []).filter((r) => r.is_duplicate).length;
  const allRows = imp?.rows ?? [];
  const displayedRows = uncategorizedOnly ? allRows.filter((r) => r.category_id === null) : allRows;
  const mappingIncomplete =
    mapping["date"] === "" ||
    mapping["date"] === undefined ||
    ((mapping["amount"] === undefined || mapping["amount"] === "") &&
      (mapping["debit"] === undefined || mapping["debit"] === "") &&
      (mapping["credit"] === undefined || mapping["credit"] === ""));
  const showMapping = imp && imp.status !== "done" && (imp.status === "mapping" || editMapping);
  const showPreview = imp && imp.status === "preview" && !editMapping;

  return (
    <div>
      <PageHeader title="Import" subtitle="Upload a bank statement (CSV or XLSX)" />

      {importId !== null && importIsError && <ErrorState error={importError} />}

      {/* Step 1: upload */}
      {!importId && !imp && (
        <div className="glass p-6">
          <div className="mb-4 grid max-w-md gap-4">
            <Field label="Into account">
              <select
                className="input"
                value={accountId ?? mainAccount?.id ?? ""}
                onChange={(e) => setAccountId(Number(e.target.value))}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-white/15 p-12 text-gray-400 transition-colors hover:border-lime-400/50 hover:text-gray-200">
            <FileUp size={32} />
            <span className="text-sm">{busy ? "Uploading…" : "Click to choose a .csv / .xlsx file"}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xlsm,.txt"
              className="hidden"
              disabled={busy || active.length === 0}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          {active.length === 0 && (
            <p className="mt-3 text-sm text-amber-400">Create an account first.</p>
          )}
          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
            <button className="btn-ghost text-sm" onClick={syncMashreq} disabled={mashreqSync.isPending}>
              <Mail size={14} /> {mashreqSync.isPending ? "Syncing…" : "Sync Mashreq"}
            </button>
            <span className="text-xs text-gray-500">Pulls new alert emails — configure in Profile.</span>
          </div>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      )}

      {/* Step 2: column mapping (first time, or re-opened from preview) */}
      {showMapping && (
        <div className="glass p-6">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-300">
            <Wand2 size={16} className="text-lime-300" />
            Map columns of <span className="font-medium text-white">{imp.filename}</span> — guessed
            where possible, adjust as needed.
          </div>
          <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.hint ? ` (${f.hint})` : ""}`}>
                <select
                  className="input"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f.key]: e.target.value === "" ? "" : Number(e.target.value) })
                  }
                >
                  <option value="">— not present —</option>
                  {imp.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dayfirst} onChange={(e) => setDayfirst(e.target.checked)} />
              Day-first dates (31/12/2026)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={negate} onChange={(e) => setNegate(e.target.checked)} />
              Flip sign (bank exports expenses as positive)
            </label>
          </div>
          <div className="mt-4 flex max-w-md items-end gap-3">
            <Field label="Save preset as (bank name)">
              <input
                className="input"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={imp.filename}
              />
            </Field>
            <button className="btn-primary" onClick={applyMapping} disabled={busy || mappingIncomplete}>
              Preview
            </button>
            {editMapping ? (
              <button className="btn-ghost" onClick={() => setEditMapping(false)}>
                Back to preview
              </button>
            ) : (
              <button className="btn-ghost" onClick={cancelImport}>
                Cancel
              </button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      )}

      {/* Step 3: preview + commit */}
      {showPreview && (
        <div className="flex flex-col gap-4">
          <div className="glass flex flex-wrap items-center gap-4 p-4 text-sm">
            <span className="flex items-center gap-2 text-gray-300">
              <Sparkles size={15} className="text-lime-300" />
              {imp.filename} → {account?.name}
            </span>
            <span className="text-gray-400">{importable.length} to import</span>
            {dupes > 0 && (
              <span className="flex items-center gap-1 text-amber-300">
                <CopyX size={14} /> {dupes} duplicates skipped
              </span>
            )}
            <span className="flex-1" />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={uncategorizedOnly}
                onChange={(e) => setUncategorizedOnly(e.target.checked)}
              />
              Uncategorized only
            </label>
            <button
              className="btn-ghost"
              onClick={() => {
                loadDraftFrom(imp);
                setEditMapping(true);
              }}
            >
              <Pencil size={14} /> Edit mapping
            </button>
            <button className="btn-ghost" onClick={cancelImport}>
              Cancel
            </button>
            <button className="btn-primary" onClick={doCommit} disabled={importable.length === 0}>
              <Check size={15} /> Import {importable.length} rows
            </button>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="glass overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2">Use</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Payee</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Category</th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-white/5 last:border-0 ${r.skip ? "opacity-40" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={!r.skip}
                        disabled={!!r.error}
                        onChange={(e) => patchRow(r, { skip: !e.target.checked })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-400">{r.parsed_date ?? "—"}</td>
                    <td className="max-w-72 px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{r.parsed_payee || r.parsed_note || "—"}</span>
                        {r.error && (
                          <Badge color="rose" title={r.error}>
                            <AlertTriangle size={10} /> {r.error}
                          </Badge>
                        )}
                        {!r.error && r.ignored && <Badge>ignored</Badge>}
                        {!r.error && !r.ignored && r.is_duplicate && (
                          <Badge color="amber">
                            duplicate
                            <button
                              title="Not a duplicate — import it anyway"
                              className="hover:text-amber-100"
                              onClick={() => unmarkDuplicate(r)}
                            >
                              <Undo2 size={11} />
                            </button>
                          </Badge>
                        )}
                        {r.kind === "expense_return" && <Badge color="sky">expense return</Badge>}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                        (r.parsed_amount ?? 0) >= 0 ? "text-emerald-300" : "text-gray-200"
                      }`}
                    >
                      {r.parsed_amount !== null ? fmtMoney(r.parsed_amount, account?.currency) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {!r.error && (
                        <div className="flex items-center gap-1.5">
                          <CategorySelect
                            categories={categories}
                            kind={
                              r.kind === "expense_return" || (r.parsed_amount ?? 0) < 0 ? "expense" : "income"
                            }
                            value={r.category_id}
                            onChange={(id) => patchRow(r, { category_id: id })}
                            className="input w-44 py-1 text-xs"
                          />
                          {r.suggestion_confidence && r.category_id === r.suggested_category_id && (
                            <Badge
                              color={r.suggestion_confidence === "fuzzy" ? "amber" : "emerald"}
                              title={`Suggested via ${r.suggestion_confidence} match`}
                            >
                              {r.suggestion_confidence}
                            </Badge>
                          )}
                          {(r.parsed_amount ?? 0) > 0 && (
                            <button
                              title={
                                r.kind === "expense_return"
                                  ? "Undo — treat as income"
                                  : "Mark as an expense return (refund), not income"
                              }
                              className={`shrink-0 rounded p-1 hover:bg-white/10 ${
                                r.kind === "expense_return" ? "text-sky-300" : "text-gray-500 hover:text-gray-300"
                              }`}
                              onClick={() => toggleExpenseReturn(r)}
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                          <button
                            title={
                              r.parsed_payee
                                ? "Ignore this merchant now and in future imports"
                                : "No payee text to match on"
                            }
                            disabled={!r.parsed_payee}
                            className="shrink-0 rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300 disabled:opacity-30"
                            onClick={() => ignoreRow(r)}
                          >
                            <EyeOff size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Done */}
      {imp && imp.status === "done" && (
        <div className="glass flex flex-col items-center gap-4 p-12">
          <SuccessIcon />
          <p className="text-sm text-gray-300">
            Imported into <span className="font-medium text-white">{account?.name}</span>. The matcher
            learned from your corrections.
          </p>
          <button className="btn-primary" onClick={reset}>
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
