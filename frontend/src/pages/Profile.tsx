import { Check, ChevronDown, KeyRound, Plug, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

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
  const { data: version } = useVersion();
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useAccounts();

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle={`Account settings${version?.version ? ` · ${version.version}` : ""}`}
      />

      <div className="mt-4 max-w-sm">
        <CollapsibleCard title="Change your password" icon={<KeyRound size={15} />}>
          <ChangePasswordForm />
        </CollapsibleCard>
      </div>

      {settings ? (
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <CollapsibleCard title="Budget thresholds">
            <PreferencesForm settings={settings} />
          </CollapsibleCard>
          <CollapsibleCard title="Email connection settings">
            <MailboxSyncForm settings={settings} accounts={accounts} />
          </CollapsibleCard>
          <CollapsibleCard title="AI Assistant">
            <AiAssistantForm settings={settings} />
          </CollapsibleCard>
        </div>
      ) : (
        <div className="glass mt-4 max-w-sm p-6">
          <LoadingState />
        </div>
      )}
    </div>
  );
}

/** Header button + collapsible body, all closed by default — keeps the
 * page scannable instead of dumping every field (password, threshold,
 * mailbox creds) on screen at once. */
function CollapsibleCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass w-full max-w-sm overflow-hidden lg:max-w-none">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-6 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-300">
          {icon}
          {title}
        </span>
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="flex flex-col gap-4 px-6 pb-6">{children}</div>}
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <form onSubmit={submit} className="flex flex-col gap-4">
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
      <button className="btn-primary" disabled={busy || !currentPassword || newPassword.length < 4}>
        <KeyRound size={15} /> Update password
      </button>
    </form>
  );
}

/** Local state initialized straight from `settings` (mounted only once it
 * has loaded) — avoids the effect-driven resync race where a background
 * refetch could overwrite an in-progress, unsaved edit. */
function PreferencesForm({ settings }: { settings: Settings }) {
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
    <>
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
    </>
  );
}

function MailboxSyncForm({ settings, accounts }: { settings: Settings; accounts: Account[] }) {
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
  const [amazonAccountId, setAmazonAccountId] = useState<number | null>(settings.amazon_default_account_id);
  const [mashreqEnabled, setMashreqEnabled] = useState(settings.mashreq_sync_enabled);
  const [amazonEnabled, setAmazonEnabled] = useState(settings.amazon_sync_enabled);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.auto_sync_enabled);
  const [autoSyncFrequency, setAutoSyncFrequency] = useState(String(settings.auto_sync_frequency_minutes));
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState("");

  async function saveMailboxSettings() {
    setSaveError("");
    const mashreq_card_accounts: Record<string, number> = {};
    for (const m of cardMappings) {
      if (m.suffix.trim() && m.accountId !== null) mashreq_card_accounts[m.suffix.trim()] = m.accountId;
    }
    const frequency = Number(autoSyncFrequency);
    if (autoSyncEnabled && (!Number.isFinite(frequency) || frequency < 15)) {
      setSaveError("Auto-sync frequency must be at least 15 minutes");
      return;
    }
    try {
      await updateSettings.mutateAsync({
        mashreq_imap_host: imapHost,
        mashreq_imap_port: imapPort,
        mashreq_imap_user: imapUser,
        mashreq_imap_password: imapPassword,
        mashreq_imap_folder: imapFolder,
        mashreq_card_accounts,
        amazon_default_account_id: amazonAccountId,
        mashreq_sync_enabled: mashreqEnabled,
        amazon_sync_enabled: amazonEnabled,
        auto_sync_enabled: autoSyncEnabled,
        auto_sync_frequency_minutes: frequency,
      });
      toast("Email connection settings saved");
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
    <>
      <p className="text-xs text-gray-500">
        Forward Mashreq's "Transaction Confirmation on Mashreq Card" alerts and Amazon "Ordered:"
        confirmations to a dedicated mailbox, then point this at it — the Import page can then
        pull new alerts/orders on demand instead of waiting for a manual CSV export. Both sources
        are off by default — enable only the ones you actually use.
      </p>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={mashreqEnabled}
            onChange={(e) => setMashreqEnabled(e.target.checked)}
          />
          Enable Mashreq sync
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={amazonEnabled}
            onChange={(e) => setAmazonEnabled(e.target.checked)}
          />
          Enable Amazon sync
        </label>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={autoSyncEnabled}
            onChange={(e) => setAutoSyncEnabled(e.target.checked)}
          />
          Automatically sync all configured emails
        </label>
        {autoSyncEnabled && (
          <Field label="Frequency (minutes, min 15)">
            <input
              type="number"
              min={15}
              className="input"
              value={autoSyncFrequency}
              onChange={(e) => setAutoSyncFrequency(e.target.value)}
            />
          </Field>
        )}
        {!autoSyncEnabled && (
          <p className="text-xs text-gray-500">
            Manual mode — use the "Sync All" button on the Import page instead.
          </p>
        )}
      </div>

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

      <Field label="Mashreq card → account mapping">
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

      <Field label="Default Amazon account">
        <Select
          className="input"
          value={amazonAccountId}
          onChange={setAmazonAccountId}
          emptyLabel="Not set"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
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
        <button className="btn-primary h-9 text-sm whitespace-nowrap" onClick={saveMailboxSettings}>
          Save email connection settings
        </button>
      </div>
    </>
  );
}

function AiAssistantForm({ settings }: { settings: Settings }) {
  const updateSettings = useUpdateSettings();
  const [provider, setProvider] = useState(settings.llm_provider || "anthropic");
  const [apiKey, setApiKey] = useState(settings.llm_api_key);
  const [model, setModel] = useState(settings.llm_model);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    try {
      await updateSettings.mutateAsync({ llm_provider: provider, llm_api_key: apiKey, llm_model: model });
      toast("AI Assistant settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <>
      <p className="text-xs text-gray-500">
        Powers the "Ask" widget on the Dashboard — questions you type, and the aggregated
        numbers needed to answer them, are sent to the provider below. Nothing is sent unless
        you ask a question.
      </p>
      <Field label="Provider">
        <Select
          className="input"
          value={provider}
          onChange={(v) => v && setProvider(v)}
          allowEmpty={false}
          options={[
            { value: "anthropic", label: "Anthropic (Claude)" },
            { value: "openai", label: "OpenAI (GPT)" },
          ]}
        />
      </Field>
      <Field label="API key">
        <input
          type="password"
          className="input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…"
        />
      </Field>
      <Field label="Model override (optional)">
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === "anthropic" ? "claude-sonnet-5" : "gpt-5"}
        />
      </Field>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button className="btn-primary h-9 text-sm whitespace-nowrap" onClick={save}>
        Save AI Assistant settings
      </button>
      <AssistantMemory settings={settings} />
    </>
  );
}

function AssistantMemory({ settings }: { settings: Settings }) {
  const updateSettings = useUpdateSettings();

  async function clear() {
    if (!confirm("Clear everything the assistant has remembered about you?")) return;
    await updateSettings.mutateAsync({ insights_memory: "" });
    toast("Assistant memory cleared");
  }

  if (!settings.insights_memory) return null;

  return (
    <div className="mt-2 border-t border-white/10 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs tracking-wide text-gray-500 uppercase">Assistant memory</span>
        <button className="text-xs text-rose-400 hover:underline" onClick={clear}>
          Clear memory
        </button>
      </div>
      <pre className="input h-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-gray-300">
        {settings.insights_memory}
      </pre>
    </div>
  );
}
