import { Check, KeyRound, Plug, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, ApiError } from "../api/client";
import { useAccounts, useMashreqTest, useSettings, useUpdateSettings, useVersion } from "../api/hooks";
import type { Account, Settings } from "../api/types";
import { Field, LoadingState, PageHeader, Select } from "../components/ui";
import { toast } from "../lib/toast";

interface CardMapping {
  suffix: string;
  accountId: number | null;
}

export default function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: version } = useVersion();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useAccounts();

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

      {settings ? (
        <>
          <PreferencesCard settings={settings} />
          <MashreqSyncCard settings={settings} accounts={accounts} />
        </>
      ) : (
        <div className="glass mt-4 max-w-sm p-6">
          <LoadingState />
        </div>
      )}
    </div>
  );
}

/** Mounted only once `settings` has loaded, with local state initialized
 * straight from it — avoids the effect-driven resync race where a
 * background refetch (or one that resolves after the user already started
 * typing) silently overwrites an in-progress, unsaved edit. */
function PreferencesCard({ settings }: { settings: Settings }) {
  const updateSettings = useUpdateSettings();
  const [threshold, setThreshold] = useState(String(settings.budget_threshold));
  const [error, setError] = useState("");

  async function saveThreshold() {
    setError("");
    const value = parseFloat(threshold);
    if (!(value > 0 && value <= 100)) return;
    try {
      await updateSettings.mutateAsync({ budget_threshold: value });
      toast("Preferences updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="glass mt-4 flex max-w-sm flex-col gap-4 p-6">
      <h2 className="text-sm font-semibold text-gray-300">Preferences</h2>
      <Field label="Budget warning threshold (%)">
        <input
          type="number"
          min="1"
          max="100"
          className="input"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={saveThreshold}
        />
      </Field>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <p className="text-xs text-gray-500">
        Budget bars turn amber at this percentage of the limit, and a toast fires when a
        transaction pushes a budget to or past it.
      </p>
    </div>
  );
}

function MashreqSyncCard({ settings, accounts }: { settings: Settings; accounts: Account[] }) {
  const updateSettings = useUpdateSettings();
  const mashreqTest = useMashreqTest();
  const [imapHost, setImapHost] = useState(settings.mashreq_imap_host);
  const [imapPort, setImapPort] = useState(settings.mashreq_imap_port || "993");
  const [imapUser, setImapUser] = useState(settings.mashreq_imap_user);
  const [imapPassword, setImapPassword] = useState(settings.mashreq_imap_password);
  const [imapFolder, setImapFolder] = useState(settings.mashreq_imap_folder || "INBOX");
  const [cardMappings, setCardMappings] = useState<CardMapping[]>(
    Object.entries(settings.mashreq_card_accounts).map(([suffix, accountId]) => ({ suffix, accountId })),
  );
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");

  async function saveMashreqSettings() {
    setSaveError("");
    const mashreq_card_accounts: Record<string, number> = {};
    for (const m of cardMappings) {
      if (m.suffix.trim() && m.accountId !== null) mashreq_card_accounts[m.suffix.trim()] = m.accountId;
    }
    try {
      await updateSettings.mutateAsync({
        mashreq_imap_host: imapHost,
        mashreq_imap_port: imapPort,
        mashreq_imap_user: imapUser,
        mashreq_imap_password: imapPassword,
        mashreq_imap_folder: imapFolder,
        mashreq_card_accounts,
      });
      toast("Mashreq sync settings saved");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function testConnection() {
    setTestResult(null);
    try {
      const result = await mashreqTest.mutateAsync({
        mashreq_imap_host: imapHost,
        mashreq_imap_port: imapPort,
        mashreq_imap_user: imapUser,
        mashreq_imap_password: imapPassword,
        mashreq_imap_folder: imapFolder,
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    }
  }

  return (
    <div className="glass mt-4 flex max-w-sm flex-col gap-4 p-6">
      <h2 className="text-sm font-semibold text-gray-300">Mashreq sync</h2>
      <p className="text-xs text-gray-500">
        Forward Mashreq's "Transaction Confirmation on Mashreq Card" alert emails to a
        dedicated mailbox, then point this at it — the Import page can then pull new alerts
        on demand instead of waiting for a manual CSV export.
      </p>
      <Field label="IMAP host">
        <input
          className="input"
          value={imapHost}
          onChange={(e) => setImapHost(e.target.value)}
          placeholder="imap.example.com"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port">
          <input className="input" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
        </Field>
        <Field label="Folder">
          <input className="input" value={imapFolder} onChange={(e) => setImapFolder(e.target.value)} />
        </Field>
      </div>
      <Field label="Mailbox username">
        <input className="input" value={imapUser} onChange={(e) => setImapUser(e.target.value)} />
      </Field>
      <Field label="Mailbox password">
        <input
          type="password"
          className="input"
          value={imapPassword}
          onChange={(e) => setImapPassword(e.target.value)}
        />
      </Field>

      <Field label="Card → account mapping">
        <div className="flex flex-col gap-2">
          {cardMappings.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input w-24"
                placeholder="7694"
                maxLength={4}
                value={m.suffix}
                onChange={(e) =>
                  setCardMappings((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, suffix: e.target.value } : row)),
                  )
                }
              />
              <Select
                className="input flex-1"
                value={m.accountId}
                onChange={(v) =>
                  setCardMappings((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, accountId: v } : row)),
                  )
                }
                emptyLabel="Account"
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
              <button
                type="button"
                className="rounded p-1.5 text-gray-400 hover:bg-rose-500/20 hover:text-rose-300"
                onClick={() => setCardMappings((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost self-start px-2.5 py-1 text-xs"
            onClick={() => setCardMappings((prev) => [...prev, { suffix: "", accountId: null }])}
          >
            <Plus size={13} /> Add card
          </button>
        </div>
      </Field>

      {testResult && (
        <p className={`text-xs ${testResult.ok ? "text-emerald-300" : "text-rose-400"}`}>
          {testResult.message}
        </p>
      )}
      {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="btn-ghost h-9 justify-center text-sm whitespace-nowrap"
          onClick={testConnection}
          disabled={mashreqTest.isPending || !imapHost || !imapUser || !imapPassword}
        >
          <Plug size={14} /> {mashreqTest.isPending ? "Testing…" : "Test connection"}
        </button>
        <button className="btn-primary h-9 text-sm whitespace-nowrap" onClick={saveMashreqSettings}>
          Save Mashreq sync settings
        </button>
      </div>
    </div>
  );
}
