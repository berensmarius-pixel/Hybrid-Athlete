import type { GarminActivityDetails } from "@/types";
import {
  calculateCogganPowerZones,
  type PowerZone,
} from "@/lib/calculator/zonesCalculator";
import {
  getFitnessProfile,
  saveFitnessProfile,
  type FitnessProfile,
} from "@/lib/workout/targetEngine";

export const BENCHMARK_DURATIONS_SECONDS = [5, 30, 60, 300, 1200, 3600] as const;

export const BENCHMARK_DURATION_LABELS: Record<number, string> = {
  5: "5s",
  30: "30s",
  60: "1m",
  300: "5m",
  1200: "20m",
  3600: "60m",
};

export const EFTP_20M_FACTOR = 0.95;
export const FTP_BREAKTHROUGH_THRESHOLD = 0.02;

export const BENCHMARK_HISTORY_STORAGE_KEY = "hybrid_athlete_power_benchmarks";
export const POWER_ZONES_STORAGE_KEY = "hybrid_athlete_power_zones";

export const FTP_BREAKTHROUGH_EVENT = "hybrid:ftp-breakthrough";
export const FTP_UPDATE_APPLIED_EVENT = "hybrid:ftp-update-applied";

const POWER_SERIES_KEYS = ["watts", "power", "directpower", "powerwatts"];

export interface DurationBest {
  durationSeconds: number;
  label: string;
  bestWatts: number;
  startSecond?: number;
}

export interface MortonModelFit {
  cpWatts: number;
  wPrimeJoules: number;
  tauSeconds: number;
  r2: number;
  pointsUsed: number;
}

export type FtpEstimateMethod = "eftp_20m" | "morton_cp" | "none";

export interface BenchmarkScanResult {
  activityId?: string;
  bests: DurationBest[];
  eftp20mWatts: number | null;
  mortonFit: MortonModelFit | null;
  cpEstimatedFtpWatts: number | null;
  estimatedFtpWatts: number | null;
  method: FtpEstimateMethod;
}

export interface FtpBreakthroughEventPayload {
  type: "ftp_breakthrough";
  activityId?: string;
  detectedAt: string;
  previousFtpWatts: number;
  newFtpWatts: number;
  deltaWatts: number;
  deltaPercent: number;
  p20BestWatts: number | null;
  eftp20mWatts: number | null;
  cpEstimatedFtpWatts: number | null;
  method: Exclude<FtpEstimateMethod, "none">;
  message: string;
}

export interface BenchmarkScanInput {
  watts: number[];
  sampleStepSeconds?: number;
  activityId?: string;
  currentFtpWattsOverride?: number;
}

export interface PowerBenchmarkRecord extends DurationBest {
  activityId?: string;
  achievedAt: string;
}

export interface PowerBenchmarkHistory {
  records: PowerBenchmarkRecord[];
  updatedAt: string;
}

export interface FtpUpdateResult {
  profile: FitnessProfile;
  zones: PowerZone[];
  previousFtpWatts: number;
}

function isValidWatt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function extractMaxSustainedPower(
  watts: number[],
  durationSeconds: number,
  sampleStepSeconds = 1
): DurationBest | null {
  if (!Array.isArray(watts) || watts.length === 0) return null;
  const step =
    Number.isFinite(sampleStepSeconds) && sampleStepSeconds > 0
      ? sampleStepSeconds
      : 1;
  const windowLength = Math.max(1, Math.round(durationSeconds / step));
  if (windowLength > watts.length) return null;

  let windowSum = 0;
  let windowValid = 0;
  let bestAvg = -1;
  let bestStart = -1;

  for (let i = 0; i < watts.length; i++) {
    const v = watts[i];
    if (isValidWatt(v)) {
      windowSum += v;
      windowValid++;
    }
    if (i < windowLength - 1) continue;

    if (windowValid === windowLength) {
      const avg = windowSum / windowLength;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestStart = i - windowLength + 1;
      }
    }

    const leavingIndex = i - windowLength + 1;
    const leaving = watts[leavingIndex];
    if (isValidWatt(leaving)) {
      windowSum -= leaving;
      windowValid--;
    }
  }

  if (bestStart < 0) return null;
  return {
    durationSeconds,
    label: BENCHMARK_DURATION_LABELS[durationSeconds] ?? `${durationSeconds}s`,
    bestWatts: Math.round(bestAvg),
    startSecond: bestStart * step,
  };
}

export function scanActivityBenchmarks(
  input: BenchmarkScanInput
): BenchmarkScanResult {
  const step = input.sampleStepSeconds ?? 1;
  const bests: DurationBest[] = [];
  for (const d of BENCHMARK_DURATIONS_SECONDS) {
    const best = extractMaxSustainedPower(input.watts, d, step);
    if (best && best.bestWatts > 0) bests.push(best);
  }

  const p20 = bests.find((b) => b.durationSeconds === 1200) ?? null;
  const eftp20mWatts = p20 ? Math.round(p20.bestWatts * EFTP_20M_FACTOR) : null;

  const fitPoints = bests.map((b) => ({
    durationSeconds: b.durationSeconds,
    watts: b.bestWatts,
  }));
  const mortonFit = fitMorton3Param(fitPoints);
  const cpEstimatedFtpWatts = mortonFit ? Math.round(mortonFit.cpWatts) : null;

  let estimatedFtpWatts: number | null = null;
  let method: FtpEstimateMethod = "none";
  if (eftp20mWatts !== null) {
    estimatedFtpWatts = eftp20mWatts;
    method = "eftp_20m";
  } else if (cpEstimatedFtpWatts !== null) {
    estimatedFtpWatts = cpEstimatedFtpWatts;
    method = "morton_cp";
  }

  return {
    activityId: input.activityId,
    bests,
    eftp20mWatts,
    mortonFit,
    cpEstimatedFtpWatts,
    estimatedFtpWatts,
    method,
  };
}

export function powerSeriesFromDetails(
  details: GarminActivityDetails | null | undefined
): { watts: number[]; sampleStepSeconds: number } | null {
  const series = details?.series;
  if (!series) return null;

  let values: number[] | undefined =
    Array.isArray(series.watts) && series.watts.some(isValidWatt)
      ? series.watts
      : undefined;

  if (!values) {
    for (const key of Object.keys(series)) {
      if (
        key.toLowerCase() !== "watts" &&
        POWER_SERIES_KEYS.includes(key.toLowerCase())
      ) {
        const candidate = series[key];
        if (Array.isArray(candidate) && candidate.some(isValidWatt)) {
          values = candidate;
          break;
        }
      }
    }
  }

  if (!values) return null;
  return { watts: values, sampleStepSeconds: details!.sampleStepSeconds ?? 1 };
}

function optimizeSse(
  sseAt: (cp: number, k: number) => number,
  cp0: number,
  k0: number,
  cpCeil: number
): { cp: number; k: number; sse: number } {
  const clampCp = (cp: number): number =>
    Math.min(cpCeil, Math.max(Number.EPSILON, cp));
  const clampK = (k: number): number => Math.min(600, Math.max(0, k));

  let pts: Array<[number, number]> = [
    [clampCp(cp0), clampK(k0)],
    [clampCp(cp0 * 1.05 + 2), clampK(k0)],
    [clampCp(cp0), clampK(k0 * 2 + 10)],
  ];
  let vals = pts.map(([c, k]) => sseAt(c, k));

  for (let iter = 0; iter < 300; iter++) {
    const order = [0, 1, 2].sort((a, b) => vals[a] - vals[b]);
    pts = order.map((i) => pts[i]);
    vals = order.map((i) => vals[i]);

    if (Math.abs(vals[2] - vals[0]) < 1e-10) break;

    const cx = (pts[0][0] + pts[1][0]) / 2;
    const ck = (pts[0][1] + pts[1][1]) / 2;

    const rx = cx + (cx - pts[2][0]);
    const rk = ck + (ck - pts[2][1]);
    const rs = sseAt(clampCp(rx), clampK(rk));

    if (rs < vals[0]) {
      const ex = cx + 2 * (rx - cx);
      const ek = ck + 2 * (rk - ck);
      const es = sseAt(clampCp(ex), clampK(ek));
      if (es < rs) {
        pts[2] = [ex, ek];
        vals[2] = es;
      } else {
        pts[2] = [rx, rk];
        vals[2] = rs;
      }
      continue;
    }

    if (rs < vals[1]) {
      pts[2] = [rx, rk];
      vals[2] = rs;
      continue;
    }

    const cxx = cx + 0.5 * (pts[2][0] - cx);
    const ckk = ck + 0.5 * (pts[2][1] - ck);
    const cs = sseAt(clampCp(cxx), clampK(ckk));

    if (cs < vals[2]) {
      pts[2] = [cxx, ckk];
      vals[2] = cs;
      continue;
    }

    for (let i = 1; i < 3; i++) {
      pts[i] = [
        pts[0][0] + 0.5 * (pts[i][0] - pts[0][0]),
        pts[0][1] + 0.5 * (pts[i][1] - pts[0][1]),
      ];
      vals[i] = sseAt(pts[i][0], pts[i][1]);
    }
  }

  const bi =
    vals[0] <= vals[1] && vals[0] <= vals[2]
      ? 0
      : vals[1] <= vals[2]
        ? 1
        : 2;
  return { cp: pts[bi][0], k: pts[bi][1], sse: vals[bi] };
}

export function fitMorton3Param(
  points: Array<{ durationSeconds: number; watts: number }>
): MortonModelFit | null {
  const clean = (points ?? [])
    .filter(
      (p) =>
        Number.isFinite(p.durationSeconds) &&
        p.durationSeconds > 0 &&
        isValidWatt(p.watts) &&
        p.watts > 0
    )
    .map((p) => ({ t: p.durationSeconds, p: p.watts }));

  if (clean.length < 3) return null;
  if (Math.max(...clean.map((c) => c.t)) < 180) return null;

  const pMin = Math.min(...clean.map((c) => c.p));
  const pMax = Math.max(...clean.map((c) => c.p));
  if (pMax - pMin < 1) return null;

  const sseAt = (cp: number, k: number): number => {
    if (!(cp > 0) || !(k >= 0)) return Number.MAX_SAFE_INTEGER;
    let wSum = 0;
    for (const pt of clean) {
      wSum += (pt.p - cp) * (pt.t + k);
    }
    const wPrime = wSum / clean.length;
    if (!Number.isFinite(wPrime) || wPrime <= 1000) {
      return Number.MAX_SAFE_INTEGER;
    }
    let sse = 0;
    for (const pt of clean) {
      const pred = cp + wPrime / (pt.t + k);
      const err = pt.p - pred;
      sse += err * err;
    }
    return sse;
  };

  const cpLow = Math.max(50, pMin * 0.4);
  const seeds: Array<[number, number]> = [];
  const pushSeed = (cp: number, k: number): void => {
    if (
      !seeds.some(([c, kk]) => Math.abs(c - cp) < 1 && Math.abs(kk - k) < 1)
    ) {
      seeds.push([cp, k]);
    }
  };

  const gridCandidates: Array<{ cp: number; k: number; sse: number }> = [];
  for (let ci = 0; ci <= 32; ci++) {
    const cp = cpLow + ((pMax - cpLow) * ci) / 32;
    for (let ki = 0; ki <= 20; ki++) {
      const k = (300 * ki) / 20;
      gridCandidates.push({ cp, k, sse: sseAt(cp, k) });
    }
  }
  gridCandidates.sort((a, b) => a.sse - b.sse);
  for (const c of gridCandidates.slice(0, 8)) {
    if (!Number.isFinite(c.sse)) break;
    pushSeed(c.cp, c.k);
  }

  const sortedByT = [...clean].sort((a, b) => a.t - b.t);
  const shortPt = sortedByT[0];
  const longPt = sortedByT[sortedByT.length - 1];
  const tSpan = longPt.t - shortPt.t;
  if (tSpan > 0) {
    const cpLin =
      (longPt.p * longPt.t - shortPt.p * shortPt.t) / tSpan;
    if (Number.isFinite(cpLin) && cpLin > 0) {
      pushSeed(Math.min(pMax * 0.999, Math.max(cpLow, cpLin)), 30);
    }
  }
  pushSeed((cpLow + pMax) / 2, 60);

  let bestCp = NaN;
  let bestK = NaN;
  let bestWPrime = NaN;
  let bestSse = Infinity;

  for (const [c0, k0] of seeds) {
    const fit = optimizeSse(sseAt, c0, k0, pMax);
    if (fit.sse < bestSse) {
      bestSse = fit.sse;
      bestCp = fit.cp;
      bestK = fit.k;
    }
  }

  if (
    !Number.isFinite(bestCp) ||
    !Number.isFinite(bestK) ||
    bestSse >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }

  let wSum = 0;
  for (const pt of clean) {
    wSum += (pt.p - bestCp) * (pt.t + bestK);
  }
  bestWPrime = wSum / clean.length;
  if (!Number.isFinite(bestWPrime) || bestWPrime <= 0) return null;

  const meanP =
    clean.reduce((s, c) => s + c.p, 0) / clean.length;
  let ssTot = 0;
  for (const c of clean) ssTot += (c.p - meanP) ** 2;
  const r2 = ssTot > 0 ? 1 - bestSse / ssTot : 1;

  return {
    cpWatts: Math.round(bestCp),
    wPrimeJoules: Math.round(bestWPrime),
    tauSeconds: Math.round(bestK * 10) / 10,
    r2: Math.round(r2 * 1000) / 1000,
    pointsUsed: clean.length,
  };
}

export function detectFtpBreakthrough(
  scan: BenchmarkScanResult,
  currentFtpWatts: number
): FtpBreakthroughEventPayload | null {
  if (
    !scan ||
    scan.method === "none" ||
    !scan.estimatedFtpWatts ||
    !currentFtpWatts ||
    currentFtpWatts <= 0
  ) {
    return null;
  }

  const thresholdWatts = currentFtpWatts * (1 + FTP_BREAKTHROUGH_THRESHOLD);
  if (scan.estimatedFtpWatts <= thresholdWatts) return null;

  const deltaWatts = scan.estimatedFtpWatts - currentFtpWatts;
  const deltaPercent =
    Math.round((deltaWatts / currentFtpWatts) * 1000) / 10;

  const message =
    scan.method === "eftp_20m" && scan.eftp20mWatts !== null
      ? `Du hast eine neue 20-Minuten-Bestleistung erbracht (${scan.bests.find((b) => b.durationSeconds === 1200)?.bestWatts} W → neue FTP ~${scan.estimatedFtpWatts} W). Trainingsbereiche jetzt aktualisieren?`
      : `Neues Modell-FTP (CP) von ~${scan.estimatedFtpWatts} W erkannt (bisher ${currentFtpWatts} W, +${deltaPercent} %). Trainingsbereiche jetzt aktualisieren?`;

  return {
    type: "ftp_breakthrough",
    activityId: scan.activityId,
    detectedAt: new Date().toISOString(),
    previousFtpWatts: currentFtpWatts,
    newFtpWatts: scan.estimatedFtpWatts,
    deltaWatts,
    deltaPercent,
    p20BestWatts:
      scan.bests.find((b) => b.durationSeconds === 1200)?.bestWatts ?? null,
    eftp20mWatts: scan.eftp20mWatts,
    cpEstimatedFtpWatts: scan.cpEstimatedFtpWatts,
    method: scan.method === "eftp_20m" ? "eftp_20m" : "morton_cp",
    message,
  };
}

export function mergeBenchmarkHistory(
  existing: PowerBenchmarkHistory | null,
  scan: BenchmarkScanResult,
  achievedAtIso: string
): PowerBenchmarkHistory {
  const nextRecords = [...(existing?.records ?? [])];

  for (const best of scan.bests) {
    const idx = nextRecords.findIndex(
      (r) => r.durationSeconds === best.durationSeconds
    );
    const record: PowerBenchmarkRecord = {
      ...best,
      activityId: scan.activityId,
      achievedAt: achievedAtIso,
    };
    if (idx >= 0) {
      if (best.bestWatts > nextRecords[idx].bestWatts) nextRecords[idx] = record;
    } else {
      nextRecords.push(record);
    }
  }

  nextRecords.sort((a, b) => a.durationSeconds - b.durationSeconds);

  return { records: nextRecords, updatedAt: achievedAtIso };
}

export function loadPowerBenchmarkHistory(): PowerBenchmarkHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BENCHMARK_HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PowerBenchmarkHistory;
    if (!Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePowerBenchmarkHistory(
  history: PowerBenchmarkHistory
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BENCHMARK_HISTORY_STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch {}
}

export function emitBenchmarkEvents(input: BenchmarkScanInput): {
  scan: BenchmarkScanResult;
  breakthrough: FtpBreakthroughEventPayload | null;
} {
  const scan = scanActivityBenchmarks(input);
  const nowIso = new Date().toISOString();

  savePowerBenchmarkHistory(
    mergeBenchmarkHistory(loadPowerBenchmarkHistory(), scan, nowIso)
  );

  const currentFtp =
    typeof input.currentFtpWattsOverride === "number" &&
    input.currentFtpWattsOverride > 0
      ? input.currentFtpWattsOverride
      : getFitnessProfile().ftpWatts;

  const breakthrough = detectFtpBreakthrough(scan, currentFtp);

  if (breakthrough && typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent<FtpBreakthroughEventPayload>(FTP_BREAKTHROUGH_EVENT, {
          detail: breakthrough,
        })
      );
    } catch {}
  }

  return { scan, breakthrough };
}

export function subscribeToFtpBreakthrough(
  callback: (payload: FtpBreakthroughEventPayload) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<FtpBreakthroughEventPayload>).detail;
    if (detail) callback(detail);
  };
  window.addEventListener(FTP_BREAKTHROUGH_EVENT, handler);
  return () => window.removeEventListener(FTP_BREAKTHROUGH_EVENT, handler);
}

export function recalculatePowerZonesForFtp(ftpWatts: number): PowerZone[] {
  return calculateCogganPowerZones(Math.round(ftpWatts));
}

export function applyFtpUpdate(newFtpWatts: number): FtpUpdateResult | null {
  if (!Number.isFinite(newFtpWatts) || newFtpWatts < 50 || newFtpWatts > 1000) {
    return null;
  }

  const profile = getFitnessProfile();
  const rounded = Math.round(newFtpWatts);
  const nextProfile: FitnessProfile = { ...profile, ftpWatts: rounded };
  saveFitnessProfile(nextProfile);

  const zones = recalculatePowerZonesForFtp(rounded);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        POWER_ZONES_STORAGE_KEY,
        JSON.stringify({ ftpWatts: rounded, zones })
      );
      window.dispatchEvent(
        new CustomEvent(FTP_UPDATE_APPLIED_EVENT, {
          detail: { ftpWatts: rounded, zones },
        })
      );
    } catch {}
  }

  return {
    profile: nextProfile,
    zones,
    previousFtpWatts: profile.ftpWatts,
  };
}

export function getStoredPowerZones(): {
  ftpWatts: number;
  zones: PowerZone[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POWER_ZONES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ftpWatts: number;
      zones: PowerZone[];
    };
    if (!parsed.zones?.length || !parsed.ftpWatts) return null;
    return parsed;
  } catch {
    return null;
  }
}
