import { Check, KeyRound, RefreshCw } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { api, ApiError } from "../api/client";
import { useAccounts, useInvalidating, useRates, useVersion } from "../api/hooks";
import { Field, PageHeader } from "../components/ui";
import { fmtDate } from "../lib/format";

export default function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: version } = useVersion();
  const { data: rates = [] } = useRates();
  const { data: accounts = [] } = useAccounts();
  const activeCurrencies = useMemo(
    () => new Set(accounts.filter((a) => !a.archived).map((a) => a.currency)),
    [accounts],
  );
  const activeRates = rates.filter((r) => activeCurrencies.has(r.currency));
  const refresh = useInvalidating(() => api.post("/api/rates/refresh"), [["rates"]]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle={`Manage your account password${version?.version ? ` · ${version.version}` : ""}`}
      />

      <form onSubmit={submit} className="glass flex max-w-sm flex-col gap-4 p-6">
        <Field label="Current password">
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {done && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-300">
            <Check size={13} /> Password updated.
          </p>
        )}
        <button
          className="btn-primary"
          disabled={busy || !currentPassword || newPassword.length < 4}
        >
          <KeyRound size={15} /> Update password
        </button>
      </form>

      <div className="glass mt-6 flex max-w-sm flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Exchange rates</h2>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => refresh.mutate(undefined)}
            disabled={refresh.isPending}
          >
            <RefreshCw size={13} className={refresh.isPending ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {activeRates.length === 0 ? (
          <p className="text-sm text-gray-500">No rates cached for your active account currencies yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {activeRates.map((r) => (
              <div key={r.currency} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{r.currency}</span>
                <span className="tabular-nums text-gray-400">
                  {r.rate_to_base.toFixed(4)} <span className="text-xs text-gray-600">({fmtDate(r.date)})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
