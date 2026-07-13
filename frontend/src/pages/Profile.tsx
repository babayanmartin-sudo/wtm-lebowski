import { Check, KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, ApiError } from "../api/client";
import { useVersion } from "../api/hooks";
import { Field, PageHeader } from "../components/ui";

export default function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: version } = useVersion();

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
    </div>
  );
}
