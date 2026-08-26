// ─── Circadian Rhythm & Sleep Optimization Engine ────────────────────────────

import type {
  DailyNutritionLog,
  GarminActivity,
  GarminDailyHealth,
  LoggedSession,
} from "@/types";
import { getLocalDateString } from "@/lib/utils";

// ─── Konstanten ──────────────────────────────────────────────────────────────

/** Basaler Schlafbedarf in Minuten (8.0 h) */
export const SLEEP_BASELINE_MINUTES = 480;
/** Maximaler additiver Load-Modifier (15–45 Min bei hohem Trainingsstress) */
export const MAX_LOAD_MODIFIER_MINUTES = 45;
/** Wind-Down-Phase vor Lights-Out (Minuten) */
export const WIND_DOWN_MINUTES = 45;
/** Konflikt-Fenster vor Lights-Out (Minuten) */
export const CONFLICT_WINDOW_MINUTES = 180;
/** Gate-Halbfenster um die natürliche Bettgehzeit (Minuten) */
export const GATE_HALF_WINDOW_MINUTES = 30;

const FALLBACK_BEDTIME_MINUTES = 23 * 60; // 23:00
const FALLBACK_WAKE_MINUTES = 6 * 60 + 45; // 06:45
const MAX_GATE_SHIFT_MINUTES = 60;

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface BedtimeSample {
  date: string; // YYYY-MM-DD (Beginn der Nacht)
  bedtime?: string; // "HH:mm" lokal
  wakeTime?: string; // "HH:mm" lokal
}

export interface SleepGateResult {
  centerMinutes: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  medianWakeMinutes: number;
  consistencyPct: number;
  consistencyLevel: "hoch" | "mittel" | "niedrig";
  sampleCount: number;
  isFallback: boolean;
}

export type WorkoutIntensity = "low" | "moderate" | "high";

export interface ScheduledWorkout {
  id?: string;
  label: string;
  startTime: string; // "HH:mm"
  durationMin?: number;
  intensity?: WorkoutIntensity;
}

export interface CaffeineIntake {
  id?: string;
  label: string;
  time: string; // "HH:mm"
  mg?: number;
}

export interface SleepConflict {
  kind: "workout" | "caffeine";
  severity: "warnung" | "kritisch";
  label: string;
  detail: string;
  suggestion: string;
}

export interface CircadianReport {
  date: string;
  sleepNeedMinutes: number;
  sleepNeedLabel: string;
  loadModifierMinutes: number;
  loadReasons: string[];
  gate: SleepGateResult;
  targets: {
    windDownStart: string;
    lightsOut: string;
    wakeUp: string;
    achievableSleepLabel: string;
    meetsSleepNeed: boolean;
  };
  conflicts: SleepConflict[];
  tips: string[];
}

export interface CircadianOptimizerInput {
  date: string;
  garminHealthLogs?: Record<string, GarminDailyHealth>;
  dayTss?: number;
  highVolumeLegDay?: boolean;
  scheduledWorkouts?: ScheduledWorkout[];
  caffeineIntakes?: CaffeineIntake[];
}

// ─── Zeit-Helfer ─────────────────────────────────────────────────────────────

/** "HH:mm" → Minuten seit Mitternacht; null bei ungültigem Format. */
export function parseTimeToMinutes(time?: string): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minuten seit Mitternacht → "HH:mm". */
export function formatMinutesAsClock(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minuten → "8h 20min" (UI-Format wie im Rest der App). */
export function formatSleepDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

/**
 * Anker "Minuten seit 12:00 mittags": Bettgehzeiten kurz nach Mitternacht
 * (z. B. 00:30) bleiben so in der gleichen Skala wie 23:00 des Vorabends.
 */
function toEveningAnchor(minutes: number): number {
  return (((minutes - 720) % 1440) + 1440) % 1440;
}

function fromEveningAnchor(anchor: number): number {
  return (anchor + 720) % 1440;
}

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ─── Schlaf-Gate aus Garmin-Bettzeit-Konsistenz ──────────────────────────────

export function computeSleepGate(
  samples: BedtimeSample[],
  fallbackBedtime = FALLBACK_BEDTIME_MINUTES,
  fallbackWake = FALLBACK_WAKE_MINUTES
): SleepGateResult {
  const bedtimes = samples
    .map((s) => parseTimeToMinutes(s.bedtime))
    .filter((v): v is number => v !== null)
    .map(toEveningAnchor);

  const wakes = samples
    .map((s) => parseTimeToMinutes(s.wakeTime))
    .filter((v): v is number => v !== null)
    .map(toEveningAnchor);

  const centerAnchor = median(bedtimes) ?? toEveningAnchor(fallbackBedtime);
  const wakeAnchor = median(wakes) ?? toEveningAnchor(fallbackWake);
  const isFallback = bedtimes.length === 0 && wakes.length === 0;

  let mad: number | null = null;
  if (bedtimes.length > 0) {
    const deviations = bedtimes.map((b) => Math.abs(b - centerAnchor));
    mad = deviations.reduce((s, d) => s + d, 0) / deviations.length;
  }

  const consistencyPct =
    mad === null ? 0 : Math.max(0, Math.min(100, Math.round(100 - mad * 2)));
  const consistencyLevel: SleepGateResult["consistencyLevel"] =
    consistencyPct >= 75 ? "hoch" : consistencyPct >= 50 ? "mittel" : "niedrig";

  return {
    centerMinutes: roundTo5(fromEveningAnchor(centerAnchor)),
    windowStartMinutes: roundTo5(fromEveningAnchor(centerAnchor)) - GATE_HALF_WINDOW_MINUTES,
    windowEndMinutes: roundTo5(fromEveningAnchor(centerAnchor)) + GATE_HALF_WINDOW_MINUTES,
    medianWakeMinutes: roundTo5(fromEveningAnchor(wakeAnchor)),
    consistencyPct,
    consistencyLevel,
    sampleCount: bedtimes.length || wakes.length,
    isFallback,
  };
}

// ─── Schlafbedarf mit Load-Modifier (+15 bis +45 Min) ────────────────────────

export function calculateSleepNeedMinutes(input: {
  tss?: number;
  highVolumeLegDay?: boolean;
}): { totalMinutes: number; modifierMinutes: number } {
  const { tss, highVolumeLegDay } = input;
  let modifier = 0;

  if (typeof tss === "number" && tss > 150) {
    // 151 TSS → +15 Min … 300+ TSS → +45 Min, linear skaliert
    modifier += 15 + ((tss - 150) / 150) * 30;
  }

  if (highVolumeLegDay) {
    modifier += 20;
  }

  const finalModifier =
    modifier <= 0 ? 0 : Math.min(MAX_LOAD_MODIFIER_MINUTES, Math.max(15, roundTo5(modifier)));

  return {
    totalMinutes: SLEEP_BASELINE_MINUTES + finalModifier,
    modifierMinutes: finalModifier,
  };
}

// ─── Zielzeiten: Wind-Down · Lights-Out · Wake-Up ────────────────────────────

export function computeSleepTargets(
  gate: SleepGateResult,
  sleepNeedMinutes: number
): CircadianReport["targets"] & { lightsOutMinutes: number } {
  const centerAnchor = toEveningAnchor(gate.centerMinutes);
  const wakeAnchor = toEveningAnchor(gate.medianWakeMinutes);

  // Spätester Einschlafzeitpunkt, der den Schlafbedarf noch voll abdeckt
  const latestLightsOutAnchor = wakeAnchor - sleepNeedMinutes;
  // Am circadianen Gate orientieren, aber Bedarf hat Vorrang –
  // maximal MAX_GATE_SHIFT_MINUTES früher als das Gate.
  const floorAnchor = centerAnchor - MAX_GATE_SHIFT_MINUTES;
  const candidate = Math.min(centerAnchor, latestLightsOutAnchor);
  const lightsOutAnchor = Math.max(floorAnchor, candidate);

  const lightsOutMinutes = roundTo5(fromEveningAnchor(lightsOutAnchor));
  const wakeMinutes = roundTo5(gate.medianWakeMinutes);
  const windDownMinutes = lightsOutMinutes - WIND_DOWN_MINUTES;
  const achievable = ((wakeMinutes - lightsOutMinutes) % 1440 + 1440) % 1440;

  return {
    windDownStart: formatMinutesAsClock(windDownMinutes),
    lightsOut: formatMinutesAsClock(lightsOutMinutes),
    wakeUp: formatMinutesAsClock(wakeMinutes),
    achievableSleepLabel: formatSleepDuration(achievable),
    meetsSleepNeed: achievable + 4 >= sleepNeedMinutes,
    lightsOutMinutes,
  };
}

// ─── Konflikterkennung (Workouts & Koffein) ──────────────────────────────────

export function detectScheduleConflicts(input: {
  lightsOutMinutes: number;
  workouts?: ScheduledWorkout[];
  caffeineIntakes?: CaffeineIntake[];
}): SleepConflict[] {
  const { lightsOutMinutes, workouts = [], caffeineIntakes = [] } = input;
  const windowStart = lightsOutMinutes - CONFLICT_WINDOW_MINUTES;
  const cutoff = formatMinutesAsClock(windowStart);
  const conflicts: SleepConflict[] = [];

  for (const w of workouts) {
    const intensity = w.intensity ?? classifyWorkoutIntensity(w.label);
    if (intensity !== "high") continue;
    const start = parseTimeToMinutes(w.startTime);
    if (start === null) continue;
    const end = start + Math.max(15, w.durationMin ?? 60);
    if (end <= windowStart || start >= lightsOutMinutes) continue;

    const gap = lightsOutMinutes - end;
    const severity: SleepConflict["severity"] = gap < 90 ? "kritisch" : "warnung";
    conflicts.push({
      kind: "workout",
      severity,
      label: w.label,
      detail: `Endet ${formatMinutesAsClock(end)} – nur ${gap} Min vor Lights-Out (${formatMinutesAsClock(lightsOutMinutes)}).`,
      suggestion: `Hohe Intensität erhöht Kerntemperatur & HRV-Latenz: verlege die Einheit auf vor ${cutoff} oder tausche gegen eine lockere Einheit.`,
    });
  }

  for (const c of caffeineIntakes) {
    const t = parseTimeToMinutes(c.time);
    if (t === null) continue;
    if (t < windowStart || t >= lightsOutMinutes) continue;
    const gap = lightsOutMinutes - t;
    const severity: SleepConflict["severity"] =
      (c.mg ?? 75) >= 100 && gap < 90 ? "kritisch" : "warnung";
    conflicts.push({
      kind: "caffeine",
      severity,
      label: c.label,
      detail: `${c.mg ? `${c.mg} mg Koffein` : "Koffeinaufnahme"} um ${c.time} – ${gap} Min vor Lights-Out.`,
      suggestion: `Halbiere die Eliminationszeit: letzte Aufnahme idealerweise bis ${cutoff} (3 Std vor Lights-Out).`,
    });
  }

  return conflicts.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "kritisch" ? -1 : 1
  );
}

const HIGH_INTENSITY_PATTERN =
  /intervall|interval|vo2|sprint|hill|hiit|heavy|schwer|maximal|1rm|tempo/i;

/** Grobe Intensitätsklassifikation anhand Name/Typ (Intervalle & Heavy Gym = hoch). */
export function classifyWorkoutIntensity(label: string): WorkoutIntensity {
  if (HIGH_INTENSITY_PATTERN.test(label)) return "high";
  if (/lockere?|easy|regenerat|rollen|mobil/i.test(label)) return "low";
  return "moderate";
}

// ─── Datenextraktion aus dem App-State ───────────────────────────────────────

/** Bettzeit-Stichproben aus den Garmin-Tageswerten (max. 14 Nächte). */
export function extractBedtimeSamples(
  logs: Record<string, GarminDailyHealth> = {}
): BedtimeSample[] {
  return Object.values(logs)
    .filter((h) => h.bedtimeLocal || h.waketimeLocal)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 14)
    .map((h) => ({
      date: h.date,
      bedtime: h.bedtimeLocal,
      wakeTime: h.waketimeLocal,
    }));
}

const ESTIMATED_TSS_PER_HOUR: Record<GarminActivity["type"], number> = {
  cycling: 50,
  running: 70,
  gym: 35,
  other: 40,
};

/** Tages-TSS aus Garmin-Aktivitäten (echter TSS oder Dauer-Schätzung). */
export function estimateDailyTss(activities: GarminActivity[] = [], date: string): number {
  return activities
    .filter((a) => getLocalDateString(new Date(a.startTime)) === date)
    .reduce((sum, a) => {
      if (typeof a.tss === "number") return sum + a.tss;
      const hours = a.durationSeconds / 3600;
      return sum + hours * ESTIMATED_TSS_PER_HOUR[a.type];
    }, 0);
}

const LEG_EXERCISE_PATTERN =
  /kniebeuge|squat|beinpresse|leg press|ausfallschritt|lunge|bulgarian|kreuzheben|rdl|rumänisch|hip thrust|beinbeuger|leg curl|beinstrecker|leg extension|wadenheben|calf|step-?up|hackenschmidt|good morning|glute|beinheben/i;
const HIGH_VOLUME_LEG_SETS_THRESHOLD = 12;

/** High-Volume-Beintag: ≥ 12 Sätze beinlastiger Übungen an einem Tag. */
export function detectHighVolumeLegDay(
  sessions: LoggedSession[] = [],
  date: string
): boolean {
  let legSets = 0;
  for (const s of sessions) {
    if (s.kind !== "gym" || s.date !== date) continue;
    for (const entry of s.entries) {
      if (!LEG_EXERCISE_PATTERN.test(entry.exercise)) continue;
      legSets += entry.sets.length;
    }
  }
  return legSets >= HIGH_VOLUME_LEG_SETS_THRESHOLD;
}

const CAFFEINE_RULES: Array<{
  pattern: RegExp;
  mgPer100?: number;
  fixedMg?: number;
  defaultMg?: number;
}> = [
  { pattern: /espresso/i, fixedMg: 65 },
  { pattern: /kaffee|coffee|latte|cappuccino/i, mgPer100: 40, defaultMg: 80 },
  { pattern: /energy/i, mgPer100: 32, defaultMg: 80 },
  { pattern: /cola/i, mgPer100: 10, defaultMg: 25 },
  { pattern: /mate/i, mgPer100: 20, defaultMg: 100 },
  { pattern: /(grünen?|green|schwarzen?|black)\s*tee/i, fixedMg: 30 },
  { pattern: /pre\s?-?workout|booster/i, fixedMg: 200 },
];

/** Koffein-Aufnahmen aus dem Ernährungslog (Namen-Heuristik + loggedAt-Zeit). */
export function extractCaffeineIntakes(log?: DailyNutritionLog): CaffeineIntake[] {
  if (!log) return [];
  const intakes: CaffeineIntake[] = [];
  for (const e of log.entries) {
    if (!e.loggedAt) continue;
    const name = e.food.name;
    const rule = CAFFEINE_RULES.find((r) => r.pattern.test(name));
    if (!rule) continue;
    let mg = rule.fixedMg ?? rule.defaultMg ?? 50;
    if (rule.mgPer100 && e.amount > 0) mg = (e.amount / 100) * rule.mgPer100;
    intakes.push({ id: e.id, label: name, time: e.loggedAt, mg: Math.round(mg) });
  }
  return intakes;
}

// ─── Haupt-API: vollständiger Tagesreport ────────────────────────────────────

export function buildCircadianPlan(input: CircadianOptimizerInput): CircadianReport {
  const { date, garminHealthLogs = {}, dayTss, highVolumeLegDay } = input;

  const samples = extractBedtimeSamples(garminHealthLogs);
  const gate = computeSleepGate(samples);

  const effectiveTss = typeof dayTss === "number" ? dayTss : undefined;
  const need = calculateSleepNeedMinutes({ tss: effectiveTss, highVolumeLegDay });
  const targets = computeSleepTargets(gate, need.totalMinutes);

  const conflicts = detectScheduleConflicts({
    lightsOutMinutes: targets.lightsOutMinutes,
    workouts: input.scheduledWorkouts,
    caffeineIntakes: input.caffeineIntakes,
  });

  const loadReasons: string[] = [];
  if (need.modifierMinutes > 0) {
    if (effectiveTss !== undefined && effectiveTss > 150) {
      loadReasons.push(`Trainingsstress ${Math.round(effectiveTss)} TSS`);
    }
    if (highVolumeLegDay) loadReasons.push("High-Volume-Beintag");
  }

  const tips: string[] = [];
  if (gate.isFallback) {
    tips.push("Keine Garmin-Bettzeitdaten – Fallback-Rhythmus 23:00/06:45 aktiv. Garmin-Sync personalisiert das Schlaf-Gate.");
  } else if (gate.consistencyLevel === "niedrig") {
    tips.push(`Bettzeiten streuen stark (Konsistenz ${gate.consistencyPct}%). Halte Lights-Out ±30 Min konstant – der stärkste Hebel für deinen circadianen Rhythmus.`);
  }
  if (loadReasons.length > 0) {
    tips.push(`+${need.modifierMinutes} Min Schlafbedarf wegen ${loadReasons.join(" & ")} – zieh den Wind-Down entsprechend vor.`);
  }
  if (!targets.meetsSleepNeed) {
    tips.push("Schlafbedarf ist im aktuellen Zeitfenster nicht erreichbar: verlege intensive Einheiten nach vorne oder nutze einen Power-Nap (≤ 25 Min) am Nachmittag.");
  }
  const yesterdayKey = previousDateKey(date);
  const yesterday = garminHealthLogs[yesterdayKey];
  if (yesterday && yesterday.sleepDurationHours < need.totalMinutes / 60 - 0.5) {
    tips.push(`Schlafdefizit gestern (${yesterday.sleepDurationHours}h vs. ${formatSleepDuration(need.totalMinutes)} Ziel) – heute früh ins Bett zum Auffüllen.`);
  }
  if (tips.length === 0) {
    tips.push("Rhythmus und Regenerationsfenster sind sauber eingestellt – halte den Zeitpunkt deines Lichts-aus-Moments konstant.");
  }

  return {
    date,
    sleepNeedMinutes: need.totalMinutes,
    sleepNeedLabel: formatSleepDuration(need.totalMinutes),
    loadModifierMinutes: need.modifierMinutes,
    loadReasons,
    gate,
    targets: {
      windDownStart: targets.windDownStart,
      lightsOut: targets.lightsOut,
      wakeUp: targets.wakeUp,
      achievableSleepLabel: targets.achievableSleepLabel,
      meetsSleepNeed: targets.meetsSleepNeed,
    },
    conflicts,
    tips,
  };
}

function previousDateKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return getLocalDateString(dt);
}
