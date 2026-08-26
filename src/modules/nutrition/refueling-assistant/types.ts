import type { PantryItem } from "@/types";

// ─── Refueling-Assistant: Typen ───────────────────────────────────────────────
// Post-Workout-Nutrient-Timing direkt nach dem Sync einer Activity
// (Garmin oder Strava). Fokus: Glykogen-Resynthese + Muskelproteinsynthese.

/** Dominante Priorität des Refuel-Protokolls. */
export type RefuelPriority = "carbs" | "protein" | "urgent-carbs";

export type RefuelIntensity = "high" | "moderate" | "low";

/**
 * Normalisierter Activity-Snapshot – Quelle kann Garmin ODER Strava sein.
 * Alle optionalen Felder fließen als Intensitätssignale in die Klassifikation ein.
 */
export interface RefuelActivityInput {
  /** Dedup-Key (stabil über Syncs hinweg) */
  id: string;
  source: "garmin" | "strava" | "manual";
  name: string;
  sport: "cycling" | "running" | "gym" | "other";
  /** ISO-Zeitstempel des Starts */
  startTimeISO: string;
  durationSeconds: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  caloriesBurned?: number;
  totalElevationGainMeters?: number;
  /** Power-basierte Signale (Garmin/Edge) */
  intensityFactor?: number;
  tss?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  /** Gym-spezifische Signale (aus dem Session-Logger) */
  totalSets?: number;
  totalVolumeKg?: number;
  rpe?: number;
}

/** Ergebnis der Workout-Klassifikation. */
export interface RefuelClassification {
  priority: RefuelPriority;
  intensity: RefuelIntensity;
  /** z. B. "High Carb Priority" / "Leucin-Protein-Priority" / "Dual Session" */
  headline: string;
  /** Kurze datenbasierte Begründung (Deutsch, für UI & Notification) */
  reason: string;
  /** Minuten bis zur ersten Dosis (schnellste Aufnahmephase) */
  firstDoseMinutes: number;
  /** Leucin-Schwelle für den MPS-Trigger (nur Protein-Priority), in g */
  leucineTriggerG?: number;
}

/** Nährstoff-Ziele für das Refuel-Fenster. */
export interface RefuelTargets {
  carbsG: number;
  proteinG: number;
  fluidMl: number;
}

/** Schnelle Mahlzeiten-Empfehlung ("Option A/B/C"). */
export interface RefuelMealSuggestion {
  id: string;
  label: string; // "Option A"
  title: string;
  /** Zutaten mit Mengen, z. B. "500g Magerquark + 100g Beeren + 20g Honig" */
  description: string;
  carbsG: number;
  proteinG: number;
  calories: number;
  prepMinutes: number;
  source: "pantry" | "standard";
}

/** Persistenter Refuel-Plan pro ausgelöster Activity. */
export interface RefuelPlan {
  id: string;
  createdAtISO: string;
  /** Ende der Activity = Start des Refuel-Fensters */
  windowStartISO: string;
  windowEndsAtISO: string;
  activityIds: string[];
  activityName: string;
  sport: RefuelActivityInput["sport"];
  source: RefuelActivityInput["source"];
  classification: RefuelClassification;
  targets: RefuelTargets;
  suggestions: RefuelMealSuggestion[];
  consumedCarbsG: number;
  consumedProteinG: number;
  dismissedAtISO?: string;
}

/** Eingangsparameter für buildRefuelPlan. */
export interface BuildRefuelPlanInput {
  activity: RefuelActivityInput;
  /** Weitere Activities am selben Tag (für Dual-Session-Erkennung) */
  sameDayActivities: RefuelActivityInput[];
  bodyWeightKg: number;
  pantryItems?: PantryItem[];
  now?: Date;
}
