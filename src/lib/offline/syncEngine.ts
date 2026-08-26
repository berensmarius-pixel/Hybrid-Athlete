"use client";

/**
 * Offline-Sync-Engine: optimistische UI + dauerhafte Mutations-Queue.
 *
 * Ablauf beim Loggen (z. B. Gym-Session beenden, auch komplett offline):
 *  1. React-State wird sofort aktualisiert (optimistische UI, bestehende Domänen).
 *  2. Snapshot landet write-through im IndexedDB-Cache (workouts / weight_history).
 *  3. Mutation läuft in die IndexedDB `sync_queue` (durable, überlebt Tab-Crashs).
 *  4. Flush: bei `online`-Event, App-Start oder manuell werden alle offenen
 *     Einträge pro Entity kollabiert (neuester Snapshot gewinnt) und an das
 *     Cloud-Backend (/api/state/bulk → Supabase) gesendet.
 *
 * Status-Änderungen werden als `ha-offline-sync` CustomEvents broadcastet,
 * damit UI-Komponenten (OfflineSyncIndicator) reagieren können.
 */

import {
  countOpenSyncEntries,
  deleteSyncEntries,
  enqueueSyncEntry,
  getAllWeightEntries,
  getAllWorkouts,
  getOpenSyncEntries,
  markSyncEntryFailed,
  putWeightEntries,
  putWorkouts,
  type SyncEntity,
  type SyncQueueEntry,
} from "./db";
import type { BodyWeightEntry, LoggedSession } from "@/types";

const FLUSH_DEBOUNCE_MS = 800;
const RETRY_INTERVAL_MS = 30_000;
const MAX_AUTO_RETRIES = 12;
const STARTUP_FLUSH_DELAY_MS = 3500;
const FETCH_TIMEOUT_MS = 10_000;

export const SYNC_EVENT = "ha-offline-sync";

export type SyncEventType =
  | "queued"
  | "queued-offline"
  | "synced"
  | "failed"
  | "idle";

export interface SyncEventDetail {
  type: SyncEventType;
  pendingCount?: number;
}

// ─── Module-State ─────────────────────────────────────────────────────────────

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let initialized = false;

function broadcast(detail: SyncEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SyncEventDetail>(SYNC_EVENT, { detail }));
}

async function broadcastPending() {
  broadcast({ type: "idle", pendingCount: await countOpenSyncEntries() });
}

// ─── Kollaps: neuester Snapshot pro Entity gewinnt ────────────────────────────

/** Reiner Helfer (testbar): kollabiert Queue-Einträge auf den neuesten je Target-Key. */
export function collapseQueueEntries<T extends Pick<SyncQueueEntry, "targetKey" | "createdAt">>(
  entries: readonly T[]
): T[] {
  const latest = new Map<string, number>();
  for (const e of entries) {
    const prev = latest.get(e.targetKey);
    if (prev === undefined || (e.createdAt ?? 0) > prev) {
      latest.set(e.targetKey, e.createdAt ?? 0);
    }
  }
  return entries.filter((e) => latest.get(e.targetKey) === (e.createdAt ?? 0));
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/**
 * Session-Mutation aufzeichnen: IndexedDB-Cache aktualisieren + Sync-Eintrag
 * anlegen. Wird von useSessionsDomain nach JEDER Änderung aufgerufen – der
 * neueste Snapshot repräsentiert immer den kompletten lokalen Stand.
 */
export async function recordSessionsMutation(sessions: readonly LoggedSession[]): Promise<void> {
  if (typeof window === "undefined") return;
  initEngine();
  try {
    await putWorkouts(sessions);
  } catch { /* Cache ist Best-Effort */ }
  await enqueueSnapshot("sessions", "hybrid_athlete_sessions", sessions);
}

/** Körpergewicht-Mutation aufzeichnen (gleicher Mechanismus wie Sessions). */
export async function recordBodyWeightMutation(entries: readonly BodyWeightEntry[]): Promise<void> {
  if (typeof window === "undefined") return;
  initEngine();
  try {
    await putWeightEntries(entries);
  } catch { /* Cache ist Best-Effort */ }
  await enqueueSnapshot("body_weight", "hybrid_athlete_body_weight", entries);
}

async function enqueueSnapshot(
  entity: SyncEntity,
  targetKey: string,
  snapshot: unknown
): Promise<void> {
  try {
    await enqueueSyncEntry({ entity, targetKey, snapshot, createdAt: Date.now() });
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    broadcast({
      type: offline ? "queued-offline" : "queued",
      pendingCount: await countOpenSyncEntries(),
    });
    scheduleFlush();
  } catch {
    // Queue voll/fehlerhaft → nicht fatal, stateStore-Spiegelung greift weiter
  }
}

/** Manueller Flush (z. B. durch Klick auf den Sync-Indikator). */
export async function flushSyncQueue(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (flushing) return true;

  const open = await getOpenSyncEntries();
  if (open.length === 0) {
    await broadcastPending();
    return true;
  }

  flushing = true;
  let success = true;
  // Pro Entity nur den neuesten Snapshot senden (idempotente Voll-PUTs)
  const collapsed = collapseQueueEntries(open);
  const attemptedIds = collapsed.map((e) => e.id!).filter(Boolean);
  try {
    const staleIds = new Set(
      open.filter((e) => !collapsed.includes(e)).map((e) => e.id!).filter(Boolean)
    );
    await deleteSyncEntries([...staleIds]);

    const res = await fetch("/api/state/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: collapsed.map((e) => ({
          key: e.targetKey,
          value: e.snapshot,
          deleted: false,
        })),
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Erfolg: abgearbeitete Einträge entfernen
    await deleteSyncEntries(attemptedIds);

    const remaining = await countOpenSyncEntries();
    if (remaining > 0) {
      // Weitere Einträge (z. B. zwischenzeitlich hinzugekommen) nachschieben
      scheduleFlush();
    } else {
      broadcast({ type: "synced", pendingCount: 0 });
      broadcast({ type: "idle", pendingCount: 0 });
    }
  } catch (err) {
    success = false;
    const message = err instanceof Error ? err.message : String(err);
    await Promise.all(attemptedIds.map((id) => markSyncEntryFailed(id, message)));
    broadcast({ type: "failed", pendingCount: await countOpenSyncEntries() });
    ensureRetryLoop();
  } finally {
    flushing = false;
  }
  return success;
}

export function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSyncQueue();
  }, FLUSH_DEBOUNCE_MS);
}

function ensureRetryLoop() {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setInterval(async () => {
    const open = await getOpenSyncEntries();
    const retriable = open.some(
      (e) => (e.retryCount ?? 0) < MAX_AUTO_RETRIES
    );
    if (!retriable) {
      clearInterval(retryTimer!);
      retryTimer = null;
      return;
    }
    void flushSyncQueue();
  }, RETRY_INTERVAL_MS);
}

/**
 * Initialer Fallback-Hydrations-Lesezugriff: Sessions aus dem IndexedDB-Cache
 * (falls localStorage leer ist, z. B. nach Browser-Datenbereinigung).
 */
export async function hydrateWorkoutsFromCache(): Promise<LoggedSession[] | null> {
  try {
    const workouts = await getAllWorkouts();
    return workouts.length > 0 ? workouts : null;
  } catch {
    return null;
  }
}

export async function hydrateWeightFromCache(): Promise<BodyWeightEntry[] | null> {
  try {
    const entries = await getAllWeightEntries();
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

// ─── Engine-Init: Netzwerk-Listener ───────────────────────────────────────────

let initPromise: Promise<void> | null = null;

/**
 * Initialisiert die Engine einmalig pro Seitenlebenszyklus: registriert den
 * Netzwerkstatus-Listener, flusht beim App-Start hängengebliebene Mutationen
 * und broadcastet den initialen Queue-Stand.
 */
export function initOfflineSync(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      initialized = true;
      // Kernanforderung: Netzwerkstatus-Listener flush't die Queue
      window.addEventListener("online", () => {
        void flushSyncQueue();
      });
      window.addEventListener("offline", () => {
        broadcast({ type: "queued-offline" });
      });
      await broadcastPending();
      // Verzögerter Start-Flush: wartet auf die Hydratation der Domänen,
      // damit keine veralteten Snapshots frischere Server-Stände über-
      // schreiben können (gleiche Logik wie der Initial-Pull im stateStore).
      setTimeout(() => {
        void flushSyncQueue();
      }, STARTUP_FLUSH_DELAY_MS);
    })();
  }
  return initPromise;
}

function initEngine() {
  if (initialized || typeof window === "undefined") return;
  void initOfflineSync();
}
