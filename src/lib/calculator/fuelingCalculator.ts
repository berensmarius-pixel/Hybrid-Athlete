// ─── Intra-Workout & Nutrition Fueling Calculator Engine ─────────────────────

export type FuelingSportType = "cycling_z2" | "cycling_intervals" | "running_z2" | "running_tempo" | "gym_hypertrophy" | "gym_strength";

export interface FuelingInput {
  sportType: FuelingSportType;
  durationMinutes: number;
  bodyWeightKg: number;
  temperatureCelsius?: number;
}

export interface FuelingPlan {
  carbsPerHourGrams: number;
  totalCarbsGrams: number;
  fluidPerHourMl: number;
  totalFluidMl: number;
  sodiumPerHourMg: number;
  totalSodiumMg: number;
  carbTypeRecommendation: string;
  preWorkoutFueling: {
    timing3h: string;
    timing30m: string;
  };
  intraWorkoutStrategy: string[];
  postWorkoutRecovery: {
    proteinGrams: number;
    carbsGrams: number;
    summary: string;
  };
}

export function calculateFuelingPlan(input: FuelingInput): FuelingPlan {
  const { sportType, durationMinutes, bodyWeightKg, temperatureCelsius = 20 } = input;
  const hours = durationMinutes / 60;
  const isHot = temperatureCelsius >= 24;

  let carbsPerHour = 0;
  let fluidPerHour = isHot ? 750 : 550;
  let sodiumPerHour = isHot ? 650 : 450;
  let carbType = "Maltodextrin / Fruktose 1:0.8 Verhältnis";

  if (sportType === "cycling_z2") {
    carbsPerHour = durationMinutes <= 60 ? 30 : durationMinutes <= 120 ? 60 : 80;
  } else if (sportType === "cycling_intervals") {
    carbsPerHour = durationMinutes <= 45 ? 40 : durationMinutes <= 90 ? 75 : 90;
    sodiumPerHour += 150;
  } else if (sportType === "running_z2") {
    carbsPerHour = durationMinutes <= 60 ? 0 : durationMinutes <= 90 ? 40 : 60;
    fluidPerHour = isHot ? 650 : 500;
  } else if (sportType === "running_tempo") {
    carbsPerHour = durationMinutes <= 45 ? 30 : durationMinutes <= 75 ? 60 : 75;
    sodiumPerHour += 100;
  } else if (sportType === "gym_hypertrophy" || sportType === "gym_strength") {
    carbsPerHour = durationMinutes <= 60 ? 25 : 45;
    fluidPerHour = 600;
    sodiumPerHour = 400;
    carbType = "Cluster Dextrin oder Wasser mit einer Prise Salz & EAAs";
  }

  const totalCarbs = Math.round(carbsPerHour * hours);
  const totalFluid = Math.round(fluidPerHour * hours);
  const totalSodium = Math.round(sodiumPerHour * hours);

  const postProtein = Math.round(Math.min(45, Math.max(25, bodyWeightKg * 0.4)));
  const postCarbs = Math.round(
    sportType.includes("cycling") || sportType.includes("running")
      ? bodyWeightKg * 0.8
      : bodyWeightKg * 0.5
  );

  return {
    carbsPerHourGrams: carbsPerHour,
    totalCarbsGrams: totalCarbs,
    fluidPerHourMl: fluidPerHour,
    totalFluidMl: totalFluid,
    sodiumPerHourMg: sodiumPerHour,
    totalSodiumMg: totalSodium,
    carbTypeRecommendation: carbType,
    preWorkoutFueling: {
      timing3h: "Komplexe Kohlenhydrate (Haferflocken, Reis oder Vollkorn) + 25-30g mageres Protein & 500ml Wasser",
      timing30m: "Leicht verdauliche schnelle Carbs (1 Banane, Reissirup-Waffel oder Datteln) + 200ml Wasser mit 200mg Natrium",
    },
    intraWorkoutStrategy: [
      `Ab Minute 20: Alle 15–20 Minuten 150–200ml Flüssigkeit in kleinen Schlucken trinken.`,
      carbsPerHour > 0
        ? `Ziel-Kohlenhydratzufuhr: ${carbsPerHour}g pro Stunde (z. B. ${Math.round(carbsPerHour / 25)} Hydrogels oder isotonsiche Trinkflasche).`
        : `Bei dieser Dauer reicht reines Wasser oder Elektrolytwasser ohne zusätzliche Carbs.`,
      `Elektrolyte: ca. ${sodiumPerHour}mg Natrium/h verhindern Krämpfe und optimieren die Zellhydratation.`,
    ],
    postWorkoutRecovery: {
      proteinGrams: postProtein,
      carbsGrams: postCarbs,
      summary: `Innerhalb von 45 Min nach dem Training: ${postProtein}g Protein (Leucin-Trigger für Muskelproteinsynthese) + ${postCarbs}g Kohlenhydrate (Glykogenspeicher-Wiederauffüllung).`,
    },
  };
}
