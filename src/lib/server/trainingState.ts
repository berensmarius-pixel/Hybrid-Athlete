// ─── Server-Persistenz für Trainings-Engine (app_state KV) ───────────────────

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { Mutex } from "@/lib/server/mutex";
import type { DailyTssMap, FatigueSnapshot } from "@/lib/training/banisterModel";
import type { PeakPowerResult } from "@/lib/training/powerMetrics";

export const KEY_DAILY_TSS = "hybrid_athlete_daily_tss";
export const KEY_PDC = "hybrid_athlete_power_duration_curve";
export const KEY_FITNESS = "hybrid_athlete_fitness_fatigue";
export const KEY_DEBRIEFS = "hybrid_athlete_activity_debriefs";

const PDC_WINDOW_DAYS = 90;
const TSS_RETENTION_DAYS = 400;

export interface PdcEntry {
  watts: number;
  date: string;
  activityId: string;
}

export interface PowerDurationCurve {
  updatedAt: string;
  windowDays: number;
  entries: Record<string, PdcEntry[]>;
}

export interface ActivityDebrief {
  garminId: string;
  activityName: string;
  date: string;
  generatedAt: string;
  source: "gemini" | "fallback";
  markdown: string;
}

function assertConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Server-Persistenz nicht konfiguriert: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen."
    );
  }
}

async function readKey<T>(key: string): Promise<T | null> {
  assertConfigured();
  const { data, error } = await getSupabaseAdmin()
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`app_state read fehlgeschlagen (${key}): ${error.message}`);
  return (data?.value ?? null) as T | null;
}

async function writeKey(key: string, value: unknown): Promise<void> {
  assertConfigured();
  const { error } = await getSupabaseAdmin()
    .from("app_state")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`app_state write fehlgeschlagen (${key}): ${error.message}`);
}

function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─── Daily TSS ────────────────────────────────────────────────────────────────

const tssMutex = new Mutex();

export async function loadDailyTss(): Promise<DailyTssMap> {
  const stored = await readKey<DailyTssMap>(KEY_DAILY_TSS);
  if (!stored || typeof stored !== "object") return {};
  const result: DailyTssMap = {};
  for (const [date, entry] of Object.entries(stored)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      result[date] =
        typeof entry === "number" ? { tss: entry } : (entry as DailyTssMap[string]);
    }
  }
  return result;
}

export async function recordActivityTss(
  dateISO: string,
  tss: number,
  garminId: string
): Promise<DailyTssMap> {
  return tssMutex.run(async () => {
    const map = await loadDailyTss();
    const existing = map[dateISO] ?? { tss: 0, activities: [] };
    const activities = existing.activities ?? [];
    if (!activities.includes(garminId)) activities.push(garminId);

    map[dateISO] = { ...existing, tss: Math.round(tss * 10) / 10, activities };

    const cutoff = isoDaysAgo(TSS_RETENTION_DAYS);
    for (const date of Object.keys(map)) {
      if (date < cutoff) delete map[date];
    }

    await writeKey(KEY_DAILY_TSS, map);
    return map;
  });
}

// ─── Power Duration Curve (rolling 90 days) ──────────────────────────────────

const pdcMutex = new Mutex();

export async function mergePeaksIntoPdc(
  activityId: string,
  dateISO: string,
  peaks: PeakPowerResult[]
): Promise<PowerDurationCurve> {
  return pdcMutex.run(async () => {
    const stored =
      (await readKey<PowerDurationCurve>(KEY_PDC)) ??
      ({ updatedAt: new Date().toISOString(), windowDays: PDC_WINDOW_DAYS, entries: {} } as PowerDurationCurve);

    const entries: Record<string, PdcEntry[]> = stored.entries ?? {};
    for (const peak of peaks) {
      if (!peak.watts || peak.watts <= 0) continue;
      const durationKey = String(peak.durationSeconds);
      const list = (entries[durationKey] ?? []).filter(
        (e) => e.activityId !== activityId
      );
      list.push({ watts: peak.watts, date: dateISO, activityId });
      list.sort((a, b) => b.watts - a.watts);
      entries[durationKey] = list;
    }

    const cutoff = isoDaysAgo(PDC_WINDOW_DAYS);
    for (const [durationKey, list] of Object.entries(entries)) {
      entries[durationKey] = list.filter((e) => e.date >= cutoff);
      if (entries[durationKey].length === 0) delete entries[durationKey];
    }

    const updated: PowerDurationCurve = {
      updatedAt: new Date().toISOString(),
      windowDays: PDC_WINDOW_DAYS,
      entries,
    };
    await writeKey(KEY_PDC, updated);
    return updated;
  });
}

// ─── Fitness / Fatigue Snapshot ───────────────────────────────────────────────

export async function saveFitnessSnapshot(snapshot: FatigueSnapshot): Promise<void> {
  await writeKey(KEY_FITNESS, snapshot);
}

// ─── Debriefs ─────────────────────────────────────────────────────────────────

const debriefMutex = new Mutex();

export async function saveActivityDebrief(debrief: ActivityDebrief): Promise<void> {
  return debriefMutex.run(async () => {
    const stored = await readKey<Record<string, ActivityDebrief>>(KEY_DEBRIEFS);
    const map = stored && typeof stored === "object" ? stored : {};
    map[debrief.garminId] = debrief;

    // Nur die 200 jüngsten Einträge behalten (sortiert nach generatedAt,
    // da numerische Objekt-Keys ohnehin nicht insertion-ordered sind)
    const youngest = Object.values(map)
      .filter((d): d is ActivityDebrief =>
        Boolean(d && typeof d === "object" && typeof d.garminId === "string")
      )
      .sort((a, b) => (b.generatedAt > a.generatedAt ? 1 : -1))
      .slice(0, 200);

    const next: Record<string, ActivityDebrief> = {};
    for (const entry of youngest) next[entry.garminId] = entry;

    await writeKey(KEY_DEBRIEFS, next);
  });
}
