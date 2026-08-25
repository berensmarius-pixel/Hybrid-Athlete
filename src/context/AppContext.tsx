"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type {
  AppContextValue,
  ViewId,
  LoggedSession,
  DayPlan,
  GymTemplate,
  EnduranceTemplate,
  ActiveSession,
  ChatMessage,
  PersonalRecord,
  CoachMemory,
  GymSession,
  BodyWeightEntry,
  BodyCompositionEntry,
  FoodItem,
  MealType,
  MealEntry,
  DailyNutritionGoal,
  DailyNutritionLog,
  GarminDailyHealth,
  GarminActivity,
} from "@/types";
import { DEFAULT_WEEKLY_PLAN, STORAGE_KEY } from "@/data/weeklyPlan";
import { DEFAULT_GYM_TEMPLATES, DEFAULT_ENDURANCE_TEMPLATES, TEMPLATES_STORAGE_KEY, ENDURANCE_TEMPLATES_KEY } from "@/data/gymTemplates";
import { generateId, getLocalDateString } from "@/lib/utils";
import { calculateNutrients } from "@/lib/nutritionApi";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  applyServerValue,
  hydrateFromServer,
  readStoredJson,
  writeState,
} from "@/lib/persistence/stateStore";
import {
  getDefaultGarminHealth,
  GARMIN_HEALTH_STORAGE_KEY,
  GARMIN_ACTIVITIES_STORAGE_KEY,
  checkGarminConnectionStatus,
  syncRealGarminData,
} from "@/lib/garmin/garminService";

const CHAT_STORAGE_KEY = "hybrid_athlete_chat";
const ACTIVE_SESSION_KEY = "hybrid_athlete_active_session";
const SESSIONS_STORAGE_KEY = "hybrid_athlete_sessions";
const PR_STORAGE_KEY = "hybrid_athlete_prs";
const COACH_MEMORY_KEY = "hybrid_athlete_coach_memory";
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
};

// ─── PR calculation ───────────────────────────────────────────────────────────

/** Epley formula: weight * (1 + reps / 30) */
function epley1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function detectNewPRs(
  session: GymSession,
  existing: PersonalRecord[]
): PersonalRecord[] {
  const newPRs: PersonalRecord[] = [];

  for (const entry of session.entries) {
    const name = entry.exercise.trim();
    if (!name) continue;

    const currentBest = existing.find(
      (pr) => pr.exerciseName.toLowerCase() === name.toLowerCase()
    );

    for (const set of entry.sets) {
      if (!set.isCompleted) continue;
      const w = Number(set.weight);
      const r = Number(set.reps);
      if (!w || !r) continue;

      const e1rm = epley1RM(w, r);
      const prev1rm = currentBest?.estimated1RM ?? 0;

      if (e1rm > prev1rm) {
        // Check if we already added a better PR for this exercise this session
        const idx = newPRs.findIndex(
          (p) => p.exerciseName.toLowerCase() === name.toLowerCase()
        );
        const pr: PersonalRecord = {
          exerciseName: name,
          estimated1RM: e1rm,
          bestWeight: w,
          bestReps: r,
          date: session.date,
        };
        if (idx >= 0) {
          if (e1rm > newPRs[idx].estimated1RM) newPRs[idx] = pr;
        } else {
          newPRs.push(pr);
        }
      }
    }
  }

  return newPRs;
}

/** Fügt neue PRs in den Bestandsstand ein (pure). */
function mergePRs(existing: PersonalRecord[], detected: PersonalRecord[]): PersonalRecord[] {
  const next = [...existing];
  for (const pr of detected) {
    const idx = next.findIndex(
      (p) => p.exerciseName.toLowerCase() === pr.exerciseName.toLowerCase()
    );
    if (idx >= 0) next[idx] = pr;
    else next.push(pr);
  }
  return next;
}

// ─── Validators (Hydratation aus localStorage) ────────────────────────────────

function validateChatMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((m): m is ChatMessage => !!m && typeof m.id === "string" && typeof m.text === "string")
    .map((m) => ({ ...m, timestamp: new Date(m.timestamp as unknown as string) }));
}

/**
 * Base64-Fotos werden NICHT persistiert (sprengen die Quota) – hochgeladene
 * Bilder liegen im Storage-Bucket und werden als Proxy-URL geführt.
 */
function stripChatImagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (!m.images || m.images.length === 0) return m;
    const persistable = m.images.filter((img) => img.startsWith("/"));
    return { ...m, images: persistable.length > 0 ? persistable : undefined };
  });
}

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

// ─── Sessions reducer ─────────────────────────────────────────────────────────

type SessionAction =
  | { type: "ADD"; session: LoggedSession }
  | { type: "ADD_MANY"; sessions: LoggedSession[] }
  | { type: "INIT"; sessions: LoggedSession[] };

/**
 * ADD / ADD_MANY ignorieren Sessions mit bereits vorhandener ID.
 * Das verhindert die historische Doppel-Import-Schwelle beim Strava-Sync
 * und heilt bestehende Duplikate beim INIT.
 */
function sessionsReducer(state: LoggedSession[], action: SessionAction): LoggedSession[] {
  switch (action.type) {
    case "ADD": {
      if (state.some((s) => s.id === action.session.id)) return state;
      return [action.session, ...state];
    }
    case "ADD_MANY": {
      const seen = new Set(state.map((s) => s.id));
      const fresh = action.sessions.filter((s) => s?.id && !seen.has(s.id));
      if (fresh.length === 0) return state;
      return [...fresh, ...state];
    }
    case "INIT": {
      const seen = new Set<string>();
      const deduped = action.sessions.filter((s) => {
        if (!s?.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      return deduped;
    }
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [loggedSessions, dispatch] = useReducer(sessionsReducer, []);
  const sessionsLoadedRef = useRef(false);
  const { plan: weeklyPlan, updatePlan: updateWeeklyPlan } = useWeeklyPlan();
  const { templates: gymTemplates, saveTemplate: saveGymTemplate, deleteTemplate: deleteGymTemplate } = useGymTemplates();
  const { templates: enduranceTemplates, saveTemplate: saveEnduranceTemplate, deleteTemplate: deleteEnduranceTemplate } = useEnduranceTemplates();

  const [activeSession, setActiveSession] = usePersistentState<ActiveSession | null>(
    ACTIVE_SESSION_KEY,
    null
  );

  // Kein Mock-Seed mehr: der Chat startet leer, echte Historie kommt aus dem Storage.
  const [chatMessages, setChatMessages] = usePersistentState<ChatMessage[]>(
    CHAT_STORAGE_KEY,
    [],
    { validate: validateChatMessages, transformForStorage: stripChatImagesForStorage }
  );

  const [personalRecords, setPersonalRecords] = usePersistentState<PersonalRecord[]>(
    PR_STORAGE_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as PersonalRecord[]) : null) }
  );

  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const [coachMemories, setCoachMemories] = usePersistentState<CoachMemory[]>(
    COACH_MEMORY_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as CoachMemory[]) : null) }
  );
  const [bodyWeightLog, setBodyWeightLog] = usePersistentState<BodyWeightEntry[]>(
    BODY_WEIGHT_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as BodyWeightEntry[]) : null) }
  );
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
  const [garminHealthLogs, setGarminHealthLogs] = usePersistentState<
    Record<string, GarminDailyHealth>
  >(GARMIN_HEALTH_STORAGE_KEY, {}, {
    validate: (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const parsed = raw as Record<string, GarminDailyHealth>;
      const todayStr = getLocalDateString();
      if (!parsed[todayStr]) {
        parsed[todayStr] = getDefaultGarminHealth(todayStr);
      }
      return parsed;
    },
  });
  const [garminActivities, setGarminActivities] = usePersistentState<GarminActivity[]>(
    GARMIN_ACTIVITIES_STORAGE_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as GarminActivity[]) : null) }
  );

  // Load persisted sessions (einmalig): zuerst localStorage-Cache, dann
  // Server-Merge via /api/state – gleiche Semantik wie usePersistentState.
  useEffect(() => {
    let cancelled = false;

    const stored = readStoredJson<LoggedSession[] | null>(SESSIONS_STORAGE_KEY, null);
    if (Array.isArray(stored)) {
      dispatch({ type: "INIT", sessions: stored });
    }
    sessionsLoadedRef.current = true;

    void hydrateFromServer([SESSIONS_STORAGE_KEY]).then((serverValues) => {
      if (cancelled) return;
      const serverVal = serverValues.get(SESSIONS_STORAGE_KEY);
      if (!Array.isArray(serverVal)) return;
      // Server gewinnt – außer es gibt pending lokale Änderungen
      if (!applyServerValue(SESSIONS_STORAGE_KEY, serverVal)) return;
      dispatch({ type: "INIT", sessions: serverVal as LoggedSession[] });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist sessions after every change (post-hydration)
  useEffect(() => {
    if (!sessionsLoadedRef.current) return;
    writeState(SESSIONS_STORAGE_KEY, loggedSessions);
  }, [loggedSessions]);

  const addSessions = useCallback((sessions: LoggedSession[]) => {
    if (!sessions.length) return;
    dispatch({ type: "ADD_MANY", sessions });
  }, []);

  const addSession = useCallback(
    (session: LoggedSession) => {
      // PR-Erkennung außerhalb von setState-Updatern (React-konform)
      if (session.kind === "gym") {
        const detected = detectNewPRs(session as GymSession, personalRecords);
        if (detected.length > 0) {
          setNewPRs(detected);
          setPersonalRecords(mergePRs(personalRecords, detected));
        }
      }
      dispatch({ type: "ADD", session });
    },
    [personalRecords, setPersonalRecords]
  );

  const addCoachMemory = useCallback(
    (content: string) => {
      const memory: CoachMemory = {
        id: generateId(),
        content,
        createdAt: new Date().toISOString(),
      };
      setCoachMemories((prev) => [memory, ...prev]);
    },
    [setCoachMemories]
  );

  const deleteCoachMemory = useCallback(
    (id: string) => {
      setCoachMemories((prev) => prev.filter((m) => m.id !== id));
    },
    [setCoachMemories]
  );

  const clearNewPRs = useCallback(() => setNewPRs([]), []);

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

  // ─── Nutrition Actions ───────────────────────────────────────────────────────

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

    setNutritionLogs((prev) => {
      const existingDayIdx = prev.findIndex((log) => log.date === date);
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updatedDay: DailyNutritionLog = {
          ...currentDay,
          entries: [...currentDay.entries, newEntry],
        };
        const updated = [...prev];
        updated[existingDayIdx] = updatedDay;
        return updated;
      }
      return [{ date, entries: [newEntry], waterMl: 0 }, ...prev];
    });
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

    setNutritionLogs((prev) => {
      const existingDayIdx = prev.findIndex((log) => log.date === date);
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updatedDay: DailyNutritionLog = {
          ...currentDay,
          entries: [...currentDay.entries, ...newEntries],
        };
        const updated = [...prev];
        updated[existingDayIdx] = updatedDay;
        return updated;
      }
      return [{ date, entries: newEntries, waterMl: 0 }, ...prev];
    });
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

    setNutritionLogs((prev) => {
      const existingDayIdx = prev.findIndex((log) => log.date === date);
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updated = [...prev];
        updated[existingDayIdx] = {
          ...currentDay,
          entries: [...currentDay.entries, newEntry],
        };
        return updated;
      }
      return [{ date, entries: [newEntry], waterMl: 0 }, ...prev];
    });
  }, [setNutritionLogs]);

  const addWaterIntake = useCallback((date: string, amountMl: number) => {
    setNutritionLogs((prev) => {
      const existingDayIdx = prev.findIndex((log) => log.date === date);
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updated = [...prev];
        updated[existingDayIdx] = {
          ...currentDay,
          waterMl: Math.max(0, (currentDay.waterMl || 0) + amountMl),
        };
        return updated;
      }
      return [{ date, entries: [], waterMl: Math.max(0, amountMl) }, ...prev];
    });
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

  // ─── Garmin Actions ──────────────────────────────────────────────────────────

  const updateGarminHealth = useCallback((date: string, partial: Partial<GarminDailyHealth>) => {
    setGarminHealthLogs((prev) => {
      const existing = prev[date] || getDefaultGarminHealth(date);
      const updated = {
        ...existing,
        ...partial,
        lastSyncedAt: new Date().toISOString(),
      };
      return { ...prev, [date]: updated };
    });
  }, [setGarminHealthLogs]);

  const addGarminActivity = useCallback((activity: GarminActivity) => {
    setGarminActivities((prev) => {
      const exists = prev.some((a) => a.id === activity.id);
      return exists ? prev.map((a) => (a.id === activity.id ? activity : a)) : [activity, ...prev];
    });

    // Also automatically update today's active calories burned
    const activityDate = activity.startTime.split("T")[0];
    if (activity.caloriesBurned > 0) {
      updateGarminHealth(activityDate, {
        activeCaloriesBurned: (garminHealthLogs[activityDate]?.activeCaloriesBurned || 500) + activity.caloriesBurned,
      });
    }
  }, [garminHealthLogs, updateGarminHealth, setGarminActivities]);

  // ─── Automatic Background Garmin Sync ───────────────────────────────────────
  // Interval hängt NICHT von garminHealthLogs ab (früher: Teardown bei jedem Write).
  const lastAutoSyncRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    async function autoSyncGarmin() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const isConnected = await checkGarminConnectionStatus();
        if (!isConnected || !isMounted) return;

        const now = Date.now();
        if (now - lastAutoSyncRef.current <= 15 * 60 * 1000) return;

        lastAutoSyncRef.current = now;
        const todayStr = getLocalDateString();
        const res = await syncRealGarminData(todayStr);
        if (res.success && res.health && isMounted) {
          updateGarminHealth(todayStr, res.health);
          if (res.activities && res.activities.length > 0) {
            setGarminActivities(res.activities);
          }
        }
      } catch { /* still silent: Netzwerkfehler sind hier erwartbar */ }
    }

    const timer = setTimeout(autoSyncGarmin, 2000);
    const interval = setInterval(autoSyncGarmin, 30 * 60 * 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [updateGarminHealth, setGarminActivities]);

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
          importMultipleBodyCompositionEntries(data.measurements);
        }
      } catch {}
    }

    const timer = setTimeout(fetchPiScaleMeasurements, 1500);
    const interval = setInterval(fetchPiScaleMeasurements, 30 * 1000);
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
  }, [importMultipleBodyCompositionEntries]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      activeView,
      setActiveView,
      loggedSessions,
      addSession,
      addSessions,
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
      chatMessages,
      setChatMessages,
      personalRecords,
      coachMemories,
      addCoachMemory,
      deleteCoachMemory,
      newPRs,
      clearNewPRs,
      bodyWeightLog,
      addBodyWeight,
      importMultipleBodyCompositionEntries,
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
      garminHealthLogs,
      updateGarminHealth,
      garminActivities,
      addGarminActivity,
    }),
    [
      activeView,
      setActiveView,
      loggedSessions,
      addSession,
      addSessions,
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
      chatMessages,
      setChatMessages,
      personalRecords,
      coachMemories,
      addCoachMemory,
      deleteCoachMemory,
      newPRs,
      clearNewPRs,
      bodyWeightLog,
      addBodyWeight,
      importMultipleBodyCompositionEntries,
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
      garminHealthLogs,
      updateGarminHealth,
      garminActivities,
      addGarminActivity,
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
