// ─── Garmin Webhook Worker (Background-Pipeline) ─────────────────────────────
//
// Wird nach der sofortigen 200-OK-Acknowledgment des Webhook-Routen-Handlers
// via next/server `after()` ausgeführt:
//
//   1. Idempotenz-Check (garmin_sync_events.event_key)
//   2. Rohdaten laden (activity_details JSON via garmin_sync.py, optional .fit-Archiv)
//   3. Metriken parsen (NP/TSS/IF/kJ/Zonen/TE) + geplantes Workout verknüpfen
//   4. Upsert in DB (garmin_activities) + App-State-Mirror (Client-Feed)
//   5. ATL/CTL/TSB neu berechnen (Banister) + Snapshots persistieren
//   6. Auffüll-Ziele (CHO/kcal/Flüssigkeit) aus gemessener Arbeit ableiten
//   7. AI-Kurzdebrief (Planned vs. Actual) generieren
//   8. Push-Versand (Telegram/Pushover) + Debrief in den Dashboard-Feed
//

import { runGarminJson } from "@/lib/garmin/garminCli";
import {
  parseActivityDetails,
  toGarminActivity,
  type GarminDetailPayload,
} from "@/lib/server/garminActivityMapper";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { Mutex } from "@/lib/server/mutex";
import {
  loadDailyTss,
  recordActivityTss,
  saveActivityDebrief,
  saveFitnessSnapshot,
} from "@/lib/server/trainingState";
import { computeBanisterSeries } from "@/lib/training/banisterModel";
import { computeReplenishmentTarget } from "@/lib/nutrition/replenishment";
import { generatePostWorkoutDebrief, toFeedEntry } from "@/lib/server/debrief";
import { dispatchPushNotification } from "@/lib/server/pushDispatch";
import {
  DEBRIEFS_STATE_KEY,
  GARMIN_ACTIVITIES_STATE_KEY,
  REPLENISHMENT_STATE_KEY,
  TRAINING_LOAD_STATE_KEY,
} from "@/lib/persistence/keys";
import type {
  DayPlan,
  GarminActivity,
  PlannedWorkoutLink,
  PostWorkoutDebrief,
  ReplenishmentTarget,
  TrainingLoadSnapshot,
} from "@/types";

const WEEKLY_PLAN_STATE_KEY = "hybrid-athlete-weekly-plan";

const MAX_MIRROR_ACTIVITIES = 200;
const MAX_DEBRIEFS = 50;
const ACTIVITY_TIMEOUT_MS = 120_000;

// ─── Ereignis-Persistenz (Idempotenz + Audit) ────────────────────────────────

export interface WebhookEventMeta {
  source?: string;
  dataType: string;
  eventKey: string;
  userId?: string;
}

type EventStatus = "received" | "processing" | "processed" | "failed" | "skipped";

interface SyncEventRow {
  event_key: string;
  status: EventStatus;
}

async function claimEvent(
  meta: WebhookEventMeta,
  payload: unknown
): Promise<"claimed" | "duplicate"> {
  if (!isSupabaseConfigured()) return "claimed";
  try {
    const db = getSupabaseAdmin();
    const insert = await db
      .from("garmin_sync_events")
      .insert({
        source: meta.source ?? "garmin-push",
        data_type: meta.dataType,
        event_key: meta.eventKey,
        status: "processing",
        payload: payload ?? null,
      })
      .select("event_key,status")
      .single();

    if (!insert.error) return "claimed";

    // Unique-Verstoß ⇒ bereits bekannt: nur bei Nicht-'processed' erneut laufen lassen
    const existing = await db
      .from("garmin_sync_events")
      .select("event_key,status")
      .eq("event_key", meta.eventKey)
      .maybeSingle();
    const row = existing.data as SyncEventRow | null;
    if (row?.status === "processed") return "duplicate";

    await db
      .from("garmin_sync_events")
      .update({ status: "processing" })
      .eq("event_key", meta.eventKey);
    return "claimed";
  } catch (err) {
    console.error("[garminWorker] claimEvent fehlgeschlagen:", err);
    return "claimed"; // Verfügbarkeitsproblem darf Pipeline nicht blockieren
  }
}

async function finishEvent(
  eventKey: string,
  status: Extract<EventStatus, "processed" | "failed" | "skipped">,
  error?: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabaseAdmin()
      .from("garmin_sync_events")
      .update({
        status,
        error: error?.slice(0, 500) ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("event_key", eventKey);
  } catch (err) {
    console.error("[garminWorker] finishEvent fehlgeschlagen:", err);
  }
}

// ─── Geplantes Workout verknüpfen ────────────────────────────────────────────

function weekdayIndex(dateStr: string): number {
  // Monday = 0 … Sunday = 6
  const d = new Date(`${dateStr}T12:00:00`);
  return (d.getDay() + 6) % 7;
}

async function findPlannedWorkout(dateStr: string): Promise<PlannedWorkoutLink | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getSupabaseAdmin()
      .from("app_state")
      .select("value")
      .eq("key", WEEKLY_PLAN_STATE_KEY)
      .maybeSingle();
    const plan = data?.value as DayPlan[] | null;
    if (!Array.isArray(plan)) return null;

    const idx = weekdayIndex(dateStr);
    const day = plan.find((d) => d && d.dayIndex === idx && d.workoutType !== "rest");
    if (!day) return null;

    return {
      title: day.title,
      description: day.description || undefined,
      workoutType: day.workoutType,
      templateId: day.templateId,
      date: dateStr,
    };
  } catch (err) {
    console.error("[garminWorker] Wochenplan-Lookup fehlgeschlagen:", err);
    return null;
  }
}

// ─── Persistenz-Helfer (app_state KV mit Mutex) ──────────────────────────────

const stateMutex = new Mutex();

async function readAppState<T>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("app_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`app_state read ${key}: ${error.message}`);
  return (data?.value ?? null) as T | null;
}

async function writeAppState(key: string, value: unknown): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabaseAdmin()
    .from("app_state")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw new Error(`app_state write ${key}: ${error.message}`);
}

/** Aktivität in den Client-Mirror mergen (neueste zuerst, hartes Limit). */
async function mirrorActivityToAppState(activity: GarminActivity): Promise<void> {
  await stateMutex.run(async () => {
    const existing = (await readAppState<GarminActivity[]>(GARMIN_ACTIVITIES_STATE_KEY)) ?? [];
    const filtered = existing.filter(
      (a) =>
        a.id !== activity.id &&
        !(activity.garminId && a.garminId === activity.garminId)
    );
    filtered.unshift(activity);
    await writeAppState(GARMIN_ACTIVITIES_STATE_KEY, filtered.slice(0, MAX_MIRROR_ACTIVITIES));
  });
}

// ─── DB-Upsert der geparsten Aktivität ───────────────────────────────────────

async function upsertActivityRow(
  metrics: ReturnType<typeof parseActivityDetails>,
  activity: GarminActivity,
  planned: PlannedWorkoutLink | null
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabaseAdmin()
      .from("garmin_activities")
      .upsert(
        {
          id: Number(metrics.garminId) || 0,
          user_id: null,
          name: metrics.name,
          sport: metrics.sport,
          start_time: metrics.startTimeIso,
          local_date: metrics.localDate,
          duration_seconds: metrics.durationSeconds,
          moving_duration_s: metrics.movingDurationSeconds,
          distance_meters: metrics.distanceMeters,
          calories: metrics.calories,
          avg_hr: metrics.avgHeartRate,
          max_hr: metrics.maxHeartRate,
          avg_power_watts: metrics.avgPowerWatts,
          max_power_watts: metrics.maxPowerWatts,
          normalized_power: metrics.normalizedPowerWatts,
          work_kj: metrics.workKJ,
          tss: metrics.tss,
          intensity_factor: metrics.intensityFactor,
          avg_cadence: metrics.avgCadenceRpm,
          aerobic_te: metrics.aerobicTrainingEffect,
          anaerobic_te: metrics.anaerobicTrainingEffect,
          time_in_zones: {
            hr: metrics.hrTimeInZonesMin,
            power: metrics.powerTimeInZonesMin,
          },
          planned_workout: planned,
          metrics: activity,
        },
        { onConflict: "id" }
      );
  } catch (err) {
    console.error("[garminWorker] garmin_activities upsert fehlgeschlagen:", err);
  }
}

// ─── Load-Snapshots ──────────────────────────────────────────────────────────

async function recalculateTrainingLoad(): Promise<{
  snapshot: TrainingLoadSnapshot | null;
}> {
  const dailyTss = await loadDailyTss(); // wirft ohne Supabase → Caller fängt
  const banister = computeBanisterSeries(dailyTss, todayIso(), 180);

  const uiSnapshot: TrainingLoadSnapshot = {
    date: banister.date,
    atl: banister.atl,
    ctl: banister.ctl,
    tsb: banister.tsb,
    dailyTss: 0,
    status: classifyForm(banister.tsb),
    updatedAt: new Date().toISOString(),
  };

  // Daily-TSS des letzten Tages ergänzen (für UI-Chips)
  const lastEntry = dailyTss[banister.date];
  uiSnapshot.dailyTss =
    typeof lastEntry === "number" ? lastEntry : lastEntry?.tss ?? 0;

  await saveFitnessSnapshot(banister); // Bestands-Engine (FatigueSnapshot + Trend)
  await writeAppState(TRAINING_LOAD_STATE_KEY, uiSnapshot);

  return { snapshot: uiSnapshot };
}

function classifyForm(tsb: number): TrainingLoadSnapshot["status"] {
  if (tsb >= 5) return "fresh";
  if (tsb <= -30) return "overreaching";
  if (tsb <= -10) return "fatigued";
  return "neutral";
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Replenishment & Debrief-Persistenz ──────────────────────────────────────

async function persistReplenishment(target: ReplenishmentTarget): Promise<void> {
  await stateMutex.run(async () => {
    const map =
      (await readAppState<Record<string, ReplenishmentTarget>>(REPLENISHMENT_STATE_KEY)) ?? {};
    map[target.date] = target;
    // 60 Tage Historie behalten
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    for (const date of Object.keys(map)) {
      if (date < cutoffIso) delete map[date];
    }
    await writeAppState(REPLENISHMENT_STATE_KEY, map);
  });
}

async function appendDebriefToFeed(entry: PostWorkoutDebrief): Promise<void> {
  await stateMutex.run(async () => {
    const feed = (await readAppState<PostWorkoutDebrief[]>(DEBRIEFS_STATE_KEY)) ?? [];
    const next = [entry, ...feed.filter((e) => e.activityId !== entry.activityId)].slice(
      0,
      MAX_DEBRIEFS
    );
    await writeAppState(DEBRIEFS_STATE_KEY, next);
  });
}

async function updateActivityDebriefColumn(garminId: string, debriefText: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabaseAdmin()
      .from("garmin_activities")
      .update({ debrief: debriefText })
      .eq("id", Number(garminId) || -1);
  } catch (err) {
    console.error("[garminWorker] debrief column update fehlgeschlagen:", err);
  }
}

// ─── In-Prozess-Dedupe ───────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<void>>();

/**
 * Zentrale Pipeline für einen ACTIVITY_DETAILS-Webhook.
 * Mehrfach-Auslösungen (Retries, parallele Pushes) für dieselbe Aktivität
 * werden pro Server-Prozess zusammengeführt.
 */
export function processActivityWebhook(
  activityId: string,
  meta: WebhookEventMeta,
  rawPayload?: unknown
): Promise<void> {
  const existing = inFlight.get(activityId);
  if (existing) return existing;

  const job = runPipeline(activityId, meta, rawPayload).finally(() => {
    inFlight.delete(activityId);
  });
  inFlight.set(activityId, job);
  return job;
}

async function runPipeline(
  activityId: string,
  meta: WebhookEventMeta,
  rawPayload?: unknown
): Promise<void> {
  console.log(`[garminWorker] Starte Verarbeitung ${meta.dataType}:${activityId}`);

  const claimed = await claimEvent(meta, rawPayload);
  if (claimed === "duplicate") {
    console.log(`[garminWorker] Duplicate Event übersprungen (${meta.eventKey})`);
    return;
  }

  try {
    // 1. Rohdaten von Garmin Connect laden
    const payload = (await runGarminJson(
      ["activity_details", "--activity-id", activityId],
      { timeoutMs: ACTIVITY_TIMEOUT_MS }
    )) as GarminDetailPayload;

    if (!payload || payload.success === false || !payload.summary) {
      throw new Error(payload?.error || "activity_details lieferte keine Summary");
    }

    // 2. Metriken parsen
    const metrics = parseActivityDetails(payload);
    const activity = toGarminActivity(metrics);
    activity.source = "webhook";

    // Optional: tiefe FIT-Analyse (Peak-Powers, PDC, Kalender-Reconciliation)
    // an die Inngest-Pipeline übergeben – Fire-and-forget, blockiert nie.
    void sendDeepAnalysisEvent(activity).catch((err) => {
      console.warn("[garminWorker] Inngest-Event fehlgeschlagen:", err instanceof Error ? err.message : err);
    });

    // 3. Geplantes Workout verknüpfen
    const planned = await findPlannedWorkout(metrics.localDate);
    if (planned) activity.plannedWorkout = planned;

    // 4. Persistieren: DB-Zeile + Client-Mirror
    await upsertActivityRow(metrics, activity, planned);
    await mirrorActivityToAppState(activity);

    // 5. TSS registrieren + ATL/CTL/TSB neu berechnen (nur mit Supabase möglich)
    let loadSnapshot: TrainingLoadSnapshot | null = null;
    if (isSupabaseConfigured() && metrics.tss) {
      await recordActivityTss(metrics.localDate, metrics.tss, metrics.garminId);
      ({ snapshot: loadSnapshot } = await recalculateTrainingLoad());
    }

    // 6. Auffüll-Ziele aus gemessener Arbeit
    const replenishment = computeReplenishmentTarget({
      date: metrics.localDate,
      activityId: metrics.garminId,
      activityName: metrics.name,
      workKJ: metrics.workKJ,
      calories: metrics.calories,
    });
    await persistReplenishment(replenishment);

    // 7. AI-Debrief (Gemini mit Template-Fallback – wirft nicht)
    const result = await generatePostWorkoutDebrief({
      activity,
      planned,
      loadSnapshot,
      replenishment,
    });

    // 8a. Debrief im Feed speichern (Dashboard)
    const feedEntry = toFeedEntry(result, inputFrom(activity, planned));
    await appendDebriefToFeed(feedEntry);
    await updateActivityDebriefColumn(metrics.garminId, result.text);
    await saveActivityDebriefSafe(metrics, result.text, result.generator);

    // 8b. Push-Versand
    const dispatch = await dispatchPushNotification(
      feedEntry.headline ?? feedEntry.activityName,
      result.text
    );
    console.log(`[garminWorker] Dispatch: ${JSON.stringify(dispatch)}`);

    await finishEvent(meta.eventKey, "processed");
    console.log(`[garminWorker] Fertig ${activityId} (${result.generator}): ${result.text}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[garminWorker] Pipeline fehlgeschlagen (${activityId}):`, message);
    await finishEvent(meta.eventKey, "failed", message);
  }
}

function inputFrom(activity: GarminActivity, planned: PlannedWorkoutLink | null) {
  return { activity, planned };
}

async function saveActivityDebriefSafe(
  metrics: ReturnType<typeof parseActivityDetails>,
  text: string,
  generator: "ai" | "template"
): Promise<void> {
  try {
    await saveActivityDebrief({
      garminId: metrics.garminId,
      activityName: metrics.name,
      date: metrics.localDate,
      generatedAt: new Date().toISOString(),
      source: generator === "ai" ? "gemini" : "fallback",
      markdown: text,
    });
  } catch (err) {
    // Ohne Supabase erwartbar – Feed/Push existiert unabhängig davon
    console.warn("[garminWorker] trainingState debrief skip:", err instanceof Error ? err.message : err);
  }
}

/**
 * Tiefe FIT-Analyse (binärer FIT-Download, Peak-Powers, Power-Duration-Curve,
 * Kalender-Reconciliation) optional an die Inngest-Pipeline übergeben.
 * Nur aktiv, wenn INNGEST_EVENT_KEY konfiguriert ist – sonst läuft die
 * JSON-Summary-Pipeline dieser Datei alleinständig.
 */
async function sendDeepAnalysisEvent(activity: GarminActivity): Promise<void> {
  if (!process.env.INNGEST_EVENT_KEY?.trim()) return;
  if (!activity.garminId || !/^\d{4,}$/.test(activity.garminId)) return;

  const { inngest, GARMIN_ACTIVITY_RECEIVED } = await import("@/lib/inngest/client");
  await inngest.send({
    name: GARMIN_ACTIVITY_RECEIVED,
    data: {
      garminId: activity.garminId,
      name: activity.name,
      type: activity.type,
      startTime: activity.startTime,
      durationSeconds: activity.durationSeconds,
      distanceMeters: activity.distanceMeters,
      ftpWatts: activity.functionalThresholdPowerWatts ?? undefined,
      // Debrief inkl. Push erzeugt diese Pipeline (Planned-vs-Actual)
      skipDebrief: true,
    },
  });
}

/** Health-Events (SLEEP/PULSE_OX/…) werden protokolliert, aber nicht weiterverarbeitet. */
export async function recordSkippedEvent(meta: WebhookEventMeta, reason: string): Promise<void> {
  console.log(`[garminWorker] Überspringe ${meta.dataType}: ${reason}`);
  await finishEvent(meta.eventKey, "skipped", reason);
}
