/**
 * Deduplizierung überlappinger Imports: Dieselbe Einheit (z. B. eine Radeinheit,
 * die Garmin UND Strava aufzeichnen) darf nur einmal im Trainingslog landen.
 *
 * Match-Kriterien (UND-verknüpft):
 *   1. Startzeit innerhalb ±TIMESTAMP_TOLERANCE_MS (2 Minuten)
 *   2. Dauer innerhalb ±DURATION_TOLERANCE_SECONDS (30 s)
 *
 * Reine Funktionen – ohne Server-/Browser-Abhängigkeiten (testbar via vitest).
 */

import type { EnduranceSession, GarminActivity } from "@/types";

/** Startzeit-Toleranz: ±2 Minuten */
export const TIMESTAMP_TOLERANCE_MS = 2 * 60 * 1000;
/** Dauer-Toleranz: Auto-Pause/GPS-Rauschen zwischen Quellen ausgleichen */
export const DURATION_TOLERANCE_SECONDS = 30;

export interface DedupCandidate {
  /** Startzeit als UNIX-ms */
  startTimeMs: number;
  /** Dauer in Sekunden */
  durationSeconds: number;
}

// ─── Normalisierung der Domänen-Typen ─────────────────────────────────────────

function parseDurationString(duration: string): number | null {
  // Formate "MM:SS" bzw. "H:MM:SS" (siehe stravaToEnduranceSession)
  const parts = duration.split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p)) || parts.length < 2 || parts.length > 3) {
    return null;
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

export function sessionToCandidate(session: EnduranceSession): DedupCandidate | null {
  const startTimeMs = Date.parse(session.date);
  if (!Number.isFinite(startTimeMs)) return null;

  const durationSeconds =
    typeof session.duration === "string"
      ? parseDurationString(session.duration)
      : null;
  if (durationSeconds == null) return null;

  return { startTimeMs, durationSeconds };
}

export function garminToCandidate(activity: GarminActivity): DedupCandidate | null {
  const startTimeMs = Date.parse(activity.startTime);
  if (!Number.isFinite(startTimeMs)) return null;
  if (!Number.isFinite(activity.durationSeconds)) return null;
  return { startTimeMs, durationSeconds: activity.durationSeconds };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

export function isWithinTolerance(
  a: DedupCandidate,
  b: DedupCandidate
): boolean {
  const timeDeltaMs = Math.abs(a.startTimeMs - b.startTimeMs);
  const durationDeltaS = Math.abs(a.durationSeconds - b.durationSeconds);
  return (
    timeDeltaMs <= TIMESTAMP_TOLERANCE_MS &&
    durationDeltaS <= DURATION_TOLERANCE_SECONDS
  );
}

/** true, wenn ein bestehender Kandidat dem neuen innerhalb der Toleranz entspricht. */
export function findDuplicate(
  candidate: DedupCandidate,
  existing: readonly DedupCandidate[]
): DedupCandidate | undefined {
  return existing.find((e) => isWithinTolerance(candidate, e));
}
