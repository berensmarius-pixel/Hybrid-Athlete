/**
 * Bidirektionaler Sync-Adapter: Strava-Aktivitäten → Trainingslog.
 *
 * Pipeline (Pull-Sync und Webhook teilen sich denselben Weg):
 *   1. Sport-Filter (nur Run/Ride)
 *   2. Dedup gegen bestehende Sessions UND Garmin-Activities
 *      (Startzeit ±2 min UND Dauer ±30 s)
 *   3. Konvertierung zu EnduranceSession (strava-{id} als stabile ID)
 *   4. Serverseitige Persistenz in app_state `hybrid_athlete_sessions`
 *      (Client hydratisiert daraus beim nächsten Start)
 *   5. Strukturierte Beschreibung mit KI-Coaching-Metriken zurück nach Strava
 */

import type {
  EnduranceSession,
  GarminActivity,
  LoggedSession,
  StravaActivity,
} from "@/types";
import { stravaToEnduranceSession } from "@/lib/stravaUtils";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { Mutex } from "@/lib/server/mutex";

import {
  garminToCandidate,
  sessionToCandidate,
  findDuplicate,
  type DedupCandidate,
} from "./dedup";
import {
  getStravaActivity,
  getStravaActivityZones,
  listAthleteActivities,
  updateStravaActivityDescription,
} from "./client";
import { computeCoachingMetrics } from "./metrics";
import { buildCoachingDescription } from "./description";
import type {
  IngestResult,
  StravaDetailedActivity,
  SyncResult,
} from "./types";

const SESSIONS_KEY = "hybrid_athlete_sessions";
const GARMIN_ACTIVITIES_KEY = "hybrid_athlete_garmin_activities";

/** Serialisiert Read-Modify-Write auf den Sessions-Key. */
const sessionsMutex = new Mutex();

// ─── app_state-Helfer ─────────────────────────────────────────────────────────

async function readAppStateArray<T>(key: string): Promise<T[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data } = await getSupabaseAdmin()
      .from("app_state")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const value = data?.value;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch (err) {
    console.error(`[strava/sync] readAppStateArray(${key}) failed:`, err);
    return [];
  }
}

async function writeAppState(key: string, value: unknown): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`[strava/sync] writeAppState(${key}) failed:`, err);
    return false;
  }
}

// ─── Dedup-Kontext ────────────────────────────────────────────────────────────

export interface DedupContext {
  sessions: EnduranceSession[];
  candidates: DedupCandidate[];
}

export async function loadDedupContext(): Promise<DedupContext> {
  const [sessionsRaw, garminRaw] = await Promise.all([
    readAppStateArray<LoggedSession>(SESSIONS_KEY),
    readAppStateArray<GarminActivity>(GARMIN_ACTIVITIES_KEY),
  ]);

  const sessions = sessionsRaw.filter(
    (s): s is EnduranceSession => !!s && s.kind === "endurance"
  );

  const candidates: DedupCandidate[] = [];
  for (const s of sessions) {
    const c = sessionToCandidate(s);
    if (c) candidates.push(c);
  }
  for (const g of garminRaw) {
    if (!g) continue;
    // Gym-Einheiten sind kein Sync-Ziel des Adapters
    if (g.type === "gym") continue;
    const c = garminToCandidate(g);
    if (c) candidates.push(c);
  }

  return { sessions, candidates };
}

// ─── Ingest ───────────────────────────────────────────────────────────────────

export function isEnduranceSport(activity: {
  sport_type?: string;
  type?: string;
}): boolean {
  return (
    activity.sport_type === "Run" ||
    activity.sport_type === "Ride" ||
    activity.type === "Run" ||
    activity.type === "Ride"
  );
}

/**
 * Ingest einer einzelnen Strava-Aktivität in das Trainingslog.
 * `summary` genügt; `detailed` beschleunigt die Beschreibungs-Uploads
 * (kein zweiter Fetch).
 */
export async function ingestStravaActivity(
  summary: StravaActivity,
  options?: {
    detailed?: StravaDetailedActivity | null;
    updateDescription?: boolean;
  }
): Promise<IngestResult> {
  const stravaId = Number(summary?.id);
  if (!Number.isFinite(stravaId)) {
    return { status: "error", stravaId: 0, detail: "invalid activity id" };
  }

  if (!isEnduranceSport(summary)) {
    return { status: "unsupported_sport", stravaId };
  }

  const ctx = await loadDedupContext();

  // Bereits als strava-{id} importiert?
  if (ctx.sessions.some((s) => s.stravaId === stravaId)) {
    return { status: "duplicate", stravaId, detail: "already imported" };
  }

  const candidate: DedupCandidate | null = (() => {
    const startTimeMs = Date.parse(summary.start_date ?? "");
    if (!Number.isFinite(startTimeMs)) return null;
    const durationSeconds = Number(summary.moving_time);
    if (!Number.isFinite(durationSeconds)) return null;
    return { startTimeMs, durationSeconds };
  })();

  if (candidate && findDuplicate(candidate, ctx.candidates)) {
    return {
      status: "duplicate",
      stravaId,
      detail: "matches existing session/garmin activity (±2 min start, ±30 s duration)",
    };
  }

  // DetailedActivity ist ein Superset des Summary-Shapes
  const session = stravaToEnduranceSession(options?.detailed ?? summary);

  const persisted = await sessionsMutex.run(async () => {
    const current = await readAppStateArray<LoggedSession>(SESSIONS_KEY);
    if (current.some((s) => s.kind === "endurance" && s.id === session.id)) {
      return true; // Rennkondition zwischen Read und Write – bereits vorhanden
    }
    const updated: LoggedSession[] = [session as LoggedSession, ...current];
    return writeAppState(SESSIONS_KEY, updated);
  });

  if (!persisted) {
    return {
      status: "not_persisted",
      stravaId,
      detail: "Supabase nicht konfiguriert oder Schreiben fehlgeschlagen",
    };
  }

  // Beschreibungs-Upload (Fehler blockieren den Import nicht)
  if (options?.updateDescription !== false) {
    await pushAiCoachingDescription(stravaId, options?.detailed).catch((err) =>
      console.error(`[strava/sync] description upload ${stravaId}:`, err)
    );
  }

  return { status: "imported", stravaId, sessionId: session.id };
}

/** Entfernt eine automatisch importierte Session (Webhook delete). */
export async function removeStravaImport(stravaId: number): Promise<boolean> {
  return sessionsMutex.run(async () => {
    const current = await readAppStateArray<LoggedSession>(SESSIONS_KEY);
    const filtered = current.filter(
      (s) => !(s.kind === "endurance" && s.stravaId === stravaId)
    );
    if (filtered.length === current.length) return false;
    return writeAppState(SESSIONS_KEY, filtered);
  });
}

// ─── Beschreibungs-Upload ─────────────────────────────────────────────────────

/**
 * Berechnet die KI-Coaching-Metriken für eine Aktivität und schreibt die
 * strukturierte Beschreibung nach Strava.
 */
export async function pushAiCoachingDescription(
  activityId: number,
  preloaded?: StravaDetailedActivity | null
): Promise<string> {
  const [detailed, zones] = await Promise.all([
    preloaded ? Promise.resolve(preloaded) : getStravaActivity(activityId),
    getStravaActivityZones(activityId).catch((err) => {
      console.error(`[strava/sync] zones fetch ${activityId}:`, err);
      return null;
    }),
  ]);

  if (!detailed) throw new Error("Aktivität nicht abrufbar");

  // Lokale hrZones der zugehörigen Session als Fallback-Quelle
  const localZones = await findLocalHrZones(activityId);

  const metrics = computeCoachingMetrics(detailed, zones, localZones);
  const description = buildCoachingDescription(metrics);

  const ok = await updateStravaActivityDescription(activityId, description);
  if (!ok) throw new Error("Beschreibungs-Update fehlgeschlagen");

  return description;
}

async function findLocalHrZones(activityId: number): Promise<number[] | null> {
  const sessions = await readAppStateArray<EnduranceSession>(SESSIONS_KEY);
  const match = sessions.find((s) => s.stravaId === activityId && s.hrZones);
  return match?.hrZones ?? null;
}

// ─── Pull-Sync ────────────────────────────────────────────────────────────────

/**
 * Pull-basierter Vollsync: listet letzte Aktivitäten und ingestiert sie
 * über dieselbe Pipeline wie Webhook-Events.
 */
export async function syncRecentActivities(options?: {
  /** UNIX-Sekunden – nur Aktivitäten danach */
  after?: number;
  perPage?: number;
  maxPages?: number;
  updateDescriptions?: boolean;
}): Promise<SyncResult> {
  const result: SyncResult = {
    fetched: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
    errors: [],
  };

  const perPage = Math.min(options?.perPage ?? 30, 100);
  const maxPages = Math.min(options?.maxPages ?? 3, 10);

  let page = 1;
  while (page <= maxPages) {
    let batch: StravaActivity[];
    try {
      batch = (await listAthleteActivities({ perPage, page, after: options?.after })) as StravaActivity[];
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      break;
    }

    result.fetched += batch.length;

    for (const activity of batch) {
      try {
        const ingest = await ingestStravaActivity(activity, {
          updateDescription: options?.updateDescriptions !== false,
        });
        switch (ingest.status) {
          case "imported":
            result.imported++;
            break;
          case "duplicate":
            result.duplicates++;
            break;
          default:
            result.skipped++;
            break;
        }
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    if (batch.length < perPage) break;
    page++;
  }

  return result;
}
