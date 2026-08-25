// ─── AI Coach Dynamic Nutrition & Macro Engine ────────────────────────────────
// Berechnet und passt Kalorien-, Protein-, Kohlenhydrat-, Fett- und Wasserziele
// vollautomatisch an – basierend auf Garmin-Vitalwerten, Trainingsplan & Körperwaage.

import type {
  DailyNutritionGoal,
  GarminDailyHealth,
  BodyWeightEntry,
  DayPlan,
  LoggedSession,
} from "@/types";

export type AthleteFocusGoal =
  | "recomp"        // Hybrid Recomposition (Muskelaufbau + Fettabbau zeitgleich)
  | "hypertrophy"   // Hypertrophie & Muskelaufbau (+10% Überschuss)
  | "endurance"     // Ausdauer & Wettkampf-Performance (High Carb)
  | "cut"           // Definierter Fettabbau (-15% bis -20% Defizit)
  | "maintain";     // Leistungserhalt & Stabilität

export interface AIMacroCalculationInput {
  latestWeightEntry?: BodyWeightEntry | null;
  garminHealth?: GarminDailyHealth | null;
  todayPlannedWorkout?: DayPlan | null;
  recentSessions?: LoggedSession[];
  athleteGoal?: AthleteFocusGoal;
  customHeightCm?: number;
  customAge?: number;
  gender?: "male" | "female";
}

export interface AIMacroResult {
  goals: DailyNutritionGoal;
  breakdown: {
    bmr: number;
    activityMultiplier: number;
    trainingBurnKcal: number;
    goalOffsetKcal: number;
    proteinGPerKg: number;
    readinessScore: number;
    explanation: string;
    highlights: string[];
  };
}

/**
 * Berechnet die optimalen Tages-Makros vollautomatisch durch den KI-Coach.
 */
export function calculateAICoachMacros(input: AIMacroCalculationInput): AIMacroResult {
  const {
    latestWeightEntry,
    garminHealth,
    todayPlannedWorkout,
    athleteGoal = "recomp",
    customHeightCm = 180,
    customAge = 26,
    gender = "male",
  } = input;

  const weightKg = latestWeightEntry?.weight || 80.0;
  const bodyFatPct = latestWeightEntry?.bodyFatPct;
  const readiness = garminHealth?.trainingReadiness ?? 70;
  const activeBurned = garminHealth?.activeCaloriesBurned ?? 0;
  const sleepScore = garminHealth?.sleepScore ?? 80;

  // 1. Grundumsatz (BMR)
  let bmr: number;
  if (bodyFatPct && bodyFatPct > 5 && bodyFatPct < 45) {
    // Katch-McArdle Formel (präziser bei bekannter BIA-Körperfettmessung)
    const leanMassKg = weightKg * (1 - bodyFatPct / 100);
    bmr = Math.round(370 + 21.6 * leanMassKg);
  } else {
    // Mifflin-St Jeor Formel
    bmr = Math.round(10 * weightKg + 6.25 * customHeightCm - 5 * customAge + (gender === "male" ? 5 : -161));
  }

  // 2. Basis-Aktivitätsfaktor (NEAT ohne Training)
  const baseMultiplier = 1.35;
  const baseTdee = Math.round(bmr * baseMultiplier);

  // 3. Trainings-Belastung heute
  let workoutLoadKcal = 0;
  let workoutTypeTag = "Ruhetag / Erholung";

  if (todayPlannedWorkout && todayPlannedWorkout.workoutType !== "rest") {
    workoutTypeTag = todayPlannedWorkout.title;
    switch (todayPlannedWorkout.workoutType) {
      case "gym":
        workoutLoadKcal = 350;
        break;
      case "running":
        workoutLoadKcal = 480;
        break;
      case "cycling":
        workoutLoadKcal = 520;
        break;
      case "mobility":
      case "stretching":
      case "warmup":
        workoutLoadKcal = 120;
        break;
      default:
        workoutLoadKcal = 300;
    }
  }

  // Echte Garmin-Aktivitätskalorien priorisieren, falls vorhanden
  const effectiveActiveBurn = activeBurned > 100 ? activeBurned : workoutLoadKcal;

  // 4. Ziel-Offset (Kcal)
  let goalOffsetKcal = 0;
  let proteinMultiplier = 2.0; // g / kg

  switch (athleteGoal) {
    case "hypertrophy":
      goalOffsetKcal = 280; // +10% leichter Aufbau
      proteinMultiplier = 2.1;
      break;
    case "endurance":
      goalOffsetKcal = 150; // Glykogen-Fokus
      proteinMultiplier = 1.9;
      break;
    case "cut":
      goalOffsetKcal = -450; // -15% moderater Cut mit Muskelschutz
      proteinMultiplier = 2.3; // Höheres Protein im Defizit
      break;
    case "recomp":
    default:
      goalOffsetKcal = 0; // Wartung mit optimalem Timing
      proteinMultiplier = 2.1;
      break;
  }

  // 5. Readiness & Erholungs-Modulation
  if (readiness < 50) {
    // Bei niedriger Readiness: Leichter Kohlenhydrat-Puffer für ZNS-Regeneration
    goalOffsetKcal += 100;
  }

  // 6. Gesamtkalorien
  const totalCalories = Math.max(1600, Math.round(baseTdee + effectiveActiveBurn + goalOffsetKcal));

  // 7. Makro-Verteilung
  // Protein:
  const protein = Math.round(weightKg * proteinMultiplier);
  const proteinKcal = protein * 4;

  // Fett: ~0.9g/kg (essentiell für Hormone & Gelenke)
  const fat = Math.round(weightKg * 0.9);
  const fatKcal = fat * 9;

  // Kohlenhydrate: Füllen den gesamten Rest für maximale Trainingsenergie
  const remainingKcal = Math.max(0, totalCalories - (proteinKcal + fatKcal));
  const carbs = Math.round(remainingKcal / 4);

  // Wasser: 35ml/kg Basis + 80% des Aktivitätsverbrauchs in ml
  const baseWater = Math.round(weightKg * 38);
  const activeWater = Math.round(effectiveActiveBurn * 0.75);
  const waterMl = Math.max(2500, Math.round((baseWater + activeWater) / 250) * 250);

  // 8. Erklärung generieren
  const highlights: string[] = [];
  highlights.push(`Gewicht ${weightKg.toFixed(1)} kg → ${protein}g Protein (${proteinMultiplier}g/kg) für Muskelschutz`);
  if (effectiveActiveBurn > 0) {
    highlights.push(`+${effectiveActiveBurn} kcal Belastung (${workoutTypeTag}) dynamisch in Kohlenhydrate umgewandelt`);
  }
  if (readiness >= 75) {
    highlights.push(`Hohe Readiness (${readiness}/100) → Vollgas-Makros für maximale Intensität`);
  } else if (readiness < 50) {
    highlights.push(`Erhöhte Vorbelastung (Readiness ${readiness}/100) → Erholungs- & ZNS-Support aktiv`);
  }

  let explanation = "";
  if (effectiveActiveBurn > 300) {
    explanation = `Der AI Coach hat dein Kalorienziel heute um +${effectiveActiveBurn} kcal auf ${totalCalories} kcal angehoben, um deinen Trainingsverbrauch von „${workoutTypeTag}“ auszugleichen und Glykogenspeicher voll zu halten.`;
  } else {
    explanation = `Optimal ausbalancierte Makros für ${athleteGoal === "recomp" ? "Hybrid Recomposition" : athleteGoal === "cut" ? "Fettabbau" : "Muskelaufbau"} bei ${weightKg.toFixed(1)} kg Körpergewicht.`;
  }

  const goals: DailyNutritionGoal = {
    calories: totalCalories,
    protein,
    carbs,
    fat,
    waterMl,
    isAutoPilot: true,
    athleteGoal,
    proteinPerKg: proteinMultiplier,
    lastAutoAdjustedAt: new Date().toISOString(),
    autoAdjustReason: explanation,
  };

  return {
    goals,
    breakdown: {
      bmr,
      activityMultiplier: baseMultiplier,
      trainingBurnKcal: effectiveActiveBurn,
      goalOffsetKcal,
      proteinGPerKg: proteinMultiplier,
      readinessScore: readiness,
      explanation,
      highlights,
    },
  };
}
