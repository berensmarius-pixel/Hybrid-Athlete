// ─── Holistic Hybrid Adaptive Engine ──────────────────────────────────────────
// Synthesizes Garmin Health (Forerunner 265 / Edge 840), Planned Training & Nutrition

import {
  GarminDailyHealth,
  DayPlan,
  DailyNutritionGoal,
  DailyNutritionLog,
  GarminActivity,
  HolisticDayGuidance,
} from "@/types";

export function generateHolisticGuidance(params: {
  health?: GarminDailyHealth;
  plannedWorkout?: DayPlan;
  nutritionGoals: DailyNutritionGoal;
  loggedNutrition?: DailyNutritionLog;
  activitiesToday?: GarminActivity[];
}): HolisticDayGuidance {
  const {
    health,
    plannedWorkout,
    nutritionGoals,
    loggedNutrition,
    activitiesToday = [],
  } = params;

  const readiness = health?.trainingReadiness ?? 75;
  const bodyBattery = health?.bodyBattery ?? 80;
  const hrvStatus = health?.hrvStatus ?? "balanced";
  const activeCalories = health?.activeCaloriesBurned ?? 500;
  const recoveryHours = health?.recoveryTimeHours ?? 12;

  // ── 1. Determine Readiness & Training Guidance ──────────────────────────────

  let readinessCategory: HolisticDayGuidance["readinessCategory"] = "optimal";
  let action: HolisticDayGuidance["trainingAdvice"]["suggestedAction"] = "proceed";
  let trainingHeadline = "Grünes Licht: Volle Trainingsbereitschaft";
  let trainingDesc =
    "Deine Garmin-Werte (HRV, Schlaf & Training Readiness) sind im optimalen Bereich. Du kannst das geplante Training mit voller Intensität absolvieren.";

  if (readiness < 35 || hrvStatus === "poor" || hrvStatus === "unbalanced") {
    readinessCategory = "recovery_needed";
    action = "active_recovery";
    trainingHeadline = "🔴 Erholung priorisieren (Hohe Belastung)";
    trainingDesc = `Deine Training Readiness liegt bei ${readiness}/100 und der HRV-Status ist belastet. Verschiebe Maximalversuche und mache heute stattdessen 30 Min. Mobility Flow, lockeres Ausradeln in Zone 1 oder einen Ruhetag.`;
  } else if (readiness < 55 || bodyBattery < 40) {
    readinessCategory = "fatigued";
    action = "reduce_intensity";
    trainingHeadline = "🟠 Erhöhte Ermüdung: Intensität anpassen";
    trainingDesc = `Deine Erholungszeit (${recoveryHours}h) oder Schlafqualität war suboptimal. Reduziere Gewichte um ~10-15% oder laufe rein aerob in Zone 2.`;
  } else if (readiness < 75) {
    readinessCategory = "moderate";
    action = "proceed";
    trainingHeadline = "🟡 Solide Bereitschaft: Plan durchziehen";
    trainingDesc = `Gute Trainingsbereitschaft (${readiness}/100). Halte dich an den Plan, wärme dich gründlich auf und achte auf ausreichende Satzpausen.`;
  } else {
    readinessCategory = "optimal";
    action = "push";
    trainingHeadline = "🟢 Top Form: Perfekter Tag für Höchstleistung";
    trainingDesc = `Hervorragende Training Readiness (${readiness}/100) & Body Battery (${bodyBattery}). Beste Voraussetzungen für harte Intervalle auf dem Rad/Lauf oder neue Kraft-PRs!`;
  }

  // ── 2. Determine Dynamic Nutrition & Fueling Strategy ───────────────────────

  const baseCalories = nutritionGoals.calories || 2500;
  const baseProtein = nutritionGoals.protein || 160;
  const baseCarbs = nutritionGoals.carbs || 280;
  const baseFat = nutritionGoals.fat || 70;

  // Dynamically adjust daily calories based on Garmin burned active calories
  const adjustedCalories = baseCalories + activeCalories;
  // Extra carbs for endurance / training fueling
  const extraCarbs = Math.round(activeCalories * 0.18);
  const recommendedCarbs = baseCarbs + extraCarbs;
  const recommendedProtein = baseProtein;
  const recommendedFat = baseFat + Math.round(activeCalories * 0.03);

  const isCyclingDay =
    plannedWorkout?.workoutType === "cycling" ||
    activitiesToday.some((a) => a.type === "cycling");
  const isRunningDay =
    plannedWorkout?.workoutType === "running" ||
    activitiesToday.some((a) => a.type === "running");

  const fuelingTips: string[] = [
    `Kalorien-Budget dynamisch angepasst (+${activeCalories} kcal verbrannt von Garmin Forerunner/Edge).`,
    `Proteinziel: ${recommendedProtein}g für Muskelreparatur & MPS (Muscle Protein Synthesis).`,
  ];

  if (activeCalories > 600 || isCyclingDay || isRunningDay) {
    fuelingTips.push(
      `Erhöhter Kohlenhydratbedarf (+${extraCarbs}g Carbs), um die Muskelglykogenspeicher für die nächste Einheit vollzuhalten.`
    );
    fuelingTips.push(
      `Hydration: Trinke heute mind. ${Math.round((nutritionGoals.waterMl || 3000) + activeCalories * 0.8)} ml Wasser inkl. Elektrolyte.`
    );
  }

  const mealSuggestions: HolisticDayGuidance["nutritionAdvice"]["mealSuggestions"] = [];

  // Pre-Workout suggestion
  mealSuggestions.push({
    timing: "1–2h vor dem Training (Pre-Workout Fuel)",
    title: "Leicht verdauliche Kohlenhydrate & moderates Protein",
    description:
      "Haferflocken mit Banane, Beeren & einem Löffel Whey oder 2 Scheiben Vollkorntoast mit Honig & Magerquark.",
    carbsG: 55,
    proteinG: 22,
  });

  // Post-Workout suggestion
  mealSuggestions.push({
    timing: "Direkt nach dem Training (Post-Workout Recovery)",
    title: "Schneller Recovery Shake + Glykogen-Kick",
    description:
      "35g Whey Protein Isolat mit 400ml fettarmer Milch/Mandelmilch + 1 reife Banane oder 40g Dextrose/Maltodextrin.",
    carbsG: 45,
    proteinG: 35,
  });

  // Main Meal / Dinner
  mealSuggestions.push({
    timing: "Hauptmahlzeit / Abendessen (Repair & Refuel)",
    title: "Proteinreich mit komplexen Carbs & gesunden Fetten",
    description:
      isCyclingDay
        ? "Große Portion Reis oder Nudeln mit Hähnchenbrust/Lachs und mediterranem Gemüse in Olivenöl."
        : "Süßkartoffeln aus dem Ofen mit Rinderhack (mager) oder Tofu, Avocado und grünem Brokkoli.",
    carbsG: 75,
    proteinG: 45,
  });

  return {
    readinessCategory,
    trainingAdvice: {
      headline: trainingHeadline,
      description: trainingDesc,
      suggestedAction: action,
      suggestedWorkoutTitle: plannedWorkout?.title,
    },
    nutritionAdvice: {
      headline: `Tagesbedarf: ${adjustedCalories} kcal (+${activeCalories} kcal Aktiv-Verbrauch)`,
      adjustedCalories,
      burnedCalories: activeCalories,
      recommendedCarbs,
      recommendedProtein,
      recommendedFat,
      fuelingTips,
      mealSuggestions,
    },
  };
}
