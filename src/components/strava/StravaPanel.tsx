"use client";

import { X, Link2, LogOut, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useStrava } from "@/context/StravaContext";

interface StravaPanelProps {
  onClose: () => void;
}

export default function StravaPanel({ onClose }: StravaPanelProps) {
  const { connection, isSyncing, mockConnect, connectWithStrava, disconnect, sync } = useStrava();
  const { isConnected, athlete, lastSynced } = connection;

  const formattedSyncTime = lastSynced
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(lastSynced))
    : null;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      <div className="flex-1 flex flex-col h-full p-6 pb-10 safe-bottom overflow-hidden">
        {/* Handle bar */}
        <div className="w-10 h-1 rounded-full bg-zinc-700 mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Strava flame icon (SVG) */}
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-orange-500 fill-current"
                aria-hidden="true"
              >
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Strava</h2>
              <p className="text-xs text-zinc-500">Aktivitäten synchronisieren</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Connection status */}
        {isConnected ? (
          <div className="space-y-4">
            {/* Connected badge */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/25">
              <CheckCircle2 size={20} className="text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-green-400">Erfolgreich verbunden</p>
                {athlete && (
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {athlete.firstname} {athlete.lastname}
                  </p>
                )}
              </div>
            </div>

            {/* Last synced */}
            {formattedSyncTime && (
              <p className="text-xs text-zinc-500 text-center">
                Zuletzt synchronisiert: {formattedSyncTime}
              </p>
            )}

            {/* Sync button */}
            <button
              onClick={() => sync()}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-orange-500 hover:bg-orange-400 active:bg-orange-600
                         text-white font-semibold text-sm transition-colors
                         disabled:opacity-60 disabled:pointer-events-none"
            >
              {isSyncing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Wird synchronisiert …
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
                  </svg>
                  Strava synchronisieren
                </>
              )}
            </button>

            {/* Disconnect */}
            <button
              onClick={disconnect}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl
                         text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              <LogOut size={14} />
              Verbindung trennen
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Info box */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-800/60 border border-zinc-700/40">
              <AlertCircle size={18} className="text-zinc-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-400 leading-relaxed">
                Verbinde dein Strava-Konto, um Läufe und Radausfahrten automatisch
                in deinen Trainingsplan zu importieren.
              </p>
            </div>

            {/* Real OAuth button */}
            <button
              onClick={connectWithStrava}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-orange-500 hover:bg-orange-400 active:bg-orange-600
                         text-white font-semibold text-sm transition-colors"
            >
              <Link2 size={16} />
              Mit Strava verbinden
            </button>

            {/* Demo mode separator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-xs text-zinc-600">oder</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* Mock / demo connect */}
            <button
              onClick={mockConnect}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl
                         text-sm text-zinc-400 border border-zinc-700/60
                         hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              Demo-Verbindung (Testdaten)
            </button>

            <p className="text-xs text-zinc-600 text-center leading-relaxed">
              Du benötigst einen Strava-Account und musst{" "}
              <code className="text-zinc-500">NEXT_PUBLIC_STRAVA_CLIENT_ID</code> in deiner
              <code className="text-zinc-500"> .env.local</code> setzen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
