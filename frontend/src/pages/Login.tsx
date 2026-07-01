import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, ApiError } from "../api/client";

export default function LoginPage({ setupRequired }: { setupRequired: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (setupRequired && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await api.post(setupRequired ? "/api/auth/setup" : "/api/auth/login", { password });
      qc.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={submit} className="glass w-80 p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white">
            <KeyRound size={22} />
          </div>
          <h1 className="text-lg font-semibold">
            {setupRequired ? "Create a password" : "Welcome back"}
          </h1>
          <p className="text-center text-xs text-gray-400">
            {setupRequired
              ? "Protect your finances with a password (min 4 chars)."
              : "Enter your password to unlock."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            className="input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {setupRequired && (
            <input
              type="password"
              className="input"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || password.length < 4}>
            {setupRequired ? "Set password" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}
