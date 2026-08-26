// ─── Post-Workout-Replenishment ──────────────────────────────────────────────
//
// Leitet aus der tatsächlich verbrauchten Energie (kJ aus dem Powermeter bzw.
// Garmin-Kalorien) zusätzliche Auffüll-Ziele ab, die ÜBER dem Basis-Ziel liegen:
//   - Kohlenhydrate: ~60 % der Einheits-Belastung als CHO zurückfüllen
//     (Rest deckt Fett/Protein-Anteil + Basisernährung)
//   - Flüssigkeit: ~150 % des Kalorienverbrauchs als Trinkmenge

import type { ReplenishmentTarget } from "@/types";

const KCAL_PER_G_CARB = 4;
/** Anteil der Einheits-Energie, der über Zusatz-Kohlenhydrate zurückgefüllt wird. */
export const CARB_REPLACEMENT_SHARE = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ReplenishmentInput {
  date: string; // YYYY-MM-DD
  activityId?: string;
  activityName?: string;
  /** Gemessene Arbeit in kJ (Powermeter) – bevorzugte Quelle */
  workKJ?: number | null;
  /** Fallback: Garmin-Kalorien */
  calories?: number | null;
}

/**
 * Energie-Umsatz in kcal bestimmen. Beim Radfahren gilt näherungsweise
 * 1 kJ mechanische Arbeit ≈ 1 kcal metabolisch (Wirkungsgrad ~24 %).
 */
export function estimateEnergyExpenditureKcal(
  input: Pick<ReplenishmentInput, "workKJ" | "calories">
): number {
  if (typeof input.workKJ === "number" && input.workKJ > 0) {
    return Math.round(input.workKJ);
  }
  if (typeof input.calories === "number" && input.calories > 0) {
    return Math.round(input.calories);
  }
  return 0;
}

/** Zusätzliche Auffüll-Ziele für den Aktivitäts-Tag berechnen. */
export function computeReplenishmentTarget(
  input: ReplenishmentInput
): ReplenishmentTarget {
  const kcal = estimateEnergyExpenditureKcal(input);
  const additionalCarbsG = clamp(Math.round((kcal * CARB_REPLACEMENT_SHARE) / KCAL_PER_G_CARB), 0, 500);

  return {
    date: input.date,
    activityId: input.activityId,
    activityName: input.activityName,
    energyExpenditureKcal: kcal,
    additionalCarbsG,
    additionalCalories: additionalCarbsG * KCAL_PER_G_CARB,
    hydrationMl: clamp(Math.round(kcal * 1.5), 0, 3000),
    updatedAt: new Date().toISOString(),
  };
}
