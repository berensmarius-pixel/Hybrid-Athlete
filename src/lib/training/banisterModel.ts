// ─── Banister Fitness-Fatigue Model (ATL / CTL / TSB) ────────────────────────

export const ATL_TIME_CONSTANT_DAYS = 7;
export const CTL_TIME_CONSTANT_DAYS = 42;
export const DEFAULT_LOOKBACK_DAYS = 90;

export interface DailyTssEntry {
  tss: number;
  activities?: string[];
}

export type DailyTssMap = Record<string, DailyTssEntry>;

export interface FatigueDay {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface FatigueSnapshot extends FatigueDay {
  trend: FatigueDay[];
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function decayFactor(timeConstantDays: number): number {
  return 1 - Math.exp(-1 / timeConstantDays);
}

/**
 * Iterative Banister impulse-response: CTL (42d) und ATL (7d) werden über die
 * tägliche TSS-Historie akkumuliert; TSB = CTL − ATL (Form von heute).
 * Vor dem ersten Datenpunkt wird TSS=0 angenommen (konservatives Seeding).
 */
export function computeBanisterSeries(
  dailyTss: DailyTssMap,
  todayISO: string,
  lookbackDays = DEFAULT_LOOKBACK_DAYS
): FatigueSnapshot {
  const today = new Date(`${todayISO}T12:00:00`);
  if (Number.isNaN(today.getTime())) throw new Error(`Ungültiges Datum: ${todayISO}`);

  const dates = Object.keys(dailyTss).sort();
  const earliestData = dates.length > 0 ? new Date(`${dates[0]}T12:00:00`) : null;

  const start = new Date(today);
  start.setDate(start.getDate() - lookbackDays);
  if (earliestData && earliestData < start) start.setTime(earliestData.getTime());

  let ctl = 0;
  let atl = 0;
  const ctlStep = decayFactor(CTL_TIME_CONSTANT_DAYS);
  const atlStep = decayFactor(ATL_TIME_CONSTANT_DAYS);

  const series: FatigueDay[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    const entry = dailyTss[iso];
    const tss = typeof entry === "number" ? entry : entry?.tss ?? 0;

    ctl += (tss - ctl) * ctlStep;
    atl += (tss - atl) * atlStep;

    series.push({
      date: iso,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  const last = series[series.length - 1] ?? {
    date: todayISO,
    ctl: 0,
    atl: 0,
    tsb: 0,
  };

  return { ...last, trend: series.slice(-28) };
}
