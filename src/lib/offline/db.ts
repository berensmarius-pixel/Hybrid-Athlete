"use client";

/**
 * Client-seitige Offline-Datenbank (IndexedDB, via idb).
 *
 * Stores:
 *  - workouts       → gecachte Gym-/Endurance-Sessions (LoggedSession)
 *  - exercises      → Wger-Übungskatalog & Suchergebnisse (Stale-While-Revalidate)
 *  - weight_history → Körpergewicht/-zusammensetzung (BodyCompositionEntry)
 *  - sync_queue     → ungesyncte Mutationen für den Cloud-Backend-Flush
 *
 * Alle Zugriffe sind SSR-sicher (no-op auf dem Server).
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BodyWeightEntry, LoggedSession } from "@/types";

interface HybridAthleteDB extends DBSchema {
  workouts: {
    key: string;
    value: LoggedSession;
    indexes: { date: string };
  };
  exercises: {
    key: string;
    value: ExerciseCacheEntry;
    indexes: { cachedAt: number };
  };
  weight_history: {
    key: string;
    value: BodyWeightEntry;
    indexes: { date: string };
  };
  sync_queue: {
    key: number;
    value: SyncQueueEntry;
    indexes: { status: SyncStatus; createdAt: number };
  };
}

export type SyncEntity = "sessions" | "body_weight";

export type SyncStatus = "pending" | "failed";

/** Eine ungesyncte Mutation: vollständiger Snapshot der betroffenen Kollektion. */
export interface SyncQueueEntry {
  id?: number;
  entity: SyncEntity;
  /** Server-State-Key, z. B. "hybrid_athlete_sessions" */
  targetKey: string;
  /** Snapshot zum Mutationszeitpunkt – Flush kollabiert pro Entity auf den neuesten. */
  snapshot: unknown;
  status: SyncStatus;
  retryCount: number;
  createdAt: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export interface ExerciseCacheEntry {
  /** Cache-Key: "info:{baseId}" oder "search:{term}" */
  cacheKey: string;
  cachedAt: number;
  data: unknown;
}

const DB_NAME = "hybrid-athlete-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HybridAthleteDB>> | null = null;

function getDb(): Promise<IDBPDatabase<HybridAthleteDB>> | null {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  if (!dbPromise) {
    dbPromise = openDB<HybridAthleteDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("workouts")) {
          const store = db.createObjectStore("workouts", { keyPath: "id" });
          store.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("exercises")) {
          const store = db.createObjectStore("exercises", { keyPath: "cacheKey" });
          store.createIndex("cachedAt", "cachedAt");
        }
        if (!db.objectStoreNames.contains("weight_history")) {
          const store = db.createObjectStore("weight_history", { keyPath: "id" });
          store.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("sync_queue")) {
          const store = db.createObjectStore("sync_queue", { keyPath: "id", autoIncrement: true });
          store.createIndex("status", "status");
          store.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function putWorkouts(sessions: readonly LoggedSession[]): Promise<void> {
  const db = await getDb();
  if (!db || sessions.length === 0) return;
  const tx = db.transaction("workouts", "readwrite");
  await Promise.all([...sessions.map((s) => tx.store.put(s)), tx.done]);
}

export async function getAllWorkouts(): Promise<LoggedSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllFromIndex("workouts", "date").then((list) => list.reverse());
}

export async function clearWorkouts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.clear("workouts");
}

// ─── Weight History ───────────────────────────────────────────────────────────

export async function putWeightEntries(entries: readonly BodyWeightEntry[]): Promise<void> {
  const db = await getDb();
  if (!db || entries.length === 0) return;
  const tx = db.transaction("weight_history", "readwrite");
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

export async function getAllWeightEntries(): Promise<BodyWeightEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAllFromIndex("weight_history", "date").then((list) => list.reverse());
}

// ─── Exercise Catalog ─────────────────────────────────────────────────────────

const EXERCISE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

export function exerciseInfoCacheKey(baseId: number): string {
  return `info:${baseId}`;
}

export function exerciseSearchCacheKey(term: string): string {
  return `search:${term.trim().toLowerCase()}`;
}

export async function getCachedExercise<T>(cacheKey: string): Promise<{ data: T; fresh: boolean } | null> {
  const db = await getDb();
  if (!db) return null;
  const entry = await db.get("exercises", cacheKey);
  if (!entry) return null;
  return {
    data: entry.data as T,
    fresh: Date.now() - entry.cachedAt < EXERCISE_TTL_MS,
  };
}

export async function putCachedExercise(cacheKey: string, data: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.put("exercises", { cacheKey, data, cachedAt: Date.now() });
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export async function enqueueSyncEntry(
  entry: Omit<SyncQueueEntry, "id" | "status" | "retryCount"> & { status?: SyncStatus }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.add("sync_queue", {
    ...entry,
    status: entry.status ?? "pending",
    retryCount: 0,
  });
}

/** Alle offenen Einträge (pending + failed), älteste zuerst. */
export async function getOpenSyncEntries(): Promise<SyncQueueEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const pending = await db.getAllFromIndex("sync_queue", "status", "pending");
  const failed = await db.getAllFromIndex("sync_queue", "status", "failed");
  return [...pending, ...failed].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );
}

export async function countOpenSyncEntries(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Nur "pending" und "failed" existieren – offen = Gesamtanzahl
  return db.count("sync_queue");
}

export async function deleteSyncEntries(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  const tx = db.transaction("sync_queue", "readwrite");
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function markSyncEntryFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const entry = await db.get("sync_queue", id);
  if (!entry) return;
  await db.put("sync_queue", {
    ...entry,
    status: "failed",
    retryCount: (entry.retryCount ?? 0) + 1,
    lastAttemptAt: Date.now(),
    lastError: error.slice(0, 300),
  });
}
