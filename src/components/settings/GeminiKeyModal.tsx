"use client";

import { useState, useEffect } from "react";
import { X, KeyRound, CheckCircle2, AlertCircle, Trash2, Loader2 } from "lucide-react";
import {
  checkGeminiConfigured,
  saveGeminiApiKey,
  invalidateGeminiConfigCache,
} from "@/lib/gemini/client";

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Einstellungen für den Gemini-API-Key.
 * Der Key wird an den auth-gated Server-Endpoint /api/settings/gemini-key
 * übergeben und dort gespeichert (Supabase app_state oder lokale Datei).
 * Er landet nie im localStorage und wird nach dem Speichern nie wieder
 * an den Browser zurückgegeben (kein GET).
 */
export default function GeminiKeyModal({ isOpen, onClose }: GeminiKeyModalProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setConfigured(null);
    setStatusMsg(null);
    setKeyInput("");
    void checkGeminiConfigured().then(setConfigured);
  }, [isOpen]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const clean = keyInput.trim();
    if (!clean || saving) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const ok = await saveGeminiApiKey(clean);
      if (ok) {
        // Status frisch vom Server abfragen (Cache wurde invalidiert)
        const nowConfigured = await checkGeminiConfigured();
        setConfigured(nowConfigured);
        setStatusMsg({
          ok: nowConfigured,
          text: nowConfigured
            ? "API-Key gespeichert – der KI-Coach ist jetzt aktiv."
            : "Gespeichert, aber der Server meldet weiterhin keinen Key. Bitte Dev-Server neu starten oder Key prüfen.",
        });
        setKeyInput("");
      } else {
        setStatusMsg({ ok: false, text: "Speichern fehlgeschlagen. Bist du eingeloggt?" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await fetch("/api/settings/gemini-key", { method: "DELETE" });
      invalidateGeminiConfigCache();
      setConfigured(await checkGeminiConfigured());
      setStatusMsg({ ok: false, text: "API-Key vom Server gelöscht." });
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">KI-Status &amp; API-Key</h2>
              <p className="text-xs text-zinc-400">Gemini-Zugang für Coach, Foto-Logger &amp; Rezepte</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Status */}
          <div
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
              configured === null
                ? "bg-zinc-900 border-zinc-800 text-zinc-400"
                : configured
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/25 text-rose-300"
            }`}
          >
            {configured === null ? (
              <Loader2 size={15} className="animate-spin shrink-0" />
            ) : configured ? (
              <CheckCircle2 size={15} className="shrink-0" />
            ) : (
              <AlertCircle size={15} className="shrink-0" />
            )}
            <span>
              {configured === null
                ? "Prüfe Server-Status…"
                : configured
                  ? "Gemini ist konfiguriert und einsatzbereit."
                  : "Kein API-Key auf dem Server gefunden."}
            </span>
          </div>

          {/* Key-Form */}
          <form onSubmit={handleSave} className="space-y-3">
            <label className="text-xs font-bold text-zinc-300 block" htmlFor="gemini-key-input">
              Neuen Gemini API-Key hinterlegen
            </label>
            <input
              id="gemini-key-input"
              type="password"
              autoComplete="off"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="AIza…"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-200 focus:border-purple-400 focus:outline-none"
            />
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Der Key wird verschlüsselt übertragen, serverseitig gespeichert und verlässt den
              Server danach nicht mehr (er ist später weder sichtbar noch abrufbar). Alternativ
              kannst du ihn auch als <code className="text-zinc-400">GEMINI_API_KEY</code> in{" "}
              <code className="text-zinc-400">.env.local</code> setzen.
            </p>
            <button
              type="submit"
              disabled={!keyInput.trim() || saving}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              <span>{saving ? "Speichere…" : "Key speichern"}</span>
            </button>
          </form>

          {/* Feedback */}
          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                statusMsg.ok
                  ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-300"
                  : "bg-rose-500/10 border border-rose-500/25 text-rose-300"
              }`}
            >
              {statusMsg.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Remove */}
          {configured && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={13} />
              <span>Vom Server entfernen</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
