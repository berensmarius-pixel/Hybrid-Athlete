// ─── Power Metrics & Peak Power Curve Engine (Coggan) ────────────────────────

export const PEAK_DURATIONS_SECONDS = [5, 60, 300, 1200] as const;
export const PDC_DURATIONS_SECONDS = [
  1, 5, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 2700, 3600,
] as const;

export interface PeakPowerResult {
  durationSeconds: number;
  watts: number | null;
}

export interface PowerZoneDistribution {
  zone: number;
  name: string;
  minutes: number;
}

export interface PowerMetricsInput {
  power: Array<number | null>;
  intervalSeconds: number;
  ftpWatts: number;
}

export interface PowerMetrics {
  avgPowerWatts: number | null;
  maxPowerWatts: number | null;
  peakPowers: PeakPowerResult[];
  normalizedPower: number | null;
  intensityFactor: number | null;
  trainingStressScore: number | null;
  zones: PowerZoneDistribution[];
  movingSeconds: number;
}

const ZONE_DEFS = [
  { zone: 1, name: "Z1 Aktive Erholung", minPct: 0, maxPct: 0.55 },
  { zone: 2, name: "Z2 Ausdauer", minPct: 0.55, maxPct: 0.75 },
  { zone: 3, name: "Z3 Tempo", minPct: 0.75, maxPct: 0.9 },
  { zone: 4, name: "Z4 Threshold", minPct: 0.9, maxPct: 1.05 },
  { zone: 5, name: "Z5 VO2 Max", minPct: 1.05, maxPct: 1.2 },
  { zone: 6, name: "Z6 Anaerob", minPct: 1.2, maxPct: Infinity },
];

function toPrefixSums(values: Array<number | null>): Float64Array {
  const sums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) {
    sums[i + 1] = sums[i] + (values[i] ?? 0);
  }
  return sums;
}

function windowMean(
  sums: Float64Array,
  windowSamples: number
): { mean: number; endIndex: number } {
  let best = -1;
  let bestEnd = -1;
  for (let end = windowSamples; end < sums.length; end++) {
    const mean = (sums[end] - sums[end - windowSamples]) / windowSamples;
    if (mean > best) {
      best = mean;
      bestEnd = end;
    }
  }
  return { mean: best, endIndex: bestEnd };
}

export function rollingPeakPower(
  power: Array<number | null>,
  windowSeconds: number,
  intervalSeconds = 1
): number | null {
  if (power.length === 0) return null;
  const windowSamples = Math.max(1, Math.round(windowSeconds / intervalSeconds));
  if (windowSamples > power.length) return null;
  const { mean } = windowMean(toPrefixSums(power), windowSamples);
  return mean >= 0 ? Math.round(mean) : null;
}

export function peakPowersForDurations(
  power: Array<number | null>,
  intervalSeconds = 1,
  durations: readonly number[] = PDC_DURATIONS_SECONDS
): PeakPowerResult[] {
  return durations.map((durationSeconds) => ({
    durationSeconds,
    watts: rollingPeakPower(power, durationSeconds, intervalSeconds),
  }));
}

export function normalizedPower(
  power: Array<number | null>,
  intervalSeconds = 1
): number | null {
  if (power.length === 0) return null;
  const windowSamples = Math.max(1, Math.round(30 / intervalSeconds));

  if (power.length < windowSamples) {
    const valid = power.filter((w): w is number => w !== null && w > 0);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }

  const sums = toPrefixSums(power);
  let fourthPowerSum = 0;
  let windows = 0;
  for (let end = windowSamples; end < sums.length; end++) {
    const mean = (sums[end] - sums[end - windowSamples]) / windowSamples;
    fourthPowerSum += mean ** 4;
    windows++;
  }
  if (windows === 0) return null;
  return Math.round((fourthPowerSum / windows) ** 0.25);
}

export function intensityFactor(
  normalizedPowerWatts: number | null,
  ftpWatts: number
): number | null {
  if (!normalizedPowerWatts || !ftpWatts || ftpWatts <= 0) return null;
  return Math.round((normalizedPowerWatts / ftpWatts) * 1000) / 1000;
}

export function trainingStressScore(
  movingSeconds: number,
  normalizedPowerWatts: number | null,
  intensityFactorValue: number | null,
  ftpWatts: number
): number | null {
  if (!normalizedPowerWatts || !intensityFactorValue || !ftpWatts) return null;
  const tss =
    ((movingSeconds * normalizedPowerWatts * intensityFactorValue) /
      (ftpWatts * 3600)) *
    100;
  return Math.round(tss * 10) / 10;
}

export function timeInPowerZones(
  power: Array<number | null>,
  intervalSeconds: number,
  ftpWatts: number
): PowerZoneDistribution[] {
  const counts = new Array<number>(ZONE_DEFS.length).fill(0);
  for (const watts of power) {
    if (watts === null || watts <= 0) continue;
    const pct = watts / ftpWatts;
    for (let z = 0; z < ZONE_DEFS.length; z++) {
      if (pct >= ZONE_DEFS[z].minPct && pct <= ZONE_DEFS[z].maxPct) {
        counts[z]++;
        break;
      }
    }
  }
  return ZONE_DEFS.map((z, i) => ({
    zone: z.zone,
    name: z.name,
    minutes: Math.round(((counts[i] * intervalSeconds) / 60) * 10) / 10,
  }));
}

export function computePowerMetrics(input: PowerMetricsInput): PowerMetrics {
  const { power, intervalSeconds, ftpWatts } = input;

  const validValues = power.filter((w): w is number => w !== null && w > 0);
  const movingSeconds = validValues.length * intervalSeconds;

  const np = movingSeconds >= 300 ? normalizedPower(power, intervalSeconds) : null;
  const npFinal =
    np ??
    (validValues.length > 0
      ? Math.round(validValues.reduce((a, b) => a + b, 0) / validValues.length)
      : null);
  const ifValue = intensityFactor(npFinal, ftpWatts);
  const tss = trainingStressScore(movingSeconds, npFinal, ifValue, ftpWatts);

  return {
    avgPowerWatts:
      validValues.length > 0
        ? Math.round(validValues.reduce((a, b) => a + b, 0) / validValues.length)
        : null,
    maxPowerWatts: validValues.length > 0 ? Math.max(...validValues) : null,
    peakPowers: peakPowersForDurations(power, intervalSeconds, PEAK_DURATIONS_SECONDS),
    normalizedPower: npFinal,
    intensityFactor: ifValue,
    trainingStressScore: tss,
    zones: timeInPowerZones(power, intervalSeconds, ftpWatts),
    movingSeconds,
  };
}
