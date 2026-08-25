"use client";

/**
 * Zentraler Persistenz-Adapter: localStorage als sofortiger lokaler Cache,
 * Supabase (via /api/state) als Server-Source-of-Truth.
 *
 * - Write-through: Schreibungen landen sofort im localStorage und werden
 *   gebündelt (debounced) an den Server gespiegelt.
 * - Offline-Queue: fehlgeschlagene Spiegelungen bleiben in einer Queue
 *   (localStorage) und werden bei Online-Event / Intervall nachgeschoben.
 * - Hydration: Hooks registrieren ihre Keys; pro Tick ein Sammel-GET.
 *   Server gewinnt bei Konflikt – außer es gibt pending lokale Änderungen.
 * - Migration: lokal vorhandene Keys, die dem Server fehlen, werden
 *   automatisch hochgeladen (First-Run-Nachzug).
 */

import { BACKUP_KEYS } from "./keys";

const QUEUE_STORAGE_KEY = "ha_sync_queue";
const SEEN_STORAGE_KEY = "ha_sync_seen";
const FLUSH_DEBOUNCE_MS = 1200;
const FETCH_TIMEOUT_MS = 8000;

interface QueueEntry {
  key: string;
  /** null = Lösch-Tombstone */
  value: unknown;
  deleted?: boolean;
}

// ─── Module-State ─────────────────────────────────────────────────────────────

let queue: QueueEntry[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let listenersInitialized = false;

/**
 * Marker: Werte, die gerade vom Server übernommen wurden (Echo-Suppression,
 * damit der Persist-Effekt des Hooks sie nicht zurück zur Queue schickt).
 */
const serverAppliedJson = new Map<string, string>();

// ─── Queue-Helpers ────────────────────────────────────────────────────────────

function loadQueue(): QueueEntry[] {
  if (queue) return queue;
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    queue = raw ? (JSON.parse(raw) as QueueEntry[]) : [];
    if (!Array.isArray(queue)) queue = [];
  } catch {
    queue = [];
  }
  return queue;
}

function saveQueue() {
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue ?? []));
  } catch {
    // Queue ist Best-Effort – Quota etc. nicht fatal
  }
}

function enqueue(entry: QueueEntry) {
  const q = loadQueue();
  const idx = q.findIndex((e) => e.key === entry.key);
  if (idx >= 0) q[idx] = entry;
  else q.push(entry);
  saveQueue();
  markSeen(entry.key);
  scheduleFlush();
}

function hasPending(key: string): boolean {
  return loadQueue().some((e) => e.key === key);
}

function removeFromQueue(keys: Set<string>) {
  const q = loadQueue();
  const next = q.filter((e) => !keys.has(e.key));
  if (next.length !== q.length) {
    queue = next;
    saveQueue();
  }
}

// ─── Seen-Marker ──────────────────────────────────────────────────────────────
// Markiert, dass ein Key an der Server-Synchronisation teilnimmt. Nur dann
// darf der globale Initial-Pull lokale Werte überschreiben – nie bei
// Legacy-Daten, die noch nie gespiegelt wurden (Schutz vor Datenverlust).

function loadSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markSeen(key: string) {
  const seen = loadSeen();
  if (seen.has(key)) return;
  seen.add(key);
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...seen]));
  } catch { /* ignore */ }
}

// ─── Flush ────────────────────────────────────────────────────────────────────

export function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushQueue(): Promise<boolean> {
  const q = loadQueue();
  if (q.length === 0) return true;

  const batch = [...q];
  try {
    const res = await fetch("/api/state/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: batch.map((e) => ({
          key: e.key,
          value: e.deleted ? null : e.value,
          deleted: e.deleted === true,
        })),
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    removeFromQueue(new Set(batch.map((e) => e.key)));
    return loadQueue().length === 0;
  } catch {
    ensureRetryLoop();
    return false;
  }
}

function ensureRetryLoop() {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setInterval(() => {
    if (loadQueue().length === 0) {
      clearInterval(retryTimer!);
      retryTimer = null;
      return;
    }
    void flushQueue();
  }, 30_000);
}

function initListeners() {
  if (listenersInitialized || typeof window === "undefined") return;
  listenersInitialized = true;
  window.addEventListener("online", () => void flushQueue());
  // Beim Start hängengebliebene Queue nachschieben + geräteübergreifender Pull
  setTimeout(() => {
    void flushQueue();
    void globalInitialPull();
  }, 4000);
}

/**
 * Geräteübergreifender Initial-Pull für Service-verwaltete Keys
 * (Wetter-Location, Einkaufsliste, Kalender …), die keinen Hook haben.
 * Hooks übernehmen ihre Keys selbst; applyServerValue priorisiert korrekt.
 * Überschrieben wird nur, wenn dieses Gerät den Key bereits sync't hat oder
 * lokal nichts existiert – niemals ungespiegelte Legacy-Daten vernichten.
 */
async function globalInitialPull() {
  const { SYNCED_KEYS } = await import("./keys");
  const serverValues = await hydrateFromServer([...SYNCED_KEYS]);
  for (const [key, value] of serverValues) {
    const seen = loadSeen().has(key);
    let hasLocal = true;
    try {
      hasLocal = window.localStorage.getItem(key) != null;
    } catch { /* ignore */ }
    if (seen || !hasLocal) {
      applyServerValue(key, value);
    }
  }
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────

/** Sync-Lesezugriff (nur localStorage-Cache, wie bisher). */
export function readStoredJson<T>(
  key: string,
  fallback: T,
  validate?: (raw: unknown) => T | null
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const validated = validate ? validate(parsed) : (parsed as T);
    return validated === null || validated === undefined ? fallback : validated;
  } catch {
    return fallback;
  }
}

/**
 * Sofortiger lokaler Schreibzugriff + Server-Spiegelung (debounced).
 * `expectedServerJson` unterdrückt das Echo von gerade übernommenen Server-Werten.
 */
export function writeState(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  initListeners();

  const json = safeStringify(value);
  if (json !== null && serverAppliedJson.get(key) === json) {
    serverAppliedJson.delete(key);
    return;
  }

  try {
    window.localStorage.setItem(key, json ?? JSON.stringify(null));
  } catch (err) {
    warnStorageError(key, err, "write");
  }

  enqueue({ key, value });
}

export function removeState(key: string) {
  if (typeof window === "undefined") return;
  initListeners();
  try {
    window.localStorage.removeItem(key);
  } catch { /* ignore */ }
  enqueue({ key, value: null, deleted: true });
}

// ─── Batch-Hydration ──────────────────────────────────────────────────────────

interface PendingHydration {
  keys: Set<string>;
  resolve: (result: Map<string, unknown>) => void;
}

let hydrationBatch: PendingHydration | null = null;

/**
 * Registriert Keys für den nächsten Sammel-GET. Auflösung enthält nur Keys,
 * die der Server tatsächlich hat.
 */
export function hydrateFromServer(keys: string[]): Promise<Map<string, unknown>> {
  if (typeof window === "undefined") return Promise.resolve(new Map());
  initListeners();

  return new Promise((resolve) => {
    if (!hydrationBatch) {
      hydrationBatch = { keys: new Set(), resolve: () => {} };
      // Ein Tick sammeln, dann ein einzelner Request
      setTimeout(async () => {
        const batch = hydrationBatch;
        hydrationBatch = null;
        if (!batch || batch.keys.size === 0) return resolve(new Map());

        const result = new Map<string, unknown>();
        try {
          const res = await fetch(
            `/api/state?keys=${encodeURIComponent([...batch.keys].join(","))}`,
            { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
          );
          if (res.ok) {
            const data = (await res.json()) as {
              success: boolean;
              state?: Record<string, unknown>;
            };
            if (data.success && data.state) {
              for (const [k, v] of Object.entries(data.state)) result.set(k, v);
            }
          }
        } catch {
          // Server nicht erreichbar → leeres Ergebnis, lokale Daten gelten weiter
        }

        migrateMissingKeys(batch.keys, result);
        batch.resolve(result);
      }, 0);
    }

    hydrationBatch.keys = new Set([...hydrationBatch.keys, ...keys]);
    const prevResolve = hydrationBatch.resolve;
    hydrationBatch.resolve = (map) => {
      prevResolve(map);
      resolve(map);
    };
  });
}

/**
 * First-Run-Migration: lokal gepflegte Keys, die dem Server noch fehlen,
 * werden hochgeladen (idempotent).
 */
function migrateMissingKeys(
  requested: Set<string>,
  serverResult: Map<string, unknown>
) {
  for (const key of requested) {
    if (serverResult.has(key)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        enqueue({ key, value: JSON.parse(raw) });
      }
    } catch { /* ignore */ }
  }
}

/**
 * Übernimmt einen Server-Wert: überschreibt den lokalen Cache und markiert
 * den Wert als "von Server angewendet", damit kein Echo in die Queue läuft.
 * Rückgabe false, wenn lokale pending Änderungen Vorrang haben.
 */
export function applyServerValue(key: string, value: unknown): boolean {
  if (hasPending(key)) return false;
  const json = safeStringify(value);

  let currentJson: string | null = null;
  try {
    currentJson = window.localStorage.getItem(key);
  } catch { /* ignore */ }
  if (currentJson !== null && currentJson === json) return true;

  try {
    window.localStorage.setItem(key, json ?? JSON.stringify(null));
  } catch (err) {
    warnStorageError(key, err, "write");
    return false;
  }
  if (json !== null) serverAppliedJson.set(key, json);
  markSeen(key);
  return true;
}

// ─── Backup-Unterstützung ─────────────────────────────────────────────────────

/** Alle relevanten lokalen Daten als Objekt (für Export). */
export function exportBackupData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    try {
      const val = window.localStorage.getItem(key);
      if (val != null) data[key] = JSON.parse(val);
    } catch { /* skip unparseable */ }
  }
  return data;
}

/** Import: lokal schreiben + an Server spiegeln. */
export function importBackupData(data: Record<string, unknown>) {
  for (const key of BACKUP_KEYS) {
    if (!(key in data)) continue;
    try {
      window.localStorage.setItem(key, JSON.stringify(data[key]));
      enqueue({ key, value: data[key] });
    } catch { /* ignore */ }
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function warnStorageError(
  key: string,
  err: unknown,
  operation: "read" | "write"
) {
  const quota = isQuotaError(err);
  console.warn(
    `[storage] ${operation === "read" ? "Lesen" : "Schreiben"} von "${key}" fehlgeschlagen${quota ? " (localStorage voll)" : ""}:`,
    err
  );
  if (quota && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("ha-storage-quota", { detail: { key } })
    );
  }
}
