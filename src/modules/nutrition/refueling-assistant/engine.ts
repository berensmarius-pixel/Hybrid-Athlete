import type { GarminActivity, LoggedSession, GymSession } from "@/types";
import { getLocalDateString } from "@/lib/utils";
import { generateMealSuggestions } from "./meals";
import type {
  BuildRefuelPlanInput,
  RefuelActivityInput,
  RefuelClassification,
  RefuelIntensity,
  RefuelPlan,
  RefuelTargets,
} from "./types";

// ─── Refueling-Assistant Engine ───────────────────────────────────────────────
// Reine Klassifikations- & Zielberechnungslogik (testbar ohne React/DOM).
//
// Wissenschaftliche Basis:
//  - Glykogen-Resynthese: 1.0–1.2 g Carbs/kg KG in den ersten 60 min nach
//    glykogenzehrenden Ausdauereinheiten (hohes GI bevorzugt).
//  - MPS-Trigger: 30–45 g hochwertiges Protein (~2.5 g Leucin) nach schweren
//    Hypertrophie-Einheiten.
//  - Dual-Session-Days: sofort schnelle Carbs, da die zweite Einheit auf
//    nicht aufgefüllte Speicher trifft.

export const REFUEL_WINDOW_MINUTES = 120;
export const DEFAULT_BODY_WEIGHT_KG = 75;

/** Aktivitäten, die älter als das sind, lösen keinen Plan mehr aus (Stale-Schutz). */
export const REFUEL_TRIGGER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// ─── Normalisierung der Quellen ───────────────────────────────────────────────

/** GarminActivity → normalisierter Refuel-Input. */
export function toRefuelActivityFromGarmin(a: GarminActivity): RefuelActivityInput {
  return {
    id: a.id,
    source: "garmin",
    name: a.name,
    sport: a.type === "running" || a.type === "cycling" || a.type === "gym" ? a.type : "other",
    startTimeISO: a.startTime,
    durationSeconds: a.durationSeconds,
    avgHeartRate: a.avgHeartRate,
    maxHeartRate: a.maxHeartRate,
    caloriesBurned: a.caloriesBurned,
    totalElevationGainMeters: a.elevationGainMeters,
    intensityFactor: a.intensityFactor,
    tss: a.tss,
    aerobicTrainingEffect: a.trainingEffectAerobic,
    anaerobicTrainingEffect: a.trainingEffectAnaerobic,
  };
}

/**
 * LoggedSession (inkl. Strava-Importe) → normalisierter Refuel-Input.
 * Gibt null für nicht-refuel-relevante Kinds (stretching/warmup/mobility) zurück.
 */
export function toRefuelActivityFromSession(session: LoggedSession): RefuelActivityInput | null {
  if (session.kind === "endurance") {
    return {
      id: session.id,
      source: session.stravaId ? "strava" : "manual",
      name: session.templateName || (session.activityType === "running" ? "Lauf" : "Radausfahrt"),
      sport: session.activityType,
      startTimeISO: session.date,
      durationSeconds: parseDurationToSeconds(session.duration),
      avgHeartRate: typeof session.heartRate === "number" ? session.heartRate : undefined,
      rpe: session.rpe,
    };
  }
  if (session.kind !== "gym") return null;

  const gym = session as GymSession;
  let totalSets = 0;
  let totalVolumeKg = 0;
  for (const entry of gym.entries) {
    for (const set of entry.sets) {
      if (!set.isCompleted) continue;
      totalSets += 1;
      totalVolumeKg += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    }
  }
  return {
    id: gym.id,
    source: "manual",
    name: gym.templateName || "Gym-Session",
    sport: "gym",
    startTimeISO: gym.date,
    durationSeconds: 0, // Gym-Logger trackt keine Dauer
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    rpe: gym.rpe,
  };
}

/** "1:30:00" | "45:00" | "65" → Sekunden (Logger-Konvention: H:MM:SS bzw. MM:SS). */
export function parseDurationToSeconds(raw: string): number {
  const value = (raw || "").trim();
  if (!value) return 0;
  if (value.includes(":")) {
    const parts = value.split(":").map((p) => Number(p) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const num = Number(value.replace(",", "."));
  if (!Number.isFinite(num)) return 0;
  // Nackte Zahl im Logger ist Minuten ("65")
  return Math.round(num * 60);
}

// ─── Intensitäts-Scoring ──────────────────────────────────────────────────────

function scoreEnduranceIntensity(a: RefuelActivityInput): { score: number; signals: string[] } {
  const minutes = a.durationSeconds / 60;
  let score = 0;
  const signals: string[] = [];

  score += Math.min(30, minutes / 4); // 120 min → 30

  if (a.intensityFactor != null) {
    if (a.intensityFactor >= 0.95) { score += 30; signals.push(`IF ${a.intensityFactor.toFixed(2)}`); }
    else if (a.intensityFactor >= 0.85) { score += 20; signals.push(`IF ${a.intensityFactor.toFixed(2)}`); }
    else if (a.intensityFactor > 0) { score += 10; }
  }
  if (a.avgHeartRate != null && a.avgHeartRate > 0) {
    if (a.avgHeartRate >= 155) { score += 25; signals.push(`ØHF ${Math.round(a.avgHeartRate)}`); }
    else if (a.avgHeartRate >= 140) { score += 15; signals.push(`ØHF ${Math.round(a.avgHeartRate)}`); }
    else if (a.avgHeartRate >= 125) { score += 8; }
  }
  if (a.aerobicTrainingEffect != null) {
    if (a.aerobicTrainingEffect >= 3.5) { score += 15; signals.push(`TE ${a.aerobicTrainingEffect.toFixed(1)}`); }
    else if (a.aerobicTrainingEffect >= 2.5) score += 8;
  }
  if (a.tss != null) {
    if (a.tss >= 90) { score += 20; signals.push(`TSS ${Math.round(a.tss)}`); }
    else if (a.tss >= 60) score += 12;
  }
  if ((a.totalElevationGainMeters ?? 0) >= 500) score += 5;

  return { score, signals };
}

function scoreGymIntensity(a: RefuelActivityInput): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const sets = a.totalSets ?? 0;
  score += Math.min(35, sets * 1.5); // 20 Sätze → 30
  if (sets > 0) signals.push(`${sets} Sätze`);

  const volumeT = (a.totalVolumeKg ?? 0) / 1000;
  score += Math.min(15, volumeT * 1.5); // 10 t Volumen → 15
  if (volumeT >= 5) signals.push(`${volumeT.toFixed(1)} t Volumen`);

  if (a.rpe != null) {
    if (a.rpe >= 9) { score += 20; signals.push(`RPE ${a.rpe}`); }
    else if (a.rpe >= 8) { score += 14; signals.push(`RPE ${a.rpe}`); }
    else if (a.rpe >= 7) score += 7;
  }

  const minutes = a.durationSeconds / 60;
  if (minutes >= 75) score += 10;

  return { score, signals };
}

function intensityFromScore(score: number): RefuelIntensity {
  if (score >= 65) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

// ─── Klassifikation ───────────────────────────────────────────────────────────

/**
 * Klassifiziert eine abgeschlossene Activity:
 *  - Dual-Session-Day       → Urgent Fast-Acting Carb Protocol
 *  - Heavy Hypertrophy Gym  → High Leucine/Protein Priority (30–45 g)
 *  - High-Intensity Ride/Run→ High Carb Priority (1.0–1.2 g/kg in 60 min)
 */
export function classifyRefuelNeeds(
  activity: RefuelActivityInput,
  sameDayActivities: RefuelActivityInput[]
): RefuelClassification {
  // 1) Dual-Session-Day? (weitere relevante Activity am selben Kalendertag)
  const ownDate = getActivityLocalDate(activity);
  const othersSameDay = sameDayActivities.filter(
    (o) => o.id !== activity.id && isRefuelRelevant(o) && getActivityLocalDate(o) === ownDate
  );
  if (othersSameDay.length > 0) {
    const other = othersSameDay[0];
    return {
      priority: "urgent-carbs",
      intensity: "high",
      headline: "Dual Session – Fast Carbs jetzt",
      reason: `Zweite Einheit heute (${other.name}). Glykogen ist nicht aufgefüllt – schnelle Carbs umgehend nachladen.`,
      firstDoseMinutes: 30,
    };
  }

  // 2) Heavy Hypertrophy Gym?
  if (activity.sport === "gym") {
    const { score, signals } = scoreGymIntensity(activity);
    const intensity = intensityFromScore(score);
    if (intensity === "high") {
      return {
        priority: "protein",
        intensity,
        headline: "Leucin-Protein-Fenster",
        reason: `Schwere Hypertrophie-Einheit (${signals.join(", ")}) – 30–45 g hochwertiges Protein für den MPS-Reiz.`,
        firstDoseMinutes: 45,
        leucineTriggerG: 2.5,
      };
    }
    return {
      priority: intensity === "moderate" ? "protein" : "carbs",
      intensity,
      headline: intensity === "moderate" ? "Protein-Top-up" : "Lockeres Workout",
      reason:
        intensity === "moderate"
          ? `Solide Gym-Einheit (${signals.join(", ")}) – moderates Protein-Target zur Absicherung.`
          : "Niedrige Belastung – leichte Refuel-Ziele reichen.",
      firstDoseMinutes: 60,
      leucineTriggerG: intensity === "moderate" ? 2.0 : undefined,
    };
  }

  // 3) Ausdauer (Ride/Run) & Sonstiges
  const { score, signals } = scoreEnduranceIntensity(activity);
  const intensity = intensityFromScore(score);
  if (intensity === "high") {
    return {
      priority: "carbs",
      intensity,
      headline: "High Carb Priority",
      reason: `Intensive ${activity.sport === "running" ? "Laufeinheit" : "Radeinheit"} (${signals.join(", ")}) – 1.0–1.2 g Carbs/kg in den ersten 60 min.`,
      firstDoseMinutes: 60,
    };
  }
  return {
    priority: "carbs",
    intensity,
    headline: intensity === "moderate" ? "Moderate Refuel-Ziele" : "Lockere Einheit",
    reason:
      intensity === "moderate"
        ? `Solide Ausdauereinheit (${signals.join(", ")}) – moderate Carb-Nachladung genügt.`
        : "Niedrige Intensität – Glykogen reicht für heute.",
    firstDoseMinutes: 90,
  };
}

/** Nur relevante Kinds zählen für Dual-Session-Erkennung & Trigger. */
export function isRefuelRelevant(a: RefuelActivityInput): boolean {
  return a.sport === "cycling" || a.sport === "running" || a.sport === "gym";
}

// ─── Ziele ────────────────────────────────────────────────────────────────────

const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

export function computeRefuelTargets(
  classification: RefuelClassification,
  activity: RefuelActivityInput,
  bodyWeightKg: number
): RefuelTargets {
  const bw = bodyWeightKg > 30 ? bodyWeightKg : DEFAULT_BODY_WEIGHT_KG;

  switch (classification.priority) {
    case "urgent-carbs": {
      // Sofort-Protokoll: 1.2 g/kg schnelle Carbs + fixer Protein-Anteil
      return {
        carbsG: Math.round(bw * 1.2),
        proteinG: Math.round(clamp(bw * 0.3, 20, 40)),
        fluidMl: Math.round(clamp(bw * 9, 600, 1200)),
      };
    }
    case "protein": {
      // 30–45 g hochwertiges Protein + moderate Carbs für Glykogen
      return {
        carbsG: Math.round(bw * 0.5),
        proteinG: Math.round(clamp(bw * 0.45, 30, 45)),
        fluidMl: Math.round(clamp(bw * 7, 500, 900)),
      };
    }
    case "carbs":
    default: {
      // 1.0–1.2 g/kg bei high; abgestuft darunter
      const carbPerKg =
        classification.intensity === "high" ? 1.15 :
        classification.intensity === "moderate" ? 0.75 : 0.5;
      return {
        carbsG: Math.round(bw * carbPerKg),
        proteinG: Math.round(clamp(bw * 0.3, 15, 30)),
        fluidMl: Math.round(clamp(bw * (activity.sport === "running" ? 7 : 9), 500, 1500)),
      };
    }
  }
}

// ─── Fenster-Logik ────────────────────────────────────────────────────────────

export interface RefuelWindowProgress {
  /** Sekunden bis zum Fenster-Ende */
  remainingSeconds: number;
  totalSeconds: number;
  elapsedPct: number;
  expired: boolean;
}

export function getWindowProgress(plan: RefuelPlan, nowMs: number): RefuelWindowProgress {
  const start = new Date(plan.windowStartISO).getTime();
  const end = new Date(plan.windowEndsAtISO).getTime();
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const remainingSeconds = Math.max(0, Math.round((end - nowMs) / 1000));
  return {
    remainingSeconds,
    totalSeconds,
    elapsedPct: Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100)),
    expired: remainingSeconds <= 0,
  };
}

/** Verbleibende Gramm bis zum Ziel (nie negativ). */
export function getRemainingTargets(plan: RefuelPlan): { carbsG: number; proteinG: number } {
  return {
    carbsG: Math.max(0, plan.targets.carbsG - plan.consumedCarbsG),
    proteinG: Math.max(0, plan.targets.proteinG - plan.consumedProteinG),
  };
}

// ─── Plan-Erzeugung ───────────────────────────────────────────────────────────

export function buildRefuelPlan(input: BuildRefuelPlanInput): RefuelPlan {
  const { activity, sameDayActivities, bodyWeightKg, pantryItems = [], now = new Date() } = input;

  const classification = classifyRefuelNeeds(activity, sameDayActivities);
  const targets = computeRefuelTargets(classification, activity, bodyWeightKg);
  const suggestions = generateMealSuggestions(classification.priority, targets, pantryItems);

  const windowStart = getActivityEndTime(activity);
  const windowEnd = new Date(windowStart.getTime() + REFUEL_WINDOW_MINUTES * 60 * 1000);

  return {
    id: `refuel-${activity.id}`,
    createdAtISO: now.toISOString(),
    windowStartISO: windowStart.toISOString(),
    windowEndsAtISO: windowEnd.toISOString(),
    activityIds: [activity.id],
    activityName: activity.name,
    sport: activity.sport,
    source: activity.source,
    classification,
    targets,
    suggestions,
    consumedCarbsG: 0,
    consumedProteinG: 0,
  };
}

/** Ende der Activity = max(Start + Dauer, Start + 5 min). Ohne Dauer: jetzt. */
export function getActivityEndTime(activity: RefuelActivityInput): Date {
  const start = new Date(activity.startTimeISO).getTime();
  const durationMs =
    activity.durationSeconds > 0
      ? activity.durationSeconds * 1000
      : activity.sport === "gym"
        ? 75 * 60 * 1000 // Gym-Logger hat keine Dauer → konservative Schätzung
        : 5 * 60 * 1000;
  const end = start + Math.max(durationMs, 5 * 60 * 1000);
  const now = Date.now();
  return new Date(Math.min(end, now));
}

/** Lokales Kalenderdatum einer Activity (für Dual-Session-Erkennung). */
export function getActivityLocalDate(a: RefuelActivityInput): string {
  return getLocalDateString(new Date(a.startTimeISO));
}
