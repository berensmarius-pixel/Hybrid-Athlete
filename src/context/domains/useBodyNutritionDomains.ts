"use client";

import { useCallback, useEffect, useRef } from "react";
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
import { hydrateFromServer } from "@/lib/persistence/stateStore";
import {
  hydrateWeightFromCache,
  recordBodyWeightMutation,
} from "@/lib/offline/syncEngine";

/**
 * Domänen Körper & Ernährung: Körperdaten-Logs, Ernährungs-Tagebuch,
 * Ziele und Custom-Foods inklusive aller Aktionen.
 *
 * Körpergewicht läuft offline-first: Mutationen werden in die
 * IndexedDB-Sync-Queue geschrieben und beim nächsten Online-Event
 * automatisch ans Cloud-Backend geflusht.
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

  // ── Offline-Sync-Verdrahtung ────────────────────────────────────────────────
  const syncReadyRef = useRef(false);
  const prevJsonRef = useRef<string | null>(null);
  const serverMirrorRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Server-Stand beobachten (batched GET, kein Extra-Request) und als
    // Echo-Marker nutzen; nur wenn der Server nichts hat, wird der
    // IndexedDB-Cache wiederhergestellt (Offline-First ohne Clobber-Risiko).
    void hydrateFromServer([BODY_WEIGHT_KEY]).then((serverValues) => {
      if (cancelled) return;
      const serverVal = serverValues.get(BODY_WEIGHT_KEY);
      if (Array.isArray(serverVal)) {
        try { serverMirrorRef.current = JSON.stringify(serverVal); } catch { /* ignore */ }
        return;
      }
      void hydrateWeightFromCache().then((cached) => {
        if (!cancelled || !cached || cached.length === 0) return;
        try {
          if (window.localStorage.getItem(BODY_WEIGHT_KEY) != null) return;
        } catch { /* ignore */ }
        setBodyWeightLog((prev) =>
          prev.length > 0 ? prev : cached
        );
      });
    });

    const timer = window.setTimeout(() => {
      syncReadyRef.current = true;
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setBodyWeightLog]);

  useEffect(() => {
    let json: string | null = null;
    try {
      json = JSON.stringify(bodyWeightLog);
    } catch { /* ignore */ }

    if (!syncReadyRef.current) {
      // Hydratations-Fenster: bekannte Stände merken, nichts senden
      prevJsonRef.current = json;
      return;
    }
    if (json !== null && serverMirrorRef.current === json) {
      serverMirrorRef.current = null;
      prevJsonRef.current = json;
      return;
    }
    if (json === prevJsonRef.current) return;
    prevJsonRef.current = json;
    if (json !== null) void recordBodyWeightMutation(bodyWeightLog);
  }, [bodyWeightLog]);

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
