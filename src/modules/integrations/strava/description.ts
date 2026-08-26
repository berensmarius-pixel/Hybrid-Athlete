/**
 * Strukturierte Beschreibungs-Uploads: Nach jedem Sync/Webhook wird die
 * Strava-Aktivitätsbeschreibung automatisch mit den KI-Coaching-Metriken
 * des Hybrid Athlete Engines formatiert, z. B.
 *
 *   "⚡ 96% Zone Compliance | 🔥 1,420 kJ Work Done | Hybrid Athlete Engine"
 *
 * Segmente ohne Daten (z. B. keine Zonendaten) werden weggelassen;
 * der Signatur-Suffix bleibt immer erhalten.
 */

import type { CoachingMetrics } from "./metrics";

export const DESCRIPTION_SIGNATURE = "Hybrid Athlete Engine";

/** "1420" → "1,420" (deterministisch en-US, unabhängig vom Server-Locale). */
export function formatThousands(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/**
 * Baut die Beschreibung aus den Metriken.
 * Verfügbare Segmente in fester Reihenfolge: Compliance → Work → Signatur.
 */
export function buildCoachingDescription(metrics: CoachingMetrics): string {
  const segments: string[] = [];

  if (metrics.zoneCompliancePct != null && metrics.zoneCompliancePct >= 0) {
    segments.push(`⚡ ${metrics.zoneCompliancePct}% Zone Compliance`);
  }
  if (metrics.workKJ != null && metrics.workKJ > 0) {
    segments.push(`🔥 ${formatThousands(metrics.workKJ)} kJ Work Done`);
  }

  segments.push(DESCRIPTION_SIGNATURE);
  return segments.join(" | ");
}
