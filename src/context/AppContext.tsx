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
import { DEFAULT_GYM_TEMPLATES, TEMPLATES_STORAGE_KEY } from "@/data/gymTemplates";
import { MOCK_MESSAGES } from "@/data/mockMessages";
import { generateId } from "@/lib/utils";
import { calculateNutrients } from "@/lib/nutritionApi";
import {
  getDefaultGarminHealth,
  GARMIN_HEALTH_STORAGE_KEY,
  GARMIN_ACTIVITIES_STORAGE_KEY,
  checkGarminConnectionStatus,
  syncRealGarminData,
} from "@/lib/garmin/garminService";

const ENDURANCE_TEMPLATES_KEY = "hybrid_athlete_endurance_templates";
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
  carbs: 280,
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

// ─── Weekly plan hook ─────────────────────────────────────────────────────────

export function useWeeklyPlan() {
  const [plan, setPlan] = useState<DayPlan[]>(DEFAULT_WEEKLY_PLAN);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DayPlan[];
        if (Array.isArray(parsed) && parsed.length === 7) setPlan(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  const updatePlan = useCallback((newPlan: DayPlan[]) => {
    setPlan(newPlan);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newPlan)); } catch { /* ignore */ }
  }, []);

  return { plan, updatePlan };
}

// ─── Gym templates hook ───────────────────────────────────────────────────────

export function useGymTemplates() {
  const [templates, setTemplates] = useState<GymTemplate[]>(DEFAULT_GYM_TEMPLATES);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GymTemplate[];
        if (Array.isArray(parsed)) {
          const migrated = parsed.map(t => ({
            ...t,
            type: t.type ?? "gym" as const,
            exercises: t.exercises.map(ex => {
              if (!ex.sets && ex.targetSets) {
                const newSets = Array.from({ length: ex.targetSets }).map((_, i) => ({
                  id: `${ex.id}-set-${i}`,
                  type: "working" as const,
                  targetReps: ex.targetReps
                }));
                return { ...ex, sets: newSets };
              }
              return ex;
            })
          }));
          // Seed any missing default templates (e.g. newly added Upper Pull)
          for (const def of DEFAULT_GYM_TEMPLATES) {
            if (!migrated.some(t => t.id === def.id)) migrated.push(def);
          }
          setTemplates(migrated);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const saveTemplate = useCallback((template: GymTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === template.id);
      const next = exists
        ? prev.map((t) => (t.id === template.id ? template : t))
        : [...prev, template];
      try { localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      try { localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { templates, saveTemplate, deleteTemplate };
}

// ─── Endurance templates hook ─────────────────────────────────────────────────

export function useEnduranceTemplates() {
  const [templates, setTemplates] = useState<EnduranceTemplate[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ENDURANCE_TEMPLATES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as EnduranceTemplate[];
        if (Array.isArray(parsed)) setTemplates(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  const saveTemplate = useCallback((template: EnduranceTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === template.id);
      const next = exists
        ? prev.map((t) => (t.id === template.id ? template : t))
        : [...prev, template];
      try { localStorage.setItem(ENDURANCE_TEMPLATES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      try { localStorage.setItem(ENDURANCE_TEMPLATES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { templates, saveTemplate, deleteTemplate };
}

// ─── Sessions reducer ─────────────────────────────────────────────────────────

type SessionAction = { type: "ADD"; session: LoggedSession } | { type: "INIT"; sessions: LoggedSession[] };

function sessionsReducer(state: LoggedSession[], action: SessionAction): LoggedSession[] {
  if (action.type === "ADD") return [action.session, ...state];
  if (action.type === "INIT") return action.sessions;
  return state;
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
  const [activeSession, setActiveSessionState] = useState<ActiveSession | null>(null);
  const [chatMessages, setChatMessagesState] = useState<ChatMessage[]>(
    MOCK_MESSAGES.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }))
  );
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const [coachMemories, setCoachMemories] = useState<CoachMemory[]>([]);
  const [bodyWeightLog, setBodyWeightLog] = useState<BodyWeightEntry[]>([]);
  const [nutritionLogs, setNutritionLogs] = useState<DailyNutritionLog[]>([]);
  const [nutritionGoals, setNutritionGoalsState] = useState<DailyNutritionGoal>(DEFAULT_NUTRITION_GOAL);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  const [garminHealthLogs, setGarminHealthLogs] = useState<Record<string, GarminDailyHealth>>({});
  const [garminActivities, setGarminActivities] = useState<GarminActivity[]>([]);

  // Load persisted Garmin health
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GARMIN_HEALTH_STORAGE_KEY);
      const todayStr = new Date().toISOString().split("T")[0];
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, GarminDailyHealth>;
        if (parsed && typeof parsed === "object") {
          if (!parsed[todayStr]) {
            parsed[todayStr] = getDefaultGarminHealth(todayStr);
          }
          setGarminHealthLogs(parsed);
          return;
        }
      }
      // Initialize default today if nothing stored
      const initial = { [todayStr]: getDefaultGarminHealth(todayStr) };
      setGarminHealthLogs(initial);
      localStorage.setItem(GARMIN_HEALTH_STORAGE_KEY, JSON.stringify(initial));
    } catch { /* ignore */ }
  }, []);

  // Load persisted Garmin activities
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GARMIN_ACTIVITIES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GarminActivity[];
        if (Array.isArray(parsed)) setGarminActivities(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted sessions
  useEffect(() => {
    if (sessionsLoadedRef.current) return;
    sessionsLoadedRef.current = true;
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LoggedSession[];
        if (Array.isArray(parsed)) {
          dispatch({ type: "INIT", sessions: parsed });
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted personal records
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PR_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PersonalRecord[];
        if (Array.isArray(parsed)) setPersonalRecords(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted coach memories
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COACH_MEMORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CoachMemory[];
        if (Array.isArray(parsed)) setCoachMemories(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted body weight log
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BODY_WEIGHT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BodyWeightEntry[];
        if (Array.isArray(parsed)) setBodyWeightLog(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted nutrition logs
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NUTRITION_LOGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DailyNutritionLog[];
        if (Array.isArray(parsed)) setNutritionLogs(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted nutrition goals
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NUTRITION_GOALS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DailyNutritionGoal;
        if (parsed && typeof parsed.calories === "number") setNutritionGoalsState(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted custom foods
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_FOODS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FoodItem[];
        if (Array.isArray(parsed)) setCustomFoods(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted active session
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (stored) {
        setActiveSessionState(JSON.parse(stored));
      }
    } catch { /* ignore */ }
  }, []);

  // Load persisted chat
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setChatMessagesState(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
        }
      }
    } catch { /* ignore */ }
  }, []);

  const setActiveSession = useCallback((session: ActiveSession | null) => {
    setActiveSessionState(session);
    try {
      if (session) {
        localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const setChatMessages = useCallback((messages: ChatMessage[]) => {
    setChatMessagesState(messages);
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch { /* ignore */ }
  }, []);

  const addSession = useCallback(
    (session: LoggedSession) => {
      dispatch({ type: "ADD", session });

      // Persist sessions to localStorage
      setPersonalRecords((prevPRs) => {
        let updatedPRs = prevPRs;

        // PR detection only for gym sessions
        if (session.kind === "gym") {
          const detected = detectNewPRs(session as GymSession, prevPRs);
          if (detected.length > 0) {
            setNewPRs(detected);
            // Merge into existing PRs
            updatedPRs = [...prevPRs];
            for (const pr of detected) {
              const idx = updatedPRs.findIndex(
                (p) => p.exerciseName.toLowerCase() === pr.exerciseName.toLowerCase()
              );
              if (idx >= 0) {
                updatedPRs[idx] = pr;
              } else {
                updatedPRs.push(pr);
              }
            }
            try { localStorage.setItem(PR_STORAGE_KEY, JSON.stringify(updatedPRs)); } catch { /* ignore */ }
          }
        }

        return updatedPRs;
      });

      // Persist all sessions (we need access to current + new)
      // Use a timeout to let the reducer run first
      setTimeout(() => {
        try {
          const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
          const existing: LoggedSession[] = stored ? JSON.parse(stored) : [];
          const next = [session, ...existing];
          localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
        } catch { /* ignore */ }
      }, 0);
    },
    []
  );

  const addCoachMemory = useCallback((content: string) => {
    setCoachMemories((prev) => {
      const memory: CoachMemory = {
        id: generateId(),
        content,
        createdAt: new Date().toISOString(),
      };
      const next = [memory, ...prev];
      try { localStorage.setItem(COACH_MEMORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const deleteCoachMemory = useCallback((id: string) => {
    setCoachMemories((prev) => {
      const next = prev.filter((m) => m.id !== id);
      try { localStorage.setItem(COACH_MEMORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clearNewPRs = useCallback(() => setNewPRs([]), []);

  const addBodyWeight = useCallback((entry: BodyCompositionEntry) => {
    setBodyWeightLog((prev) => {
      const next = [entry, ...prev.filter((p) => p.date !== entry.date)].sort((a, b) => b.date.localeCompare(a.date));
      try { localStorage.setItem(BODY_WEIGHT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const importMultipleBodyCompositionEntries = useCallback((entries: BodyCompositionEntry[]) => {
    setBodyWeightLog((prev) => {
      const dateMap = new Map<string, BodyCompositionEntry>();
      prev.forEach((e) => dateMap.set(e.date.split("T")[0], e));
      entries.forEach((e) => dateMap.set(e.date.split("T")[0], e));
      const next = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date));
      try { localStorage.setItem(BODY_WEIGHT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── Nutrition Actions ───────────────────────────────────────────────────────

  const setNutritionGoals = useCallback((goals: DailyNutritionGoal) => {
    setNutritionGoalsState(goals);
    try { localStorage.setItem(NUTRITION_GOALS_KEY, JSON.stringify(goals)); } catch { /* ignore */ }
  }, []);

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
      let updated: DailyNutritionLog[];
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updatedDay: DailyNutritionLog = {
          ...currentDay,
          entries: [...currentDay.entries, newEntry],
        };
        updated = [...prev];
        updated[existingDayIdx] = updatedDay;
      } else {
        const newDay: DailyNutritionLog = {
          date,
          entries: [newEntry],
          waterMl: 0,
        };
        updated = [newDay, ...prev];
      }
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

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
      let updated: DailyNutritionLog[];
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        const updatedDay: DailyNutritionLog = {
          ...currentDay,
          entries: [...currentDay.entries, ...newEntries],
        };
        updated = [...prev];
        updated[existingDayIdx] = updatedDay;
      } else {
        const newDay: DailyNutritionLog = {
          date,
          entries: newEntries,
          waterMl: 0,
        };
        updated = [newDay, ...prev];
      }
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const removeMealEntry = useCallback((date: string, entryId: string) => {
    setNutritionLogs((prev) => {
      const updated = prev.map((log) => {
        if (log.date !== date) return log;
        return {
          ...log,
          entries: log.entries.filter((e) => e.id !== entryId),
        };
      });
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const updateMealEntryAmount = useCallback((date: string, entryId: string, newAmount: number) => {
    setNutritionLogs((prev) => {
      const updated = prev.map((log) => {
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
      });
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

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
      let updated: DailyNutritionLog[];
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        updated = [...prev];
        updated[existingDayIdx] = {
          ...currentDay,
          entries: [...currentDay.entries, newEntry],
        };
      } else {
        updated = [{ date, entries: [newEntry], waterMl: 0 }, ...prev];
      }
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const addWaterIntake = useCallback((date: string, amountMl: number) => {
    setNutritionLogs((prev) => {
      const existingDayIdx = prev.findIndex((log) => log.date === date);
      let updated: DailyNutritionLog[];
      if (existingDayIdx >= 0) {
        const currentDay = prev[existingDayIdx];
        updated = [...prev];
        updated[existingDayIdx] = {
          ...currentDay,
          waterMl: Math.max(0, (currentDay.waterMl || 0) + amountMl),
        };
      } else {
        updated = [{ date, entries: [], waterMl: Math.max(0, amountMl) }, ...prev];
      }
      try { localStorage.setItem(NUTRITION_LOGS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const saveCustomFood = useCallback((food: FoodItem) => {
    setCustomFoods((prev) => {
      const exists = prev.some((f) => f.id === food.id);
      const next = exists ? prev.map((f) => (f.id === food.id ? food : f)) : [food, ...prev];
      try { localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const deleteCustomFood = useCallback((id: string) => {
    setCustomFoods((prev) => {
      const next = prev.filter((f) => f.id !== id);
      try { localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ─── Garmin Actions ──────────────────────────────────────────────────────────

  const updateGarminHealth = useCallback((date: string, partial: Partial<GarminDailyHealth>) => {
    setGarminHealthLogs((prev) => {
      const existing = prev[date] || getDefaultGarminHealth(date);
      const updated = {
        ...existing,
        ...partial,
        lastSyncedAt: new Date().toISOString(),
      };
      const next = { ...prev, [date]: updated };
      try { localStorage.setItem(GARMIN_HEALTH_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const addGarminActivity = useCallback((activity: GarminActivity) => {
    setGarminActivities((prev) => {
      const exists = prev.some((a) => a.id === activity.id);
      const next = exists ? prev.map((a) => (a.id === activity.id ? activity : a)) : [activity, ...prev];
      try { localStorage.setItem(GARMIN_ACTIVITIES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

    // Also automatically update today's active calories burned
    const activityDate = activity.startTime.split("T")[0];
    if (activity.caloriesBurned > 0) {
      updateGarminHealth(activityDate, {
        activeCaloriesBurned: (garminHealthLogs[activityDate]?.activeCaloriesBurned || 500) + activity.caloriesBurned,
      });
    }
  }, [garminHealthLogs, updateGarminHealth]);

  // ─── Automatic Background Garmin Sync ───────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    async function autoSyncGarmin() {
      try {
        const isConnected = await checkGarminConnectionStatus();
        if (!isConnected || !isMounted) return;

        const todayStr = new Date().toISOString().split("T")[0];
        const todayHealth = garminHealthLogs[todayStr];
        const lastSync = todayHealth?.lastSyncedAt ? new Date(todayHealth.lastSyncedAt).getTime() : 0;
        const now = Date.now();

        // Auto-sync if data is older than 15 minutes or not yet synced today
        if (now - lastSync > 15 * 60 * 1000) {
          const res = await syncRealGarminData(todayStr);
          if (res.success && res.health && isMounted) {
            updateGarminHealth(todayStr, res.health);
            if (res.activities && res.activities.length > 0) {
              setGarminActivities(res.activities);
              try {
                localStorage.setItem(GARMIN_ACTIVITIES_STORAGE_KEY, JSON.stringify(res.activities));
              } catch {}
            }
          }
        }
      } catch {}
    }

    // Run short initial check on mount
    const timer = setTimeout(autoSyncGarmin, 2000);

    // Periodic check every 30 minutes
    const interval = setInterval(autoSyncGarmin, 30 * 60 * 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [garminHealthLogs, updateGarminHealth]);

  // ─── Automatic Pi Scale Webhook Sync ────────────────────────────────────────
  useEffect(() => {
    async function fetchPiScaleMeasurements() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/scale/webhook");
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.measurements) && data.measurements.length > 0) {
          importMultipleBodyCompositionEntries(data.measurements);
        }
      } catch {}
    }

    const timer = setTimeout(fetchPiScaleMeasurements, 1500);
    const interval = setInterval(fetchPiScaleMeasurements, 30 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [importMultipleBodyCompositionEntries]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      activeView,
      setActiveView,
      loggedSessions,
      addSession,
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
