"use client";

/**
 * Zentraler App-Context.
 *
 * Die Implementierung liegt in Domänen-Hooks (src/context/domains/*):
 *  - useSessionsDomain   → Sessions + PRs
 *  - useBodyDomain       → Körpergewicht/-zusammensetzung
 *  - useNutritionDomain  → Ernährungs-Tagebuch, Ziele, Custom-Foods
 *  - useCoachDomain      → Chat-Historie (mit Cap) + Coach-Gedächtnis
 *  - useGarminDomain     → Garmin-Vitaldaten + Activities + Auto-Sync
 *
 * `useApp()` liefert weiterhin die komplette API – bestehende Konsumenten
 * bleiben unverändert und migrieren schrittweise auf Selektor-Hooks.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
} from "react";
import type { AppContextValue, ViewId, ActiveSession } from "@/types";
import { DEFAULT_WEEKLY_PLAN, STORAGE_KEY } from "@/data/weeklyPlan";
import {
  DEFAULT_GYM_TEMPLATES,
  DEFAULT_ENDURANCE_TEMPLATES,
  TEMPLATES_STORAGE_KEY,
  ENDURANCE_TEMPLATES_KEY,
} from "@/data/gymTemplates";
import type { DayPlan, GymTemplate, EnduranceTemplate } from "@/types";
import { usePersistentState } from "@/hooks/usePersistentState";

import { useSessionsDomain } from "./domains/useSessionsDomain";
import {
  useBodyDomain,
  useNutritionDomain,
  DEFAULT_NUTRITION_GOAL,
} from "./domains/useBodyNutritionDomains";
import { useCoachDomain, useGarminDomain } from "./domains/useCoachGarminDomains";
import { usePantryDomain } from "./domains/usePantryDomain";

export { DEFAULT_NUTRITION_GOAL };

const ACTIVE_SESSION_KEY = "hybrid_athlete_active_session";

// ─── Weekly plan hook ─────────────────────────────────────────────────────────

export function useWeeklyPlan() {
  const [plan, setPlan] = usePersistentState<DayPlan[]>(STORAGE_KEY, DEFAULT_WEEKLY_PLAN, {
    validate: (raw) =>
      Array.isArray(raw) && raw.length === 7 ? (raw as DayPlan[]) : null,
  });
  return { plan, updatePlan: setPlan };
}

// ─── Gym templates hook ───────────────────────────────────────────────────────

function migrateGymTemplates(raw: unknown): GymTemplate[] | null {
  if (!Array.isArray(raw)) return null;
  const migrated = (raw as GymTemplate[]).map((t) => ({
    ...t,
    type: t.type ?? ("gym" as const),
    exercises: (t.exercises ?? []).map((ex) => {
      if (!ex.sets && ex.targetSets) {
        const newSets = Array.from({ length: ex.targetSets }).map((_, i) => ({
          id: `${ex.id}-set-${i}`,
          type: "working" as const,
          targetReps: ex.targetReps,
        }));
        return { ...ex, sets: newSets };
      }
      return ex;
    }),
  }));
  // Seed any missing default templates (e.g. newly added Upper Pull)
  for (const def of DEFAULT_GYM_TEMPLATES) {
    if (!migrated.some((t) => t.id === def.id)) migrated.push(def);
  }
  return migrated;
}

export function useGymTemplates() {
  const [templates, setTemplates] = usePersistentState<GymTemplate[]>(
    TEMPLATES_STORAGE_KEY,
    DEFAULT_GYM_TEMPLATES,
    { validate: migrateGymTemplates }
  );
  const saveTemplate = useCallback(
    (template: GymTemplate) =>
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === template.id);
        return exists
          ? prev.map((t) => (t.id === template.id ? template : t))
          : [...prev, template];
      }),
    [setTemplates]
  );
  return {
    templates,
    saveTemplate,
    deleteTemplate: useCallback(
      (id: string) => setTemplates((prev) => prev.filter((t) => t.id !== id)),
      [setTemplates]
    ),
  };
}

// ─── Endurance templates hook ─────────────────────────────────────────────────

function migrateEnduranceTemplates(raw: unknown): EnduranceTemplate[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const merged = [...(raw as EnduranceTemplate[])];
  for (const def of DEFAULT_ENDURANCE_TEMPLATES) {
    if (!merged.some((t) => t.id === def.id)) merged.push(def);
  }
  return merged;
}

export function useEnduranceTemplates() {
  const [templates, setTemplates] = usePersistentState<EnduranceTemplate[]>(
    ENDURANCE_TEMPLATES_KEY,
    DEFAULT_ENDURANCE_TEMPLATES,
    { validate: migrateEnduranceTemplates }
  );
  const saveTemplate = useCallback(
    (template: EnduranceTemplate) =>
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === template.id);
        return exists
          ? prev.map((t) => (t.id === template.id ? template : t))
          : [...prev, template];
      }),
    [setTemplates]
  );
  return {
    templates,
    saveTemplate,
    deleteTemplate: useCallback(
      (id: string) => setTemplates((prev) => prev.filter((t) => t.id !== id)),
      [setTemplates]
    ),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

/** Intervall des Pi-Waagen-Polls: 3 Minuten statt 30 s (Batterie/Daten sparen). */
const SCALE_POLL_INTERVAL_MS = 3 * 60 * 1000;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");

  // ── Domänen ────────────────────────────────────────────────────────────────
  const sessions = useSessionsDomain();
  const body = useBodyDomain();
  const nutrition = useNutritionDomain();
  const coach = useCoachDomain();
  const garmin = useGarminDomain();
  const pantry = usePantryDomain();

  const { plan: weeklyPlan, updatePlan: updateWeeklyPlan } = useWeeklyPlan();
  const { templates: gymTemplates, saveTemplate: saveGymTemplate, deleteTemplate: deleteGymTemplate } = useGymTemplates();
  const { templates: enduranceTemplates, saveTemplate: saveEnduranceTemplate, deleteTemplate: deleteEnduranceTemplate } = useEnduranceTemplates();

  const [activeSession, setActiveSession] = usePersistentState<ActiveSession | null>(
    ACTIVE_SESSION_KEY,
    null
  );

  // ─── Automatic Pi Scale Webhook Sync ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchPiScaleMeasurements() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/scale/webhook");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.measurements) && data.measurements.length > 0) {
          body.importMultipleBodyCompositionEntries(data.measurements);
        }
      } catch {}
    }

    const timer = setTimeout(fetchPiScaleMeasurements, 1500);
    const interval = setInterval(fetchPiScaleMeasurements, SCALE_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchPiScaleMeasurements();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      activeView,
      setActiveView,
      loggedSessions: sessions.loggedSessions,
      addSession: sessions.addSession,
      addSessions: sessions.addSessions,
      weeklyPlan,
      updateWeeklyPlan,
      gymTemplates,
      saveGymTemplate,
      deleteGymTemplate,
      enduranceTemplates,
      saveEnduranceTemplate,
      deleteEnduranceTemplate,
      activeSession,
      setActiveSession,
      chatMessages: coach.chatMessages,
      setChatMessages: coach.setChatMessages,
      personalRecords: sessions.personalRecords,
      coachMemories: coach.coachMemories,
      addCoachMemory: coach.addCoachMemory,
      deleteCoachMemory: coach.deleteCoachMemory,
      newPRs: sessions.newPRs,
      clearNewPRs: sessions.clearNewPRs,
      bodyWeightLog: body.bodyWeightLog,
      addBodyWeight: body.addBodyWeight,
      importMultipleBodyCompositionEntries: body.importMultipleBodyCompositionEntries,
      nutritionLogs: nutrition.nutritionLogs,
      nutritionGoals: nutrition.nutritionGoals,
      setNutritionGoals: nutrition.setNutritionGoals,
      addMealEntry: nutrition.addMealEntry,
      addMultipleMealEntries: nutrition.addMultipleMealEntries,
      removeMealEntry: nutrition.removeMealEntry,
      updateMealEntryAmount: nutrition.updateMealEntryAmount,
      quickAddCalories: nutrition.quickAddCalories,
      addWaterIntake: nutrition.addWaterIntake,
      customFoods: nutrition.customFoods,
      saveCustomFood: nutrition.saveCustomFood,
      deleteCustomFood: nutrition.deleteCustomFood,
      pantryItems: pantry.pantryItems,
      addPantryItem: pantry.addPantryItem,
      updatePantryItem: pantry.updatePantryItem,
      removePantryItem: pantry.removePantryItem,
      consumePantryItems: pantry.consumePantryItems,
      garminHealthLogs: garmin.garminHealthLogs,
      updateGarminHealth: garmin.updateGarminHealth,
      garminActivities: garmin.garminActivities,
      addGarminActivity: garmin.addGarminActivity,
    }),
    [
      activeView,
      sessions.loggedSessions,
      sessions.addSession,
      sessions.addSessions,
      weeklyPlan,
      updateWeeklyPlan,
      gymTemplates,
      saveGymTemplate,
      deleteGymTemplate,
      enduranceTemplates,
      saveEnduranceTemplate,
      deleteEnduranceTemplate,
      activeSession,
      setActiveSession,
      coach.chatMessages,
      coach.setChatMessages,
      coach.coachMemories,
      coach.addCoachMemory,
      coach.deleteCoachMemory,
      sessions.personalRecords,
      sessions.newPRs,
      sessions.clearNewPRs,
      body.bodyWeightLog,
      body.addBodyWeight,
      body.importMultipleBodyCompositionEntries,
      nutrition.nutritionLogs,
      nutrition.nutritionGoals,
      nutrition.setNutritionGoals,
      nutrition.addMealEntry,
      nutrition.addMultipleMealEntries,
      nutrition.removeMealEntry,
      nutrition.updateMealEntryAmount,
      nutrition.quickAddCalories,
      nutrition.addWaterIntake,
      nutrition.customFoods,
      nutrition.saveCustomFood,
      nutrition.deleteCustomFood,
      pantry.pantryItems,
      pantry.addPantryItem,
      pantry.updatePantryItem,
      pantry.removePantryItem,
      pantry.consumePantryItems,
      garmin.garminHealthLogs,
      garmin.updateGarminHealth,
      garmin.garminActivities,
      garmin.addGarminActivity,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
