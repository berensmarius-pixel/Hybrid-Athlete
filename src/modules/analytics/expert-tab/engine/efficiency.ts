// ─── Aerobic Efficiency & Decoupling Engine ──────────────────────────────────
//
// EF (Efficiency Factor) = Normalized/Avg Power ÷ Avg HR  [W pro bpm]
// Steady-State-Zone-2-Einheiten sind der Goldstandard, um die aerobe
// Adaptation zu verfolgen: steigender EF bei gleicher HR = bessere Ökonomie.
//
// Pw:Hr-Decoupling vergleicht EF der ersten vs. zweiten Hälfte:
//   (EF₁ − EF₂) / EF₁ × 100  →  < 5 % gilt als stabile aerobe Basis.

import type { GarminActivity } from "@/types";

/** Mindestdauer einer "steady state"-Einheit (Sekunden). */
export const STEADY_RIDE_MIN_SECONDS = 2700; // 45 min
/** Z2-Fenster relativ zur FTP (Coggan Z2: 56–75 %). */
export const Z2_MIN_FTP_PCT = 0.5;
export const Z2_MAX_FTP_PCT = 0.78;
/** Unterer HF-Cutoff, um Ausreißer/Datenmüll zu filtern. */
export const MIN_STEADY_HR_BPM = 100;
/** Decoupling-Schwelle für "starke aerobe Basis" (%). */
export const DECOUPLING_THRESHOLD_PCT = 5;

export interface EfficiencyPoint {
  activityId: string;
  name: string;
  dateISO: string;
  /** Zeitstempel (ms) für Scatter-X-Achse. */
  timestamp: number;
  ef: number;
  avgPowerWatts: number;
  avgHeartRate: number;
  durationSeconds: number;
  /** Pw:Hr-Decoupling in % (nur mit Telemetrie berechenbar). */
  decouplingPct?: number | null;
}

function isFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** EF = Power / HR. Liefert `null` bei unplausiblen Eingaben. */
export function computeEfficiencyFactor(
  avgPowerWatts: number,
  avgHeartRate: number
): number | null {
  if (!isFinite(avgPowerWatts) || !isFinite(avgHeartRate)) return null;
  if (avgPowerWatts <= 0 || avgHeartRate < MIN_STEADY_HR_BPM) return null;
  return Math.round((avgPowerWatts / avgHeartRate) * 1000) / 1000;
}

/**
 * Filtert steady-state Zone-2-Rides aus dem Aktivitätslog:
 * Radfahren mit Leistung, Dauer ≥ 45 min, HF plausibel und
 * Avg Power im Coggan-Z2-Fenster relativ zur FTP.
 */
export function selectSteadyZone2Rides(
  activities: GarminActivity[],
  ftpWatts: number
): GarminActivity[] {
  if (!(ftpWatts > 0)) return [];
  return activities.filter((a) => {
    if (a.type !== "cycling") return false;
    if (!isFinite(a.avgPowerWatts) || a.avgPowerWatts! <= 0) return false;
    if (!isFinite(a.avgHeartRate) || a.avgHeartRate! < MIN_STEADY_HR_BPM) return false;
    if (a.durationSeconds < STEADY_RIDE_MIN_SECONDS) return false;
    const pctFtp = a.avgPowerWatts! / ftpWatts;
    return pctFtp >= Z2_MIN_FTP_PCT && pctFtp <= Z2_MAX_FTP_PCT;
  });
}

/** Effizienzpunkte aus gefilterten Rides erzeugen (aufsteigend nach Datum). */
export function buildEfficiencyPoints(activities: GarminActivity[]): EfficiencyPoint[] {
  const points: EfficiencyPoint[] = [];
  for (const a of activities) {
    const ef = computeEfficiencyFactor(a.avgPowerWatts!, a.avgHeartRate!);
    if (ef === null) continue;
    const ts = Date.parse(a.startTime);
    if (!Number.isFinite(ts)) continue;
    points.push({
      activityId: a.id,
      name: a.name,
      dateISO: a.startTime,
      timestamp: ts,
      ef,
      avgPowerWatts: Math.round(a.avgPowerWatts!),
      avgHeartRate: Math.round(a.avgHeartRate!),
      durationSeconds: a.durationSeconds,
    });
  }
  return points.sort((p, q) => p.timestamp - q.timestamp);
}

/**
 * Pw:Hr-Decoupling aus Watt-/HF-Sequenz (gleiche Sample-Rate vorausgesetzt).
 * Vergleicht EF der ersten und zweiten Hälfte des Rides.
 */
export function computeAerobicDecoupling(
  watts: number[],
  heartRates: number[]
): number | null {
  if (
    !Array.isArray(watts) ||
    !Array.isArray(heartRates) ||
    watts.length !== heartRates.length ||
    watts.length < 60
  ) {
    return null;
  }

  const mid = Math.floor(watts.length / 2);

  const halfAvg = (start: number, end: number): { p: number; hr: number } | null => {
    let ps = 0;
    let hs = 0;
    let n = 0;
    for (let i = start; i < end; i++) {
      const p = watts[i];
      const hr = heartRates[i];
      if (isFinite(p) && isFinite(hr) && hr > 50) {
        ps += p;
        hs += hr;
        n++;
      }
    }
    if (n === 0 || hs / n < MIN_STEADY_HR_BPM) return null;
    return { p: ps / n, hr: hs / n };
  };

  const first = halfAvg(0, mid);
  const second = halfAvg(mid, watts.length);
  if (!first || !second || first.hr <= 0 || first.p <= 0) return null;

  const efFirst = first.p / first.hr;
  const efSecond = second.p / second.hr;
  if (efFirst <= 0) return null;

  const decoupling = ((efFirst - efSecond) / efFirst) * 100;
  return Math.round(decoupling * 10) / 10;
}

export interface LinearTrend {
  slope: number;
  intercept: number;
}

/** Einfache Lineare Regression y = slope·x + intercept über (x,y)-Paare. */
export function linearTrend(
  pts: Array<{ x: number; y: number }>
): LinearTrend | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < Number.EPSILON) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}
