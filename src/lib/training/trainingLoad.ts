// ─── Training Load Engine: ATL / CTL / TSB ───────────────────────────────────
//
// Dünne Schicht ÜBER dem Banister-Modell (banisterModel.ts liefert die
// EMA-Mathematik mit den Standard-Zeitkonstanten 7d/42d):
//   1. GarminActivity → geschätzte Daily-TSS (Garmin-Wert > kJ > HF-Näherung)
//   2. Tagesreihe inkl. Lückenfüllung (trainingsfreie Tage = 0)
//   3. Snapshot für Dashboard/Debrief (Form-Einordnung)

import type { GarminActivity, TrainingLoadSnapshot } from "@/types";
import {
  computeBanisterSeries,
  type DailyTssMap,
} from "@/lib/training/banisterModel";

export {
  ATL_TIME_CONSTANT_DAYS as ATL_TIME_CONSTANT,
  CTL_TIME_CONSTANT_DAYS as CTL_TIME_CONSTANT,
} from "@/lib/training/banisterModel";

/** Maximal zurückgereichte Historie (Schutz vor riesigen Rückwärtsläufen). */
export const MAX_HISTORY_DAYS = 365;

export interface LoadActivityInput {
  /** YYYY-MM-DD (lokales Datum des Aktivitätsstarts) */
  date: string;
  tss: number;
}

export interface DailyLoadPoint {
  date: string;
  dailyTss: number;
  atl: number;
  ctl: number;
  tsb: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Daily-TSS einer Aktivität schätzen.
 * `thresholdHr` dient als Referenz für die HF-basierte Näherung (Default ~88 % maxHF).
 */
export function computeDailyTss(
  activity: Pick<
    GarminActivity,
    | "tss"
    | "workKJ"
    | "avgPowerWatts"
    | "durationSeconds"
    | "avgHeartRate"
    | "type"
  >,
  opts: { thresholdHr?: number } = {}
): number {
  if (typeof activity.tss === "number" && activity.tss > 0) {
    return round1(activity.tss);
  }

  // Rad: kJ ≈ TSS (metabolischer Wirkungsgrad ~24 % macht kJ ≈ TSS-Arbeit)
  if (typeof activity.workKJ === "number" && activity.workKJ > 0) {
    return round1(activity.workKJ);
  }

  // rTSS-Näherung: (h) · (HF/Schwellen-HF)² · 100
  const durationHours = activity.durationSeconds / 3600;
  const thresholdHr = opts.thresholdHr ?? 168;
  if (durationHours > 0 && activity.avgHeartRate && activity.avgHeartRate > 50) {
    const ratio = Math.min(activity.avgHeartRate / thresholdHr, 1.4);
    return round1(durationHours * ratio * ratio * 100);
  }

  // Letzter Fallback: moderate Intensität annehmen (~55 TSS/h)
  if (durationHours > 0) {
    return round1(durationHours * 55);
  }
  return 0;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Aktivitäts-TSS-Einträge → tägliche Lastreihe (Lücken = 0) bis `endDate`.
 * Die EMA-Mathematik delegiert an das Banister-Modell.
 */
export function buildLoadSeries(
  entries: LoadActivityInput[],
  endDate?: Date
): DailyLoadPoint[] {
  const valid = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
  if (valid.length === 0) return [];

  const byDate = new Map<string, number>();
  for (const e of valid) {
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.tss);
  }

  const end = endDate ? stripTime(endDate) : stripTime(new Date());
  const maxStart = new Date(end);
  maxStart.setDate(maxStart.getDate() - MAX_HISTORY_DAYS + 1);

  const earliest = [...byDate.keys()].sort()[0];
  let start = parseLocalDate(earliest);
  if (start < maxStart) start = maxStart;

  const lookbackDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );

  // Sparse-Map genügt – computeBanisterSeries füllt fehlende Tage mit 0
  const dailyTss: DailyTssMap = {};
  for (const [date, tss] of byDate) dailyTss[date] = { tss };

  const snapshot = computeBanisterSeries(
    dailyTss,
    toLocalDateString(end),
    lookbackDays
  );

  return snapshot.trend.map((day) => ({
    date: day.date,
    dailyTss: dailyTss[day.date]
      ? round1(typeof dailyTss[day.date] === "number"
          ? (dailyTss[day.date] as unknown as number)
          : dailyTss[day.date].tss)
      : 0,
    atl: day.atl,
    ctl: day.ctl,
    tsb: day.tsb,
  }));
}

/** Snapshot am letzten Tag der Reihe inkl. Form-Einordnung. */
export function summarizeLoad(series: DailyLoadPoint[]): TrainingLoadSnapshot | null {
  const last = series.at(-1);
  if (!last) return null;

  let status: TrainingLoadSnapshot["status"];
  if (last.tsb >= 5) status = "fresh";
  else if (last.tsb <= -30) status = "overreaching";
  else if (last.tsb <= -10) status = "fatigued";
  else status = "neutral";

  return {
    ...last,
    status,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Komfortfunktion: Aktivitäten → TSS-Reihe → Snapshot.
 * `endDate` erlaubt deterministische Tests.
 */
export function computeTrainingLoadFromActivities(
  activities: GarminActivity[],
  opts: { thresholdHr?: number; endDate?: Date } = {}
): { series: DailyLoadPoint[]; snapshot: TrainingLoadSnapshot | null } {
  const entries = activities
    .map((a) => ({
      date: (a.startTime || "").slice(0, 10),
      tss: computeDailyTss(a, opts),
    }))
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));

  const series = buildLoadSeries(entries, opts.endDate);
  return { series, snapshot: summarizeLoad(series) };
}
