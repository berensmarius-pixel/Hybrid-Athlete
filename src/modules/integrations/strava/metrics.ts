/**
 * KI-Coaching-Metriken für den strukturierten Aktivitätsbeschreibungs-Upload.
 *
 * Reine Funktionen (kein Netzwerk/Env) – vitest-abgedeckt.
 *  - Zone Compliance: Anteil der Bewegungszeit in den Hybrid-Zielzonen (Z2–Z4)
 *  - Work Done: kJ – gemessen (Leistungsmesser) → Kalorien → Fallback
 */

import type { StravaDetailedActivity, StravaZoneBucket } from "./types";

/**
 * Zielband des Hybrid-Athlete-Engines: Zonen 2–4 (Index 1–3).
 * Index 0 = Zone 1 … Index 4 = Zone 5.
 */
export const TARGET_ZONE_INDICES = [1, 2, 3] as const;

/** kJ pro kcal (thermochemische Konvention: 1 kcal = 4.184 kJ). */
export const KJ_PER_KCAL = 4.184;

export interface CoachingMetrics {
  /** 0–100, ganzzahlig gerundet; null wenn keine Zonendaten vorliegen */
  zoneCompliancePct: number | null;
  /** Arbeit in kJ; null wenn nicht bestimmbar */
  workKJ: number | null;
}

/**
 * Anteil der Gesamtzeit in den Zielzonen (in Prozent, ganzzahlig).
 * `zoneSeconds` ist die Zeitverteilung je Zone (Index 0 = Zone 1 …).
 */
export function computeZoneCompliance(
  zoneSeconds: readonly number[],
  targetIndices: readonly number[] = TARGET_ZONE_INDICES
): number | null {
  if (!Array.isArray(zoneSeconds) || zoneSeconds.length === 0) return null;

  const valid = zoneSeconds.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
  const total = valid.reduce((sum, s) => sum + s, 0);
  // Ohne messbare Zeitverteilung (nur Nullen) keine Aussage möglich
  if (total <= 0) return null;

  let inTarget = 0;
  for (const idx of targetIndices) {
    if (idx >= 0 && idx < valid.length) inTarget += valid[idx];
  }

  return Math.round((inTarget / total) * 100);
}

/** Normalisiert Strava-Zone-Buckets auf ein reines Sekunden-Array. */
export function bucketsToZoneSeconds(buckets: readonly StravaZoneBucket[]): number[] {
  return buckets.map((b) =>
    b && Number.isFinite(b.time) && b.time > 0 ? b.time : 0
  );
}

/**
 * Work Done in kJ.
 *
 * Priorität:
 *   1. `kilojoules` – direkt vom Leistungsmesser (Radsport)
 *   2. `calories × 4.184` – metabolische Arbeit
 *   3. `average_watts × moving_time / 1000` – gemittelte Power
 */
export function computeWorkKJ(
  activity: Partial<StravaDetailedActivity>
): number | null {
  if (Number.isFinite(activity.kilojoules) && (activity.kilojoules ?? 0) > 0) {
    return Math.round(activity.kilojoules as number);
  }

  if (Number.isFinite(activity.calories) && (activity.calories ?? 0) > 0) {
    return Math.round((activity.calories as number) * KJ_PER_KCAL);
  }

  if (
    Number.isFinite(activity.average_watts) &&
    (activity.average_watts ?? 0) > 0 &&
    Number.isFinite(activity.moving_time) &&
    (activity.moving_time ?? 0) > 0
  ) {
    const kj =
      ((activity.average_watts as number) * (activity.moving_time as number)) / 1000;
    return Math.round(kj);
  }

  return null;
}

/**
 * Aggregiert beide Metriken.
 *
 * Zonen-Quellen in Priorität:
 *   1. Strava-Zonen-Buckets (GET /activities/{id}/zones)
 *   2. lokal gepflegte Zonenaufteilung der Session (Minuten, siehe hrZones)
 */
export function computeCoachingMetrics(
  activity: Partial<StravaDetailedActivity>,
  hrZoneBuckets?: readonly StravaZoneBucket[] | null,
  localHrZoneMinutes?: readonly number[] | null
): CoachingMetrics {
  let zoneCompliancePct: number | null = null;

  if (hrZoneBuckets && hrZoneBuckets.length > 0) {
    zoneCompliancePct = computeZoneCompliance(bucketsToZoneSeconds(hrZoneBuckets));
  }
  if (zoneCompliancePct == null && Array.isArray(localHrZoneMinutes)) {
    zoneCompliancePct = computeZoneCompliance(localHrZoneMinutes);
  }

  return { zoneCompliancePct, workKJ: computeWorkKJ(activity) };
}
