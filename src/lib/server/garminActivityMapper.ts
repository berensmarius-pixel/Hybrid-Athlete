// ─── Garmin Activity-Detail-Mapper ───────────────────────────────────────────
//
// Wandelt das rohe JSON aus `garmin_sync.py activity_details` in die
// App-Domänen-Records (GarminActivity + ParsedActivityMetrics) um.
// Reine Funktion ohne I/O – deterministisch testbar.

import type { GarminActivity } from "@/types";

export interface GarminHrZone {
  zoneNumber?: number;
  secsInZone?: number;
}

export interface GarminDetailPayload {
  success?: boolean;
  activityId?: number | string;
  error?: string;
  summary?: Record<string, unknown> | null;
  hrTimeInZones?: { zones?: GarminHrZone[] } | null;
  powerTimeInZones?: { zones?: GarminHrZone[] } | null;
  splits?: unknown[];
  [key: string]: unknown;
}

export interface ParsedActivityMetrics {
  garminId: string;
  name: string;
  sport: "cycling" | "running" | "gym" | "other";
  device: GarminActivity["device"];
  startTimeIso: string;
  localDate: string; // YYYY-MM-DD
  durationSeconds: number;
  movingDurationSeconds: number | null;
  distanceMeters: number;
  calories: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPowerWatts: number | null;
  maxPowerWatts: number | null;
  normalizedPowerWatts: number | null;
  functionalThresholdPower: number | null;
  workKJ: number | null;
  tss: number | null;
  intensityFactor: number | null;
  avgCadenceRpm: number | null;
  elevationGainMeters: number | null;
  aerobicTrainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
  /** Minuten je Zone (Index 0 = Zone 1) */
  hrTimeInZonesMin: number[] | null;
  powerTimeInZonesMin: number[] | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Garmin sport typeKeys → App-Sportarten. */
export function mapSportType(typeKey: unknown): ParsedActivityMetrics["sport"] {
  const key = str(typeKey).toLowerCase();
  if (!key) return "other";
  if (key.includes("bik") || key.includes("cycl")) return "cycling";
  if (key.includes("run") || key.includes("walk") || key.includes("hik") || key.includes("trail"))
    return "running";
  if (
    key.includes("strength") ||
    key.includes("gym") ||
    key.includes("indoor_cardio") ||
    key.includes("fitness")
  )
    return "gym";
  return "other";
}

function zonesToMinutes(zones?: GarminHrZone[]): number[] | null {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const minutes = zones
    .slice(0, 5)
    .map((z) => Math.round(((num(z.secsInZone) ?? 0) / 60) * 10) / 10);
  return minutes.some((m) => m > 0) ? minutes : null;
}

/** Lokales Datum (YYYY-MM-DD) aus GMT-Startzeit + Offset in Minuten. */
export function extractLocalDate(summary: Record<string, unknown>): string {
  const gmt = str(summary.startTimeGMT);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(gmt)) {
    // Garmin liefert startTimeLocal meist als naive lokale Zeit
    const local = str(summary.startTimeLocal);
    const localMatch = /^(\d{4}-\d{2}-\d{2})/.exec(local);
    if (localMatch) return localMatch[1];
    return gmt.slice(0, 10);
  }
  // ISO-Fallback
  const iso = gmt || str(summary.startTimeLocal);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match ? match[1] : new Date().toISOString().slice(0, 10);
}

/** ISO-Zeitstempel normalisieren (Garmin: "2026-08-25 07:12:03 GMT"). */
export function normalizeStartTimeIso(summary: Record<string, unknown>): string {
  const gmt = str(summary.startTimeGMT);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(gmt)) {
    // "2026-08-25 16:12:03 GMT" → UTC-ISO (Suffix GMT entfernen)
    const isoLike = `${gmt.split(" ")[0]}T${gmt.split(" ")[1]}Z`;
    return new Date(isoLike).toISOString();
  }
  const anyTs = gmt || str(summary.startTimeLocal);
  const parsed = new Date(anyTs);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/**
 * Zentrale Mapping-Funktion. Wirft nicht – fehlende Felder bleiben null,
 * damit der Worker auch mit Teildaten weiterarbeiten kann.
 */
export function parseActivityDetails(payload: GarminDetailPayload): ParsedActivityMetrics {
  const rawId = payload.activityId ?? num((payload.summary ?? {})?.activityId) ?? 0;
  const summary = payload.summary ?? {};

  const duration = num(summary.duration) ?? num(summary.elapsedDuration) ?? 0;
  const movingDuration =
    num(summary.movingDuration) ?? (duration > 0 ? duration : null);
  const avgPower = num(summary.averagePower);
  const workJoules = num(summary.work) ?? null;

  let workKJ: number | null = null;
  if (workJoules && workJoules > 1000) workKJ = Math.round(workJoules / 1000);
  else if (avgPower !== null && movingDuration)
    workKJ = Math.round((avgPower * movingDuration) / 1000);

  const sport = mapSportType(
    (summary.activityTypeDTO as Record<string, unknown> | undefined)?.typeKey ??
      summary.activityType ??
      ""
  );

  const cadenceRaw =
    num(summary.averageBikeCadence) ?? num(summary.averageRunningCadence);

  return {
    garminId: String(rawId),
    name: str(summary.activityName) || "Garmin Activity",
    sport,
    device: sport === "cycling" ? "Edge 840" : "Forerunner 265",
    startTimeIso: normalizeStartTimeIso(summary),
    localDate: extractLocalDate(summary),
    durationSeconds: Math.round(duration),
    movingDurationSeconds: movingDuration != null ? Math.round(movingDuration) : null,
    distanceMeters: Math.round(num(summary.distance) ?? 0),
    calories: Math.round(num(summary.calories) ?? 0),
    avgHeartRate: num(summary.averageHR),
    maxHeartRate: num(summary.maxHR),
    avgPowerWatts: avgPower,
    maxPowerWatts: num(summary.maxPower),
    normalizedPowerWatts: num(summary.normalizedPower),
    functionalThresholdPower: num(summary.functionalThresholdPower),
    workKJ,
    tss:
      num(summary.trainingStressScore) ??
      num(summary.activityTrainingLoad) ??
      // Fallback: Rad ≈ 1 TSS pro kJ
      (sport === "cycling" && workKJ ? workKJ : null),
    intensityFactor: num(summary.intensityFactor),
    avgCadenceRpm: cadenceRaw != null ? Math.round(cadenceRaw * 10) / 10 : null,
    elevationGainMeters: num(summary.elevationGain),
    aerobicTrainingEffect: num(summary.aerobicTrainingEffect),
    anaerobicTrainingEffect: num(summary.anaerobicTrainingEffect),
    hrTimeInZonesMin: zonesToMinutes(payload.hrTimeInZones?.zones ?? undefined),
    powerTimeInZonesMin: zonesToMinutes(payload.powerTimeInZones?.zones ?? undefined),
  };
}

/** ParsedMetrics → UI-GarminActivity (merge-fähig mit bestehenden Syncs). */
export function toGarminActivity(m: ParsedActivityMetrics): GarminActivity {
  return {
    id: `garmin-${m.garminId}`,
    garminId: m.garminId,
    name: m.name,
    type: m.sport === "gym" ? "gym" : m.sport === "other" ? "other" : m.sport,
    device: m.device,
    startTime: m.startTimeIso,
    durationSeconds: m.durationSeconds,
    distanceMeters: m.distanceMeters,
    caloriesBurned: m.calories,
    avgHeartRate: m.avgHeartRate ?? undefined,
    maxHeartRate: m.maxHeartRate ?? undefined,
    avgPowerWatts: m.avgPowerWatts ?? undefined,
    maxPowerWatts: m.maxPowerWatts ?? undefined,
    elevationGainMeters: m.elevationGainMeters ?? undefined,
    trainingEffectAerobic: m.aerobicTrainingEffect ?? undefined,
    trainingEffectAnaerobic: m.anaerobicTrainingEffect ?? undefined,
    normalizedPowerWatts: m.normalizedPowerWatts ?? undefined,
    functionalThresholdPowerWatts: m.functionalThresholdPower ?? undefined,
    workKJ: m.workKJ ?? undefined,
    tss: m.tss ?? undefined,
    intensityFactor: m.intensityFactor ?? undefined,
    avgCadenceRpm: m.avgCadenceRpm ?? undefined,
    timeInZonesMin: m.powerTimeInZonesMin ?? m.hrTimeInZonesMin ?? undefined,
    movingDurationSeconds: m.movingDurationSeconds ?? undefined,
    source: "webhook",
  };
}
