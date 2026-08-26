// ─── Deload & Functional Overreaching Detection Engine ───────────────────────
// Aggregiert 14-Tage-Trends (Kraft-Divergenz RPE vs. e1RM, Intervall-Power-
// Compliance, rollierende HRV/RHR-Abweichung, subjektive Check-ins) und flaggt
// "Deload empfohlen", sobald ≥2 Ermüdungsmarker länger als 5 Tage in Folge
// aktiv sind. Erzeugt zusätzlich fertige Deload-Vorlagen (−40 % Sätze,
// RPE-Cap 6–7, Rad-Intervalle → Z1/Z2 aktive Erholung).
//
// Pure Logik ohne React/Storage-Abhängigkeiten – siehe deload-detector.test.ts.

import type {
  DailyCheckIn,
  DayPlan,
  EnduranceTemplate,
  GarminDailyHealth,
  GymSession,
  GymTemplate,
  LoggedSession,
} from "@/types";
import { epley1RM } from "@/lib/training/pr";
import { getLocalDateString } from "@/lib/utils";

// ─── Schwellwerte (zentral, damit Tests & UI dieselben Konstanten nutzen) ────

export const DELOAD_THRESHOLDS = {
  /** Fenster der Trend-Analyse in Tagen */
  windowDays: 14,
  /** Mindestanzahl persistenter Marker für "Deload empfohlen" */
  minMarkersForDeload: 2,
  /** Marker muss strikt MEHR als so viele Tage in Folge aktiv sein */
  minConsecutiveDays: 5,
  /** Kraft: Ø-RPE der letzten 7 Tage ab dieser Stufe gilt als "hohe Anstrengung" */
  rpeDivergenceRpe: 8,
  /** Kraft: e1RM-Wachstum bis zu diesem Anteil gilt als stagnierend (+0,5 %) */
  e1rmStagnationPct: 0.005,
  /** Rad: Compliance (% Ziel-Watt erreicht), darunter = Leistungsabfall */
  intervalCompliancePct: 90,
  /** Rollierende 7-Tage-HRV darf Basis nicht um mehr als diesen Anteil fallen */
  hrvDropPctFromBaseline: 0.15,
  /** RHR-Abweichung vom Basis-Median in bpm, ab der Ermüdung vorliegt */
  rhrDeviationBpm: 5,
  /** Subjektiver Muskelkater ab dieser Stufe (0–10) gilt als Marker */
  sorenessLevel: 7,
  /** Subjektive Energie bis zu dieser Stufe (0–10) gilt als erschöpft */
  energyLevelLow: 4,
} as const;

export type FatigueMarkerId =
  | "strength_rpe_divergence"
  | "power_compliance"
  | "hrv_suppression"
  | "rhr_elevation"
  | "checkin_fatigue";

export type DeloadStatus =
  | "fresh"
  | "watch"
  | "deload_recommended"
  | "non_functional_overreaching";

/** Ein geloggter Intervall-Abschnitt mit Soll-/Ist-Leistung (Threshold/VO2max). */
export interface IntervalPowerLog {
  date: string; // YYYY-MM-DD
  kind: "threshold" | "vo2max";
  targetWatts: number;
  achievedAvgWatts: number;
}

export interface DeloadDetectorInput {
  sessions: LoggedSession[];
  garminHealthLogs: Record<string, GarminDailyHealth>;
  checkIns?: DailyCheckIn[];
  /** Strukturierte Soll/Ist-Watt-Werte aus Threshold/VO2max-Sätzen */
  intervalLogs?: IntervalPowerLog[];
  today?: Date;
}

export interface FatigueMarkerReport {
  id: FatigueMarkerId;
  label: string;
  detail: string; // menschenlesbare Zusammenfassung inkl. Zahlen
  longestStreakDays: number;
  persistent: boolean; // streak > DELOAD_THRESHOLDS.minConsecutiveDays
  currentlyActive: boolean;
}

export interface DeloadDetectionResult {
  status: DeloadStatus;
  deloadRecommended: boolean;
  /** Performance-Kennzahlen sinken, autonome Kontrolle (HRV/RHR) stabil → klassisches FOR */
  functionalOverreachingLikely: boolean;
  markers: FatigueMarkerReport[];
  persistentCount: number;
  headline: string;
  explanation: string;
  windowDays: number;
}

const MARKER_META: Record<FatigueMarkerId, { label: string }> = {
  strength_rpe_divergence: { label: "RPE steigt bei stagnierendem e1RM" },
  power_compliance: { label: "Intervall-Power unter Zielwert" },
  hrv_suppression: { label: "HRV supprimiert" },
  rhr_elevation: { label: "Ruheruhepuls erhöht" },
  checkin_fatigue: { label: "Hohe subjektive Belastung (Muskelkater/Erschöpfung)" },
};

// ─── Datums- & Mathematik-Helfer ─────────────────────────────────────────────

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dayDiff(a: string, b: string): number {
  // Beide Keys sind "YYYY-MM-DD" lokal → Differenz über Mitternachts-Parsing.
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Längste Serie aufeinanderfolgender `true`-Werte. */
export function longestTrueStreak(flags: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const f of flags) {
    if (f) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Trainings-abgeleitete Marker werden nur an Trainingstagen gemessen.
 * Nicht gemessene Tage erben den letzten Messzustand ("fatigue trägt durch
 * ruhigere Tage"), bis eine neue Messung den Zustand aktualisiert.
 */
function forwardFill(flags: boolean[], measured: boolean[]): boolean[] {
  let carry = false;
  return flags.map((_, i) => {
    if (measured[i]) carry = flags[i];
    return measured[i] ? flags[i] : carry;
  });
}

// ─── 1. Kraft-Signal: Ø-RPE vs. projizierter e1RM in Hauptübungen ────────────

export type MainLiftCategory = "squat" | "bench" | "deadlift";

const MAIN_LIFT_MATCHERS: Array<{ lift: MainLiftCategory; patterns: string[] }> = [
  { lift: "squat", patterns: ["kniebeug", "squat"] },
  { lift: "bench", patterns: ["bankdrück", "bankdrueck", "bench"] },
  { lift: "deadlift", patterns: ["kreuzheb", "deadlift", "crosslift"] },
];

export function matchMainLift(exerciseName: string): MainLiftCategory | null {
  const n = exerciseName.trim().toLowerCase();
  for (const { lift, patterns } of MAIN_LIFT_MATCHERS) {
    if (patterns.some((p) => n.includes(p))) return lift;
  }
  return null;
}

interface StrengthDayPoint {
  date: string;
  avgRpe: number;
  e1rmByLift: Partial<Record<MainLiftCategory, number>>;
}

function aggregateStrengthByDay(
  sessions: LoggedSession[],
  dates: string[]
): Map<string, StrengthDayPoint> {
  const byDate = new Map<string, StrengthDayPoint>();

  for (const s of sessions) {
    if (s.kind !== "gym") continue;
    const gym = s as GymSession;
    const dateKey = gym.date.slice(0, 10);
    if (!dates.includes(dateKey)) continue;

    const sessionRpe = typeof gym.rpe === "number" ? gym.rpe : null;
    const rpes: number[] = [];
    const e1rmByLift: Partial<Record<MainLiftCategory, number>> = {};

    for (const entry of gym.entries) {
      const lift = matchMainLift(entry.exercise);
      if (!lift) continue;
      for (const set of entry.sets) {
        if (!set.isCompleted) continue;
        const w = Number(set.weight);
        const r = Number(set.reps);
        if (!w || !r) continue;
        const setRpe = typeof set.rpe === "number" && set.rpe > 0 ? set.rpe : sessionRpe;
        if (setRpe !== null) rpes.push(setRpe);
        const est = epley1RM(w, r);
        const prev = e1rmByLift[lift];
        if (prev === undefined || est > prev) e1rmByLift[lift] = est;
      }
    }

    if (rpes.length === 0 && Object.keys(e1rmByLift).length === 0) continue;

    const existing = byDate.get(dateKey);
    const avgRpe = mean(rpes);
    if (!existing) {
      byDate.set(dateKey, {
        date: dateKey,
        avgRpe: avgRpe ?? 0,
        e1rmByLift,
      });
    } else {
      if (avgRpe !== null) {
        existing.avgRpe = existing.avgRpe > 0 ? (existing.avgRpe + avgRpe) / 2 : avgRpe;
      }
      for (const [lift, val] of Object.entries(e1rmByLift)) {
        const k = lift as MainLiftCategory;
        const prev = existing.e1rmByLift[k];
        if (prev === undefined || (val ?? 0) > prev) existing.e1rmByLift[k] = val;
      }
    }
  }

  return byDate;
}

/**
 * Divergenz-Prüfung pro Tag: steigt die Durchschnitts-RPE der letzten 7 Tage
 * (≥ Schwelle UND über Vorwoche), während der beste e1RM je Hauptübung
 * stagniert/fällt → Marker aktiv.
 */
function evaluateStrengthDivergence(
  points: Map<string, StrengthDayPoint>,
  dates: string[]
): { flags: boolean[]; measured: boolean[]; detail: string } {
  const flags: boolean[] = [];
  const measured: boolean[] = [];
  let lastDetail =
    "Noch keine ausreichenden Kraftdaten in den letzten 14 Tagen.";

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const recentDates = dates.filter((x) => {
      const diff = dayDiff(x, d);
      return diff >= 0 && diff <= 6;
    });
    const baseDates = dates.filter((x) => {
      const diff = dayDiff(x, d);
      return diff >= 7 && diff <= 13;
    });
    const recent = recentDates
      .map((x) => points.get(x))
      .filter((p): p is StrengthDayPoint => !!p);
    const base = baseDates
      .map((x) => points.get(x))
      .filter((p): p is StrengthDayPoint => !!p);

    const hasDataToday = points.has(d);
    let active = false;

    if (recent.length > 0 && base.length > 0 && recent.length + base.length >= 3) {
      const rpeRecent = mean(recent.map((p) => p.avgRpe));
      const rpeBase = mean(base.map((p) => p.avgRpe));
      // Vergleichbare Übungsgruppen: Lifts, die in BEIDEN Hälften gemessen wurden.
      const comparable = (
        ["squat", "bench", "deadlift"] as MainLiftCategory[]
      ).filter(
        (l) =>
          recent.some((p) => p.e1rmByLift[l] !== undefined) &&
          base.some((p) => p.e1rmByLift[l] !== undefined)
      );
      const ratios = comparable
        .map((l) => {
          const b = Math.max(...base.map((p) => p.e1rmByLift[l] ?? 0));
          const r = Math.max(...recent.map((p) => p.e1rmByLift[l] ?? 0));
          return b > 0 ? r / b : null;
        })
        .filter((v): v is number => v !== null);

      if (rpeRecent !== null && rpeBase !== null && ratios.length > 0) {
        const avgRatio = mean(ratios) ?? 1;
        active =
          rpeRecent >= DELOAD_THRESHOLDS.rpeDivergenceRpe &&
          rpeRecent > rpeBase &&
          avgRatio <= 1 + DELOAD_THRESHOLDS.e1rmStagnationPct;
        lastDetail = `Ø-RPE letzte 7 T.: ${round1(rpeRecent)} (Vorwoche ${round1(
          rpeBase
        )}) · e1RM-Trend: ${avgRatio >= 1 ? "+" : ""}${Math.round((avgRatio - 1) * 1000) / 10}%`;
      }
    }

    measured.push(hasDataToday);
    flags.push(active);
  }

  return { flags, measured, detail: lastDetail };
}

// ─── 2. Rad-Signal: %-Ziel-Watt-Compliance in Threshold/VO2max-Sätzen ────────

function evaluateIntervalCompliance(
  logs: IntervalPowerLog[],
  dates: string[]
): { flags: boolean[]; measured: boolean[]; detail: string } {
  const flags: boolean[] = [];
  const measured: boolean[] = [];
  let lastDetail = "Keine Intervall-Einheiten mit Watt-Zielen geloggt.";

  for (const d of dates) {
    const todays = logs.filter((l) => l.date === d && l.targetWatts > 0);
    if (todays.length > 0) {
      const compliance =
        (todays.reduce(
          (s, l) => s + Math.min(1.5, l.achievedAvgWatts / l.targetWatts),
          0
        ) /
          todays.length) *
        100;
      lastDetail = `Letzte Intervall-Einheit: ${Math.round(compliance)} % der Ziel-Watt erreicht (${todays.length} Satz/abschnitt).`;
      flags.push(compliance < DELOAD_THRESHOLDS.intervalCompliancePct);
      measured.push(true);
    } else {
      flags.push(false);
      measured.push(false);
    }
  }

  return { flags, measured, detail: lastDetail };
}

// ─── 3./4. Autonome Signale: rollierende 7-Tage-HRV & RHR-Abweichung ────────

const BAD_HRV_STATUSES = new Set(["unbalanced", "low", "poor"]);

function rollingMeanLast(
  entries: { date: string; value: number }[],
  endDate: string,
  days: number,
  minSamples: number
): number | null {
  const values = entries
    .filter((e) => {
      const diff = dayDiff(e.date, endDate);
      return diff >= 0 && diff < days;
    })
    .map((e) => e.value);
  if (values.length < minSamples) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function baselineMedianBeforeWindow(
  series: { date: string; value: number }[],
  windowStart: string
): number | null {
  const before = series.filter((e) => e.date < windowStart).map((e) => e.value);
  return median(before);
}

function evaluateAutonomic(
  garminHealthLogs: Record<string, GarminDailyHealth>,
  dates: string[],
  windowStart: string
): {
  hrvFlags: boolean[];
  rhrFlags: boolean[];
  hrvDetail: string;
  rhrDetail: string;
} {
  const hrvSeries = Object.values(garminHealthLogs)
    .filter((h) => typeof h.hrvLastNightMs === "number")
    .map((h) => ({ date: h.date.slice(0, 10), value: h.hrvLastNightMs as number }));
  const rhrSeries = Object.values(garminHealthLogs)
    .filter((h) => typeof h.restingHeartRate === "number" && h.restingHeartRate > 0)
    .map((h) => ({ date: h.date.slice(0, 10), value: h.restingHeartRate as number }));

  const hrvBaseline = baselineMedianBeforeWindow(hrvSeries, windowStart);
  const rhrBaseline = baselineMedianBeforeWindow(rhrSeries, windowStart);

  const hrvFlags: boolean[] = [];
  const rhrFlags: boolean[] = [];
  let hrvDetail = "HRV-Basis noch unbekannt – trage die Uhr nachts regelmäßig.";
  let rhrDetail = "RHR-Basis noch unbekannt – zu wenig Historie.";

  for (const d of dates) {
    const health = garminHealthLogs[d];
    const rollingHrv = rollingMeanLast(hrvSeries, d, 7, 4);

    let hrvBad = false;
    if (health && BAD_HRV_STATUSES.has(health.hrvStatus)) {
      hrvBad = true;
      hrvDetail = `HRV-Status laut Garmin belastet (${health.hrvStatus}).`;
    } else if (rollingHrv !== null && hrvBaseline !== null && hrvBaseline > 0) {
      hrvBad = rollingHrv <= hrvBaseline * (1 - DELOAD_THRESHOLDS.hrvDropPctFromBaseline);
      hrvDetail = `Rollierende 7-Tage-HRV: ${Math.round(rollingHrv)} ms (Basis ${Math.round(
        hrvBaseline
      )} ms, Limit −${DELOAD_THRESHOLDS.hrvDropPctFromBaseline * 100} %).`;
    }
    hrvFlags.push(hrvBad);

    const rollingRhr = rollingMeanLast(rhrSeries, d, 7, 4);
    let rhrBad = false;
    if (rollingRhr !== null && rhrBaseline !== null) {
      const deviation = rollingRhr - rhrBaseline;
      rhrBad = deviation >= DELOAD_THRESHOLDS.rhrDeviationBpm;
      rhrDetail = `Rollierender 7-Tage-RHR: ${round1(rollingRhr)} bpm (Basis ${round1(
        rhrBaseline
      )} bpm, Abweichung ${deviation >= 0 ? "+" : ""}${round1(deviation)} bpm).`;
    }
    rhrFlags.push(rhrBad);
  }

  return { hrvFlags, rhrFlags, hrvDetail, rhrDetail };
}

// ─── 5. Subjektive Check-ins: Muskelkater & Energie (ein Marker) ────────────

function evaluateCheckIns(
  checkIns: DailyCheckIn[],
  dates: string[]
): { flags: boolean[]; detail: string } {
  const byDate = new Map(checkIns.map((c) => [c.date.slice(0, 10), c]));
  const flags: boolean[] = [];
  let detail = "Noch keine Check-ins erfasst.";

  for (const d of dates) {
    const c = byDate.get(d);
    if (c) {
      const sore = Number(c.soreness) || 0;
      const energy = Number(c.energy) || 0;
      flags.push(
        sore >= DELOAD_THRESHOLDS.sorenessLevel || energy <= DELOAD_THRESHOLDS.energyLevelLow
      );
      detail = `Letzter Check-in: Muskelkater ${sore}/10 (Schwelle ≥ ${DELOAD_THRESHOLDS.sorenessLevel}) · Energie ${energy}/10 (erschöpft ≤ ${DELOAD_THRESHOLDS.energyLevelLow}).`;
    } else {
      flags.push(false);
    }
  }

  return { flags, detail };
}

// ─── Detektion ───────────────────────────────────────────────────────────────

export function detectDeloadNeed(input: DeloadDetectorInput): DeloadDetectionResult {
  const today = input.today ?? new Date();
  const dates: string[] = [];
  for (let i = DELOAD_THRESHOLDS.windowDays - 1; i >= 0; i--) {
    dates.push(getLocalDateString(shiftDays(today, -i)));
  }
  const windowStart = dates[0];

  // Signal-Aggregation
  const strengthPoints = aggregateStrengthByDay(input.sessions, dates);
  const strengthEval = evaluateStrengthDivergence(strengthPoints, dates);
  const strengthFinal = forwardFill(strengthEval.flags, strengthEval.measured);

  const intervalEval = evaluateIntervalCompliance(input.intervalLogs ?? [], dates);
  const intervalFinal = forwardFill(intervalEval.flags, intervalEval.measured);

  const autonomic = evaluateAutonomic(input.garminHealthLogs, dates, windowStart);
  const checkInEval = evaluateCheckIns(input.checkIns ?? [], dates);

  const rawMarkers: Array<{
    id: FatigueMarkerId;
    flags: boolean[];
    detail: string;
  }> = [
    { id: "strength_rpe_divergence", flags: strengthFinal, detail: strengthEval.detail },
    { id: "power_compliance", flags: intervalFinal, detail: intervalEval.detail },
    { id: "hrv_suppression", flags: autonomic.hrvFlags, detail: autonomic.hrvDetail },
    { id: "rhr_elevation", flags: autonomic.rhrFlags, detail: autonomic.rhrDetail },
    { id: "checkin_fatigue", flags: checkInEval.flags, detail: checkInEval.detail },
  ];

  const markers: FatigueMarkerReport[] = rawMarkers.map(({ id, flags, detail }) => ({
    id,
    label: MARKER_META[id].label,
    detail,
    longestStreakDays: longestTrueStreak(flags),
    persistent:
      longestTrueStreak(flags) > DELOAD_THRESHOLDS.minConsecutiveDays &&
      flags[flags.length - 1] === true,
    currentlyActive: flags[flags.length - 1] === true,
  }));

  const persistentMarkers = markers.filter((m) => m.persistent);
  const persistentCount = persistentMarkers.length;

  const AUTONOMIC_IDS = new Set<FatigueMarkerId>(["hrv_suppression", "rhr_elevation"]);
  const PERFORMANCE_IDS = new Set<FatigueMarkerId>(["strength_rpe_divergence", "power_compliance"]);
  const autonomicPersistent = persistentMarkers.filter((m) => AUTONOMIC_IDS.has(m.id)).length;
  const performancePersistent = persistentMarkers.filter((m) => PERFORMANCE_IDS.has(m.id)).length;

  const deloadRecommended = persistentCount >= DELOAD_THRESHOLDS.minMarkersForDeload;
  const nonFunctionalOverreaching =
    deloadRecommended && persistentCount >= 3 && autonomicPersistent >= 1;
  const status: DeloadStatus = nonFunctionalOverreaching
    ? "non_functional_overreaching"
    : deloadRecommended
    ? "deload_recommended"
    : persistentCount === 1
    ? "watch"
    : "fresh";

  const functionalOverreachingLikely =
    performancePersistent >= 1 && autonomicPersistent === 0 && !nonFunctionalOverreaching;

  const headline =
    status === "non_functional_overreaching"
      ? "Nicht-funktionelle Überreichung – Deload zwingend"
      : status === "deload_recommended"
      ? "Deload empfohlen"
      : status === "watch"
      ? "Frühwarnung – Beobachtungsmodus"
      : "Alles im grünen Bereich";

  const explanation = deloadRecommended
    ? `${persistentCount} Ermüdungsmarker halten seit mehr als ${DELOAD_THRESHOLDS.minConsecutiveDays} Tagen an: ${persistentMarkers
        .map((m) => m.label)
        .join(", ")}. ${
        nonFunctionalOverreaching
          ? "Zusätzlich ist dein autonomes Nervensystem (HRV/RHR) supprimiert – das spricht gegen eine funktionelle Überreichung. Reduziere Umfang und Intensität jetzt für 5–7 Tage."
          : "Ein strukturierter Deload (−40 % Volumen, RPE ≤ 7, Rad-Intervalle durch Z1/Z2 ersetzt) stellt deine Leistungsfähigkeit wieder her."
      }`
    : status === "watch"
    ? `${persistentMarkers[0].label} hält bereits mehrere Tage an. Passe Schlaf und Ernährung an und beobachte die Entwicklung – bei einem zweiten persistenten Marker folgt die Deload-Empfehlung.`
    : "Keine persistenten Ermüdungsmarker im 14-Tage-Fenster. Der aktuelle Belastungsplan ist verträglich.";

  return {
    status,
    deloadRecommended,
    functionalOverreachingLikely,
    markers,
    persistentCount,
    headline,
    explanation,
    windowDays: DELOAD_THRESHOLDS.windowDays,
  };
}

// ─── Auto-Adjustment Generator: Deload-Vorlagen ──────────────────────────────

export const DELOAD_SET_REDUCTION = 0.4; // −40 % Gesamtsätze
export const DELOAD_RPE_CAP_TOP = 7; // Topsatz
export const DELOAD_RPE_CAP_BACKOFF = 6; // Rückfallsätze
export const DELOAD_TEMPLATE_SUFFIX = "-deload";

export const INTERVAL_KEYWORDS = [
  "intervall",
  "schwelle",
  "vo2",
  "4x4",
  "tempo",
  "sprint",
  "threshold",
];

/** Reduziert Working Sets um 40 % (mind. 1 Satz) und kappt die RPE bei 6–7. */
export function generateDeloadGymTemplate(t: GymTemplate): GymTemplate {
  return {
    ...t,
    id: `${t.id}${DELOAD_TEMPLATE_SUFFIX}`,
    name: `${t.name} – Deload`,
    exercises: t.exercises.map((ex) => {
      let isFirstWorkingSet = true;
      const sets = ex.sets.map((s) => {
        if (s.type !== "working") return { ...s };
        const cap = isFirstWorkingSet ? DELOAD_RPE_CAP_TOP : DELOAD_RPE_CAP_BACKOFF;
        isFirstWorkingSet = false;
        return {
          ...s,
          targetRpe: cap,
          targetRir: 10 - cap,
        };
      });
      const workingCount = sets.filter((s) => s.type === "working").length;
      const keptWorking = Math.max(1, Math.round(workingCount * (1 - DELOAD_SET_REDUCTION)));
      // Rückfallsätze am ENDE streichen – Topsatz und erste Sätze bleiben erhalten.
      let workingSeen = 0;
      const reducedSets = sets.filter((s) => {
        if (s.type !== "working") return true;
        workingSeen += 1;
        return workingSeen <= keptWorking;
      });
      return { ...ex, sets: reducedSets };
    }),
  };
}

/** Verschiebt Rad-/Lauf-Intervalle in aktive Erholung (Zone 1/2). */
export function generateDeloadEnduranceTemplate(t: EnduranceTemplate): EnduranceTemplate {
  const durationMin = parseInt(t.estimatedDuration ?? "", 10);
  const capped = Math.max(30, Math.min(Number.isNaN(durationMin) ? 45 : durationMin, 60));

  if (t.type === "running") {
    return {
      ...t,
      id: `${t.id}${DELOAD_TEMPLATE_SUFFIX}`,
      name: `${t.name.replace(/ – Deload$/, "")} – Aktive Erholung`,
      description: `Deload: ${capped} Min sehr lockerer Dauerlauf in Zone 1–2 (< 70 % HFmax). Keine Tempi- oder Intervallabschnitte – Fokus auf Durchblutung und Regeneration.`,
      estimatedDuration: `${capped} Min`,
    };
  }

  return {
    ...t,
    id: `${t.id}${DELOAD_TEMPLATE_SUFFIX}`,
    name: `${t.name.replace(/ – Deload$/, "")} – Aktive Erholung (Z1/Z2)`,
    description: `Deload: ${capped} Min lockeres Ausrollen in Zone 1–2 (≤ 55–65 % FTP, HF locker). Alle Intervall- und Schwellenabschnitte entfallen – aktive Erholung statt Belastung.`,
    estimatedDuration: `${capped} Min`,
  };
}

export interface DeloadWeekPackage {
  plan: DayPlan[];
  /** Neu erzeugte Zwillingsvorlagen, die vom Aufrufer gespeichert werden müssen. */
  templatesToSave: GymTemplate[];
}

/**
 * Wandelt den Wochenplan idempotent in eine Deload-Woche um:
 * - alle Tage: isDeload = true
 * - Gym-Tage: Verknüpfung auf −40 %-Deload-Zwilling der Quellvorlage
 * - Rad-/Lauf-Tage mit Intervall-Keywords: Text wird zu Z1/Z2-AktivErholung
 */
export function applyDeloadWeek(
  plan: DayPlan[],
  gymTemplates: GymTemplate[]
): DeloadWeekPackage {
  const templatesToSave: GymTemplate[] = [];

  const ensureDeloadTwin = (sourceId: string): string | null => {
    const twinId = `${sourceId}${DELOAD_TEMPLATE_SUFFIX}`;
    const existingTwin = gymTemplates.find((t) => t.id === twinId);
    if (existingTwin) return twinId;
    const source = gymTemplates.find((t) => t.id === sourceId);
    if (!source) return null;
    const twin = generateDeloadGymTemplate(source);
    templatesToSave.push(twin);
    gymTemplates = [...gymTemplates, twin]; // lokale Kopie, damit Folgetage denselben Zwilling sehen
    return twinId;
  };

  const nextPlan = plan.map((day) => {
    const base: DayPlan = {
      ...day,
      isDeload: true,
      title: day.title.startsWith("Deload · ") ? day.title : `Deload · ${day.title}`,
    };

    if (day.workoutType === "gym" && day.templateId) {
      let sourceId = day.templateId;
      if (sourceId.endsWith(DELOAD_TEMPLATE_SUFFIX)) {
        sourceId = sourceId.slice(0, -DELOAD_TEMPLATE_SUFFIX.length);
      }
      const twinId = ensureDeloadTwin(sourceId);
      return {
        ...base,
        templateId: twinId ?? day.templateId,
        description: `${day.description} Deload-Umfang: −40 % Sätze, RPE-Cap 6–7.`.trim(),
      };
    }

    if (
      (day.workoutType === "cycling" || day.workoutType === "running") &&
      INTERVAL_KEYWORDS.some((k) =>
        `${day.title} ${day.description}`.toLowerCase().includes(k)
      )
    ) {
      const recovery = generateDeloadEnduranceTemplate({
        id: `plan-${day.dayIndex}`,
        name: day.title.replace(/^Deload · /, ""),
        type: day.workoutType,
        description: day.description,
      });
      return {
        ...base,
        title: `Deload · ${recovery.name}`,
        description: recovery.description,
      };
    }

    return base;
  });

  return { plan: nextPlan, templatesToSave };
}
