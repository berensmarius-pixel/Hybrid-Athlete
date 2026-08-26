"use client";

/**
 * Sync-Indikator: zeigt Offline-Status und offene (ungesyncte) Mutationen aus
 * der IndexedDB-Sync-Queue. Klick löst einen manuellen Flush aus.
 * Toasts informieren über Offline-Speicherung und erfolgreiche Synchronisation.
 */

import { useEffect, useRef, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  SYNC_EVENT,
  flushSyncQueue,
  type SyncEventDetail,
} from "@/lib/offline/syncEngine";

export default function OfflineSyncIndicator() {
  const { online, pendingCount } = useNetworkStatus();
  const [syncing, setSyncing] = useState(false);
  const lastPendingRef = useRef(0);

  // Toast-Feedback zu Sync-Events (nur bei relevanten Übergängen)
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<SyncEventDetail>).detail;
      if (!detail) return;

      if (detail.type === "queued-offline") {
        toast.info("Offline gespeichert", {
          description: "Änderungen werden automatisch synchronisiert, sobald du wieder online bist.",
          duration: 3500,
        });
      } else if (detail.type === "failed") {
        toast.warning("Synchronisierung fehlgeschlagen", {
          description: "Daten bleiben lokal sicher – erneuter Versuch beim nächsten Online-Event.",
          duration: 5000,
        });
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  // Erfolgs-Toast nur, wenn vorher tatsächlich etwas offen war
  useEffect(() => {
    if (pendingCount === 0 && lastPendingRef.current > 0) {
      toast.success("Alle Daten synchronisiert", { duration: 3000 });
    }
    lastPendingRef.current = pendingCount;
  }, [pendingCount]);

  if (online && pendingCount === 0) return null;

  async function handleClick() {
    setSyncing(true);
    try {
      await flushSyncQueue();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!online || syncing}
      className={`
        fixed bottom-20 md:bottom-5 right-4 z-40
        flex items-center gap-2 px-3.5 py-2 rounded-full
        text-xs font-bold border backdrop-blur-xl shadow-lg shadow-black/40
        transition-all cursor-pointer select-none
        ${
          !online
            ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
            : "bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25"
        }
      `}
      title={
        !online
          ? "Offline – Änderungen werden lokal gespeichert und später synchronisiert"
          : "Ungesyncte Änderungen jetzt übertragen"
      }
    >
      {!online ? (
        <CloudOff size={14} />
      ) : (
        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
      )}
      <span>
        {!online
          ? pendingCount > 0
            ? `Offline · ${pendingCount} lokal`
            : "Offline-Modus"
          : syncing
            ? "Synchronisiere…"
            : `${pendingCount} ungesynct`}
      </span>
    </button>
  );
}
