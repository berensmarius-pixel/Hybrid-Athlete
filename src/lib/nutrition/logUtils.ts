import type { DailyNutritionLog, MealEntry } from "@/types";

/**
 * Pure Helpers für die Ernährungs-Logs – bewusst ohne React/Storage,
 * damit sie unit-testbar sind.
 */

/**
 * Führt einen Read-Modify-Write auf dem Tages-Log eines Datums aus:
 * Existiert der Tag bereits, wird `mutate` auf eine Kopie angewendet,
 * sonst wird ein neuer Tages-Eintrag vorne eingefügt.
 */
export function upsertNutritionDay(
  prev: DailyNutritionLog[],
  date: string,
  create: () => DailyNutritionLog,
  mutate: (day: DailyNutritionLog) => DailyNutritionLog
): DailyNutritionLog[] {
  const existingDayIdx = prev.findIndex((log) => log.date === date);
  if (existingDayIdx >= 0) {
    const updated = [...prev];
    updated[existingDayIdx] = mutate(prev[existingDayIdx]);
    return updated;
  }
  return [create(), ...prev];
}

/** Hängt Meal-Entries an einen Tag an (Tag wird ggf. angelegt). */
export function appendMealEntries(
  prev: DailyNutritionLog[],
  date: string,
  newEntries: MealEntry[]
): DailyNutritionLog[] {
  return upsertNutritionDay(
    prev,
    date,
    () => ({ date, entries: newEntries, waterMl: 0 }),
    (day) => ({ ...day, entries: [...day.entries, ...newEntries] })
  );
}
