"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useCallback,
  useRef,
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
} from "@/types";
import { DEFAULT_WEEKLY_PLAN, STORAGE_KEY } from "@/data/weeklyPlan";
import { DEFAULT_GYM_TEMPLATES, TEMPLATES_STORAGE_KEY } from "@/data/gymTemplates";
import { MOCK_MESSAGES } from "@/data/mockMessages";
import { generateId } from "@/lib/utils";

const ENDURANCE_TEMPLATES_KEY = "hybrid_athlete_endurance_templates";
const CHAT_STORAGE_KEY = "hybrid_athlete_chat";
const ACTIVE_SESSION_KEY = "hybrid_athlete_active_session";
const SESSIONS_STORAGE_KEY = "hybrid_athlete_sessions";
const PR_STORAGE_KEY = "hybrid_athlete_prs";
const COACH_MEMORY_KEY = "hybrid_athlete_coach_memory";
const BODY_WEIGHT_KEY = "hybrid_athlete_body_weight";

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

  const addBodyWeight = useCallback((entry: BodyWeightEntry) => {
    setBodyWeightLog((prev) => {
      const next = [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date));
      try { localStorage.setItem(BODY_WEIGHT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        activeView, setActiveView,
        loggedSessions, addSession,
        weeklyPlan, updateWeeklyPlan,
        gymTemplates, saveGymTemplate, deleteGymTemplate,
        enduranceTemplates, saveEnduranceTemplate, deleteEnduranceTemplate,
        activeSession, setActiveSession,
        chatMessages, setChatMessages,
        personalRecords,
        coachMemories, addCoachMemory, deleteCoachMemory,
        newPRs, clearNewPRs,
        bodyWeightLog, addBodyWeight,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
