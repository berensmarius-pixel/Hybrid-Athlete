import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SCHEDULING_SETTINGS,
  normalizeSchedulingSettings,
  type SchedulingSettings,
  type ScheduledGoogleWorkout,
} from "@/lib/calendar/gcal/types";

/**
 * Persistierung der Planungs-Settings und der Google-Event-Zuordnung
 * (google_event_id ↔ internes Workout) für die Zweiwege-Synchronisation.
 *
 * Primär: app_state (Supabase KV). Fallback: `.server_state/google_calendar_data.json`.
 */

const SETTINGS_KEY = "hybrid_athlete_google_calendar_settings";
const SCHEDULE_KEY = "hybrid_athlete_google_schedule_map";
const STATE_DIR = path.join(process.cwd(), ".server_state");
const STATE_FILE = path.join(STATE_DIR, "google_calendar_data.json");

interface GcalDataFile {
  settings?: unknown;
  schedule?: unknown;
}

async function readFileData(): Promise<GcalDataFile> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as GcalDataFile;
  } catch {
    return {};
  }
}

async function writeFileData(data: GcalDataFile): Promise<void> {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[googleCalendarData] file write failed:", err);
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function readSchedulingSettings(): Promise<SchedulingSettings> {
  let stored: unknown = null;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      stored = data?.value?.settings ?? null;
    } catch (err) {
      console.error("[googleCalendarData] settings supabase read failed:", err);
    }
  }
  if (stored === null) {
    const file = await readFileData();
    stored = file.settings ?? null;
  }
  return normalizeSchedulingSettings(stored ?? DEFAULT_SCHEDULING_SETTINGS);
}

export async function saveSchedulingSettings(settings: SchedulingSettings): Promise<boolean> {
  await writeFileData({ ...(await readFileData()), settings });
  if (!isSupabaseConfigured()) return true;
  try {
    const { error } = await getSupabaseAdmin().from("app_state").upsert(
      { key: SETTINGS_KEY, value: { settings, updatedAt: new Date().toISOString() } },
      { onConflict: "key" }
    );
    return !error;
  } catch (err) {
    console.error("[googleCalendarData] settings supabase save failed:", err);
    return true; // Datei-Fallback erfolgreich
  }
}

// ── Scheduled-Workout-Mapping ────────────────────────────────────────────────

function isScheduledWorkout(v: unknown): v is ScheduledGoogleWorkout {
  const w = v as Partial<ScheduledGoogleWorkout>;
  return (
    !!w &&
    typeof w.id === "string" &&
    typeof w.googleEventId === "string" &&
    typeof w.calendarId === "string" &&
    typeof w.date === "string" &&
    typeof w.startTime === "string" &&
    typeof w.endTime === "string"
  );
}

export async function readScheduledWorkouts(): Promise<ScheduledGoogleWorkout[]> {
  let stored: unknown = null;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", SCHEDULE_KEY)
        .maybeSingle();
      stored = data?.value?.schedule ?? null;
    } catch (err) {
      console.error("[googleCalendarData] schedule supabase read failed:", err);
    }
  }
  if (stored === null) {
    const file = await readFileData();
    stored = file.schedule ?? null;
  }
  if (!Array.isArray(stored)) return [];
  return stored.filter(isScheduledWorkout);
}

export async function saveScheduledWorkouts(items: ScheduledGoogleWorkout[]): Promise<boolean> {
  await writeFileData({ ...(await readFileData()), schedule: items });
  if (!isSupabaseConfigured()) return true;
  try {
    const { error } = await getSupabaseAdmin().from("app_state").upsert(
      { key: SCHEDULE_KEY, value: { schedule: items, updatedAt: new Date().toISOString() } },
      { onConflict: "key" }
    );
    return !error;
  } catch (err) {
    console.error("[googleCalendarData] schedule supabase save failed:", err);
    return true;
  }
}
