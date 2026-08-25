"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

type GateStatus = "checking" | "locked" | "open";

/**
 * Sperrt die App hinter dem APP_API_SECRET, wenn auf dem Server konfiguriert.
 * Bei nicht konfiguriertem Secret (lokale Entwicklung) wird sofort durchgelassen.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/check")
      .then((res) => {
        if (active) setStatus(res.ok ? "open" : "locked");
      })
      .catch(() => {
        if (active) setStatus("locked");
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setStatus("open");
        setPassword("");
      } else {
        setError("Falsches Passwort.");
      }
    } catch {
      setError("Verbindungsfehler. Läuft der Server?");
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="animate-spin text-zinc-600" size={28} />
      </div>
    );
  }

  if (status === "open") return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Lock size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100">
              Hybrid Athlete
            </h1>
            <p className="text-xs text-zinc-500">
              Zugriff mit APP_API_SECRET geschützt
            </p>
          </div>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="API-Passwort"
          autoFocus
          className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <Button type="submit" disabled={busy || !password} className="w-full">
          {busy ? <Loader2 className="animate-spin" size={16} /> : "Entsperren"}
        </Button>

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Das Passwort steht in <code>.env.local</code> unter{" "}
          <code>APP_API_SECRET</code> und wird 30 Tage als Cookie gespeichert.
        </p>
      </form>
    </div>
  );
}
