import { spawn } from "child_process";
import path from "path";

// Python-Interpreter konfigurierbar (z.B. venv per PYTHON_BIN=C:\venv\Scripts\python.exe)
const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "garmin_sync.py");

export class GarminCliError extends Error {
  /** Letzte Zeilen von stderr/stdout – für Debugging in der Fehlermeldung. */
  detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "GarminCliError";
    this.detail = detail;
  }
}

interface RunOptions {
  timeoutMs?: number;
  maxStdoutChars?: number;
  stdin?: string;
  /** Zusätzliche Env-Vars für den Kindprozess (z.B. GARMIN_EMAIL). */
  env?: Record<string, string>;
}

/**
 * Führt garmin_sync.py aus und parst die JSON-Ausgabe.
 * Schlägt das Parsen fehl (z.B. weil eine Library Warnungen auf stdout
 * schreibt), wird ein GarminCliError mit stderr-Ausschnitt geworfen,
 * statt eines kryptischen SyntaxError.
 */
export function runGarminJson(
  args: string[],
  opts: RunOptions = {}
): Promise<Record<string, unknown>> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxChars = opts.maxStdoutChars ?? 10_000_000;

  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SCRIPT_PATH, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;

    const timer = setTimeout(() => {
      child.kill();
      reject(new GarminCliError(`Timeout nach ${(timeoutMs / 1000).toFixed(0)}s`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (stdout.length < maxChars) stdout += chunk;
      else truncated = true;
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", () => {
      clearTimeout(timer);
      const detail =
        stderr.trim().slice(-400) || stdout.trim().slice(-200) || undefined;
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(
          new GarminCliError(
            truncated
              ? "Ausgabe des Garmin-Skripts zu groß"
              : "Unerwartete Ausgabe des Garmin-Skripts",
            detail
          )
        );
      }
    });

    if (opts.stdin !== undefined) child.stdin.end(opts.stdin, "utf8");
    else child.stdin.end();
  });
}

/** Einheitliche 500-Antwort mit Debug-Detail für alle Garmin-Routes. */
export function garminErrorResponse(route: string, err: unknown, fallback: string) {
  console.error(`[api/garmin/${route}] failed:`, err);
  const detail =
    err instanceof GarminCliError && err.detail ? ` (Detail: ${err.detail})` : "";
  return Response.json(
    { success: false, error: `${fallback}${detail}` },
    { status: 500 }
  );
}

// ─── list_workouts Cache (~60s) ─────────────────────────────────────────────
// Jeder Aufruf spawnt einen frischen Python-Prozess inkl. Login-Prüfung
// (mehrere Sekunden). Der Cache verhindert das bei schnellen Tab-Wechseln.

const LIST_CACHE_TTL_MS = 60_000;
let listCache: { at: number; data: Record<string, unknown> } | null = null;

export function invalidateListWorkoutsCache(): void {
  listCache = null;
}

export async function listWorkoutsCached(): Promise<Record<string, unknown>> {
  if (listCache && Date.now() - listCache.at < LIST_CACHE_TTL_MS) {
    return { ...listCache.data, cached: true };
  }
  const data = await runGarminJson(["list_workouts"], { timeoutMs: 30_000 });
  if (data.success) listCache = { at: Date.now(), data };
  return data;
}

// ─── Duplikat-Schutz beim Scheduling ────────────────────────────────────────
// In-Memory pro Server-Prozess: verhindert Doppelklicks und doppelte
// Wochen-Syncs kurz hintereinander. Garmin-seitig existiert kein Idempotency-Key.

const SCHEDULE_DEDUPE_TTL_MS = 5 * 60_000;
const recentSchedules = new Map<string, number>();

function scheduleKey(date: string, name: string): string {
  return `${date}::${name.trim().toLowerCase()}`;
}

export function wasRecentlyScheduled(date: string, name: string): boolean {
  const key = scheduleKey(date, name);
  const at = recentSchedules.get(key);
  if (!at) return false;
  if (Date.now() - at > SCHEDULE_DEDUPE_TTL_MS) {
    recentSchedules.delete(key);
    return false;
  }
  return true;
}

export function markScheduled(date: string, name: string): void {
  const key = scheduleKey(date, name);
  // Aufräumen alter Einträge, damit die Map nicht wächst
  const now = Date.now();
  for (const [k, at] of recentSchedules) {
    if (now - at > SCHEDULE_DEDUPE_TTL_MS) recentSchedules.delete(k);
  }
  recentSchedules.set(key, now);
}

// ─── Geplante Kalender-Termine ──────────────────────────────────────────────
// Die App muss wissen, welche Workouts im Garmin-Kalender stehen, um
// Duplikate/Überschneidungen beim Planen zu erkennen (Duplikat-Guard im
// schedule-Route) und falsche Einträge über unschedule entfernen zu können.

export interface ScheduledGarminWorkout {
  scheduledWorkoutId: number | string;
  workoutId?: number | string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  sportType?: string | null;
}

const SCHEDULED_CACHE_TTL_MS = 5 * 60_000;
let scheduledCache: { at: number; data: Record<string, unknown> } | null = null;

export function invalidateScheduledWorkoutsCache(): void {
  scheduledCache = null;
}

/** Lädt die geplanten Workouts der nächsten Monate (aktuell + Folgemonat). */
export async function listScheduledWorkouts(): Promise<{
  success: boolean;
  workouts?: ScheduledGarminWorkout[];
  error?: string;
  cached?: boolean;
}> {
  if (scheduledCache && Date.now() - scheduledCache.at < SCHEDULED_CACHE_TTL_MS) {
    return { ...(scheduledCache.data as { success: boolean; workouts?: ScheduledGarminWorkout[] }), cached: true };
  }
  const now = new Date();
  const data = await runGarminJson(
    [
      "list_scheduled_workouts",
      "--year",
      String(now.getFullYear()),
      "--month",
      String(now.getMonth() + 1),
      "--months",
      "2",
    ],
    { timeoutMs: 45_000 }
  );
  const result = {
    success: Boolean(data.success),
    workouts: Array.isArray(data.workouts)
      ? (data.workouts as ScheduledGarminWorkout[])
      : [],
    error: typeof data.error === "string" ? data.error : undefined,
  };
  if (result.success) {
    scheduledCache = { at: Date.now(), data: { success: true, workouts: result.workouts } };
  }
  return result;
}

// ─── Workout-Payload-Validierung ────────────────────────────────────────────

const WORKOUT_TYPES = ["gym", "strength", "running", "cycling"] as const;
const TARGET_KINDS = [
  "customPowerRange",
  "powerZone",
  "heartRateZone",
  "heartRateRange",
  "cadenceRange",
  "noTarget",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isValidStepTarget(t: unknown): boolean {
  if (t === null || t === undefined) return true;
  if (!isPlainObject(t)) return false;
  return (
    typeof t.kind === "string" &&
    (TARGET_KINDS as readonly string[]).includes(t.kind)
  );
}

/**
 * Struktur-Check des Workout-Payloads bevor er an das Python-Skript geht.
 * So werden Fehler im Client-Payload erkannt, statt kryptisch im
 * NLP-Parser zu scheitern.
 */
export function isValidWorkoutPayload(w: unknown): boolean {
  if (!isPlainObject(w)) return false;
  const o = w as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > 200) return false;
  if (
    typeof o.type !== "string" ||
    !(WORKOUT_TYPES as readonly string[]).includes(o.type)
  ) {
    return false;
  }
  if (o.description !== undefined && typeof o.description !== "string") return false;

  for (const key of ["ftp", "restingHr", "maxHr", "durationMinutes"] as const) {
    if (o[key] !== undefined && (typeof o[key] !== "number" || !Number.isFinite(o[key] as number))) {
      return false;
    }
  }

  if (o.steps !== undefined) {
    if (!Array.isArray(o.steps)) return false;
    if (o.steps.some((s) => !isPlainObject(s))) return false;
    for (const s of o.steps as Array<Record<string, unknown>>) {
      if (
        s.phase !== undefined &&
        !(["warmup", "interval", "recovery", "cooldown"] as readonly string[]).includes(String(s.phase))
      ) {
        return false;
      }
      if (!isValidStepTarget(s.primaryTarget)) return false;
      if (!isValidStepTarget(s.secondaryTarget)) return false;
    }
  }

  if (o.exercises === undefined) return true;
  if (!Array.isArray(o.exercises)) return false;
  return o.exercises.every((ex) => {
    if (!ex || typeof ex !== "object" || Array.isArray(ex)) return false;
    const e = ex as Record<string, unknown>;
    if (typeof e.name !== "string" || !e.name.trim()) return false;
    return e.sets === undefined || Array.isArray(e.sets);
  });
}
