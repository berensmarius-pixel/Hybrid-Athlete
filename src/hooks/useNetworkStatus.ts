"use client";

/**
 * Netzwerk- & Sync-Status: online/offline (window online/offline Events)
 * plus Anzahl offener Mutationen aus der IndexedDB-Sync-Queue.
 */

import { useCallback, useEffect, useState } from "react";
import { countOpenSyncEntries } from "@/lib/offline/db";
import {
  initOfflineSync,
  SYNC_EVENT,
  type SyncEventDetail,
} from "@/lib/offline/syncEngine";

export function useNetworkStatus() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    void initOfflineSync();
    void countOpenSyncEntries().then(setPendingCount);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<SyncEventDetail>).detail;
      if (detail && typeof detail.pendingCount === "number") {
        setPendingCount(detail.pendingCount);
      }
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, []);

  const forceSync = useCallback(() => {
    void import("@/lib/offline/syncEngine").then((m) => m.flushSyncQueue());
  }, []);

  return { online, pendingCount, forceSync };
}
