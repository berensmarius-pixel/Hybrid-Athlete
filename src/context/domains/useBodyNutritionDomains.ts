"use client";

import { useCallback } from "react";
import type {
  BodyWeightEntry,
  BodyCompositionEntry,
  DailyNutritionGoal,
  DailyNutritionLog,
  FoodItem,
  MealType,
  MealEntry,
} from "@/types";
import { generateId } from "@/lib/utils";
import { calculateNutrients } from "@/lib/nutritionApi";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  appendMealEntries,
  upsertNutritionDay,
} from "@/lib/nutrition/logUtils";

/**
 * Domänen Körper & Ernährung: Körperdaten-Logs, Ernährungs-Tagebuch,
 * Ziele und Custom-Foods inklusive aller Aktionen.
 */

const BODY_WEIGHT_KEY = "hybrid_athlete_body_weight";
const NUTRITION_LOGS_KEY = "hybrid_athlete_nutrition_logs";
const NUTRITION_GOALS_KEY = "hybrid_athlete_nutrition_goals";
const CUSTOM_FOODS_KEY = "hybrid_athlete_custom_foods";

export const DEFAULT_NUTRITION_GOAL: DailyNutritionGoal = {
  calories: 2500,
  protein: 160,
  carbs: 308,
  fat: 70,
  waterMl: 3000,
  isAutoPilot: true,
  athleteGoal: "recomp",
  proteinPerKg: 2.1,
  autoAdjustReason: "Hybrid Recomposition: Ausbalancierte Makros für Muskelaufbau & Ausdauer",
};

export function useBodyDomain() {
  const [bodyWeightLog, setBodyWeightLog] = usePersistentState<BodyWeightEntry[]>(
    BODY_WEIGHT_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as BodyWeightEntry[]) : null) }
  );

  const addBodyWeight = useCallback(
    (entry: BodyCompositionEntry) => {
      setBodyWeightLog((prev) =>
        [entry, ...prev.filter((p) => p.date !== entry.date)].sort((a, b) =>
          b.date.localeCompare(a.date)
        )
      );
    },
    [setBodyWeightLog]
  );

  const importMultipleBodyCompositionEntries = useCallback(
    (entries: BodyCompositionEntry[]) => {
      setBodyWeightLog((prev) => {
        const dateMap = new Map<string, BodyCompositionEntry>();
        prev.forEach((e) => dateMap.set(e.date.split("T")[0], e));
        entries.forEach((e) => dateMap.set(e.date.split("T")[0], e));
        return Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
      });
    },
    [setBodyWeightLog]
  );

  return {
    bodyWeightLog,
    addBodyWeight,
    importMultipleBodyCompositionEntries,
  };
}

export function useNutritionDomain() {
  const [nutritionLogs, setNutritionLogs] = usePersistentState<DailyNutritionLog[]>(
    NUTRITION_LOGS_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as DailyNutritionLog[]) : null) }
  );
  const [nutritionGoals, setNutritionGoals] = usePersistentState<DailyNutritionGoal>(
    NUTRITION_GOALS_KEY,
    DEFAULT_NUTRITION_GOAL,
    {
      validate: (raw) =>
        raw && typeof (raw as DailyNutritionGoal).calories === "number"
          ? (raw as DailyNutritionGoal)
          : null,
    }
  );
  const [customFoods, setCustomFoods] = usePersistentState<FoodItem[]>(
    CUSTOM_FOODS_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as FoodItem[]) : null) }
  );

  const addMealEntry = useCallback((
    date: string,
    entry: Omit<MealEntry, "id" | "calories" | "protein" | "carbs" | "fat"> & { amount: number }
  ) => {
    const nuts = calculateNutrients(entry.food, entry.amount);
    const newEntry: MealEntry = {
      id: generateId(),
      mealType: entry.mealType,
      food: entry.food,
      amount: entry.amount,
      calories: nuts.calories,
      protein: nuts.protein,
      carbs: nuts.carbs,
      fat: nuts.fat,
      loggedAt: entry.loggedAt || new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };

    setNutritionLogs((prev) =>
      upsertNutritionDay(
        prev,
        date,
        () => ({ date, entries: [newEntry], waterMl: 0 }),
        (day) => ({ ...day, entries: [...day.entries, newEntry] })
      )
    );
  }, [setNutritionLogs]);

  const addMultipleMealEntries = useCallback((
    date: string,
    entries: Array<Omit<MealEntry, "id" | "calories" | "protein" | "carbs" | "fat"> & { amount: number }>
  ) => {
    const newEntries: MealEntry[] = entries.map((entry) => {
      const nuts = calculateNutrients(entry.food, entry.amount);
      return {
        id: generateId(),
        mealType: entry.mealType,
        food: entry.food,
        amount: entry.amount,
        calories: nuts.calories,
        protein: nuts.protein,
        carbs: nuts.carbs,
        fat: nuts.fat,
        loggedAt: entry.loggedAt || new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      };
    });

    setNutritionLogs((prev) => appendMealEntries(prev, date, newEntries));
  }, [setNutritionLogs]);

  const removeMealEntry = useCallback((date: string, entryId: string) => {
    setNutritionLogs((prev) =>
      prev.map((log) => {
        if (log.date !== date) return log;
        return {
          ...log,
          entries: log.entries.filter((e) => e.id !== entryId),
        };
      })
    );
  }, [setNutritionLogs]);

  const updateMealEntryAmount = useCallback((date: string, entryId: string, newAmount: number) => {
    setNutritionLogs((prev) =>
      prev.map((log) => {
        if (log.date !== date) return log;
        return {
          ...log,
          entries: log.entries.map((e) => {
            if (e.id !== entryId) return e;
            const nuts = calculateNutrients(e.food, newAmount);
            return {
              ...e,
              amount: newAmount,
              calories: nuts.calories,
              protein: nuts.protein,
              carbs: nuts.carbs,
              fat: nuts.fat,
            };
          }),
        };
      })
    );
  }, [setNutritionLogs]);

  const quickAddCalories = useCallback((
    date: string,
    mealType: MealType,
    name: string,
    calories: number,
    protein: number,
    carbs: number = 0,
    fat: number = 0
  ) => {
    const customItem: FoodItem = {
      id: generateId(),
      name: name.trim() || "Schnelleintrag",
      caloriesPer100g: calories,
      proteinPer100g: protein,
      carbsPer100g: carbs,
      fatPer100g: fat,
      isCustom: true,
    };
    const newEntry: MealEntry = {
      id: generateId(),
      mealType,
      food: customItem,
      amount: 100, // 1 portion
      calories,
      protein,
      carbs,
      fat,
      loggedAt: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };

    setNutritionLogs((prev) =>
      upsertNutritionDay(
        prev,
        date,
        () => ({ date, entries: [newEntry], waterMl: 0 }),
        (day) => ({ ...day, entries: [...day.entries, newEntry] })
      )
    );
  }, [setNutritionLogs]);

  const addWaterIntake = useCallback((date: string, amountMl: number) => {
    setNutritionLogs((prev) =>
      upsertNutritionDay(
        prev,
        date,
        () => ({ date, entries: [], waterMl: Math.max(0, amountMl) }),
        (day) => ({ ...day, waterMl: Math.max(0, (day.waterMl || 0) + amountMl) })
      )
    );
  }, [setNutritionLogs]);

  const saveCustomFood = useCallback((food: FoodItem) => {
    setCustomFoods((prev) => {
      const exists = prev.some((f) => f.id === food.id);
      return exists ? prev.map((f) => (f.id === food.id ? food : f)) : [food, ...prev];
    });
  }, [setCustomFoods]);

  const deleteCustomFood = useCallback((id: string) => {
    setCustomFoods((prev) => prev.filter((f) => f.id !== id));
  }, [setCustomFoods]);

  return {
    nutritionLogs,
    nutritionGoals,
    setNutritionGoals,
    addMealEntry,
    addMultipleMealEntries,
    removeMealEntry,
    updateMealEntryAmount,
    quickAddCalories,
    addWaterIntake,
    customFoods,
    saveCustomFood,
    deleteCustomFood,
  };
}
