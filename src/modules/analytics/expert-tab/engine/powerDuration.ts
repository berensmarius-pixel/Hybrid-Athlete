// ─── Power Duration Curve Engine (MMP / Mean-Max-Power) ──────────────────────
//
// Baut MMP-Kurven aus verfügbaren Quelldaten:
//   1. Gemessene Ankerpunkte aus Aktivitäts-Summaries:
//      - Avg Power über die volle Dauer (echter Mean-Max-Punkt)
//      - Max Power als ~1s-Anker (Neuromuskulär)
//   2. Persistierte Benchmark-Bests (Webhook-Scan, rolling-window) mit Datum.
//
// Lücken zwischen Ankern werden per Critical-Power-Modell P(t) = CP + W′/t
// interpoliert (Least Squares auf 1/t), damit alle Standarddauern befüllt sind.

import type { GarminActivity } from "@/types";
import {
  loadPowerBenchmarkHistory,
  extractMaxSustainedPower,
  type PowerBenchmarkHistory,
  type DurationBest,
} from "@/lib/analytics/benchmark-detector";

export const PDC_DURATIONS_SECONDS = [
  1, 5, 15, 30, 60, 120, 300, 600, 1200, 3600, 7200,
] as const;

export const PDC_DURATION_LABELS: Record<number, string> = {
  1: "1s",
  5: "5s",
  15: "15s",
  30: "30s",
  60: "1m",
  120: "2m",
  300: "5m",
  600: "10m",
  1200: "20m",
  3600: "60m",
  7200: "120m",
};

/** Fenster für die "Current Fitness"-Kurve (Tage). */
export const PDC_CURRENT_WINDOW_DAYS = 42;
/** Saisonfenster für die Peak-Kurve (Tage). */
export const PDC_SEASON_WINDOW_DAYS = 365;

export interface PowerAnchor {
  durationSeconds: number;
  watts: number;
  /** ISO-Zeitstempel des Efforts (falls bekannt). */
  dateISO?: string;
  activityId?: string;
}

export interface PowerDurationPoint {
  durationSeconds: number;
  /** Geschätzter oder gemessener Mean-Max-Power-Wert in Watt. */
  watts: number | null;
}

export interface CriticalPowerModel {
  cpWatts: number;
  wPrimeJoules: number;
  r2: number;
}

function isFinitePositive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Least-Squares-Fit des 2-parametrigen CP-Modells P(t) = CP + W′/t.
 * Nur Anker ≥ MIN_FIT_DURATION fließen ein (kurze Sprints verzerren das
 * hyperbolische Modell massiv). Liefert `null` bei < 2 gültigen Punkten.
 */
export function fitCriticalPowerModel(
  anchors: PowerAnchor[],
  minDurationSeconds = 30
): CriticalPowerModel | null {
  const pts = anchors
    .filter((a) => isFinitePositive(a.watts) && a.durationSeconds >= minDurationSeconds)
    .map((a) => ({ x: 1 / a.durationSeconds, y: a.watts }));

  if (pts.length < 2) return null;

  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < Number.EPSILON) return null;

  const wPrime = (n * sumXY - sumX * sumY) / denom;
  const cp = (sumY - wPrime * sumX) / n;
  if (!(cp > 0)) return null;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of pts) {
    const pred = cp + wPrime * p.x;
    ssTot += (p.y - meanY) ** 2;
    ssRes += (p.y - pred) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { cpWatts: cp, wPrimeJoules: Math.max(0, wPrime), r2 };
}

/** Modellvorhersage P(t) = CP + W′/t (gekippt bei sehr kurzen Dauern). */
export function predictCriticalPower(
  model: CriticalPowerModel,
  durationSeconds: number
): number {
  if (durationSeconds <= 0) return model.cpWatts + model.wPrimeJoules;
  return model.cpWatts + model.wPrimeJoules / durationSeconds;
}

interface CurveBuildOptions {
  nowISO?: string;
  benchmarkHistory?: PowerBenchmarkHistory | null;
}

export interface PowerDurationCurves {
  /** Letzte 42 Tage (Current Fitness). */
  current: PowerDurationPoint[];
  /** Saison-Peak (365 Tage inkl. All-Time-Benchmarks). */
  season: PowerDurationPoint[];
  currentAnchors: PowerAnchor[];
  seasonAnchors: PowerAnchor[];
  currentModel: CriticalPowerModel | null;
  seasonModel: CriticalPowerModel | null;
}

function withinDays(iso: string | undefined, nowMs: number, days: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= days * 24 * 3600 * 1000;
}

/** Ankerpunkte aus Aktivitäts-Summaries extrahieren. */
export function collectActivityAnchors(
  activities: Pick<GarminActivity, "id" | "startTime" | "durationSeconds" | "avgPowerWatts" | "maxPowerWatts">[],
  fromMs: number,
  toMs: number
): PowerAnchor[] {
  const anchors: PowerAnchor[] = [];
  for (const a of activities) {
    const start = Date.parse(a.startTime);
    if (!Number.isFinite(start) || start < fromMs || start > toMs) continue;

    if (isFinitePositive(a.avgPowerWatts) && a.durationSeconds >= 20) {
      anchors.push({
        durationSeconds: Math.round(a.durationSeconds),
        watts: Math.round(a.avgPowerWatts!),
        dateISO: a.startTime,
        activityId: a.id,
      });
    }
    // Max Power ≈ 1s-Mean-Max (Neuromuskulärer Anker)
    if (isFinitePositive(a.maxPowerWatts)) {
      anchors.push({
        durationSeconds: 1,
        watts: Math.round(a.maxPowerWatts!),
        dateISO: a.startTime,
        activityId: a.id,
      });
    }
  }
  return anchors;
}

/**
 * Kurve für einen Anker-Satz erzeugen: Gemessene Punkte an exakten
 * Standarddauern haben Vorrang, alles andere kommt aus dem CP-Modell
 * (geklemmt auf plausible Grenzen).
 */
export function estimateCurve(anchors: PowerAnchor[]): {
  points: PowerDurationPoint[];
  model: CriticalPowerModel | null;
} {
  if (anchors.length === 0) {
    return {
      points: PDC_DURATIONS_SECONDS.map((d) => ({ durationSeconds: d, watts: null })),
      model: null,
    };
  }

  const model = fitCriticalPowerModel(anchors);
  const maxWatts = Math.max(...anchors.map((a) => a.watts));
  const cap = maxWatts * 1.35;

  const points = PDC_DURATIONS_SECONDS.map((duration) => {
    const measured = anchors.find((a) => a.durationSeconds === duration);
    if (measured) return { durationSeconds: duration, watts: measured.watts };

    if (!model) return { durationSeconds: duration, watts: null };
    const predicted = Math.min(cap, predictCriticalPower(model, duration));
    return {
      durationSeconds: duration,
      watts: Math.round(Math.max(model.cpWatts * 0.6, predicted)),
    };
  });

  return { points, model };
}

/**
 * Beide Vergleichskurven bauen:
 *  - Current: Aktivitäten der letzten 42 Tage (+ frische Benchmarks)
 *  - Season:  365-Tage-Fenster + persistierte All-Time-Bestmarks
 */
export function buildPowerDurationCurves(
  activities: GarminActivity[],
  opts: CurveBuildOptions = {}
): PowerDurationCurves {
  const nowMs =
    opts.nowISO !== undefined ? Date.parse(opts.nowISO) : Date.now();
  const history = opts.benchmarkHistory ?? loadPowerBenchmarkHistory();

  const day = 24 * 3600 * 1000;
  const currentAnchors = collectActivityAnchors(
    activities,
    nowMs - PDC_CURRENT_WINDOW_DAYS * day,
    nowMs
  );
  const seasonAnchors = collectActivityAnchors(
    activities,
    nowMs - PDC_SEASON_WINDOW_DAYS * day,
    nowMs
  );

  // Persistierte Benchmarks einweben
  for (const record of history?.records ?? []) {
    if (record.bestWatts <= 0) continue;
    seasonAnchors.push({
      durationSeconds: record.durationSeconds,
      watts: record.bestWatts,
      dateISO: record.achievedAt,
      activityId: record.activityId,
    });
    if (withinDays(record.achievedAt, nowMs, PDC_CURRENT_WINDOW_DAYS)) {
      currentAnchors.push({
        durationSeconds: record.durationSeconds,
        watts: record.bestWatts,
        dateISO: record.achievedAt,
        activityId: record.activityId,
      });
    }
  }

  const current = estimateCurve(currentAnchors);
  const season = estimateCurve(seasonAnchors);

  return {
    current: current.points,
    season: season.points,
    currentAnchors,
    seasonAnchors,
    currentModel: current.model,
    seasonModel: season.model,
  };
}

/** Absolute-Watt-Kurve → relative W/kg-Kurve. */
export function toRelativeCurve(
  points: PowerDurationPoint[],
  weightKg: number
): PowerDurationPoint[] {
  if (!(weightKg > 0)) return points.map((p) => ({ ...p, watts: null }));
  return points.map((p) => ({
    durationSeconds: p.durationSeconds,
    watts: p.watts === null ? null : Math.round((p.watts / weightKg) * 100) / 100,
  }));
}

/**
 * Echte Mean-Max-Power-Kurve aus einer Watt-Sequenz (z. B. Garmin-Details).
 * Nutzt den vorhandenen Rolling-Window-Scanner aus dem Benchmark-Detector.
 */
export function meanMaxPowerForSeries(
  watts: number[],
  sampleStepSeconds = 1
): DurationBest[] {
  if (!Array.isArray(watts) || watts.length === 0) return [];
  const bests: DurationBest[] = [];
  for (const d of PDC_DURATIONS_SECONDS) {
    if (d / sampleStepSeconds > watts.length) break;
    const best = extractMaxSustainedPower(watts, d, sampleStepSeconds);
    if (best && best.bestWatts > 0) bests.push(best);
  }
  return bests;
}

/** Prozentwert eines Watt-Ergebnisses relativ zur FTP (gerundet auf ganze %). */
export function percentOfFtp(watts: number | null, ftpWatts: number): number | null {
  if (watts === null || !(ftpWatts > 0)) return null;
  return Math.round((watts / ftpWatts) * 100);
}
