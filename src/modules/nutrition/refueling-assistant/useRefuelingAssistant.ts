"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { usePersistentState } from "@/hooks/usePersistentState";
import { getLocalDateString } from "@/lib/utils";
import { readStoredJson } from "@/lib/persistence/stateStore";
import {
  DEFAULT_BODY_WEIGHT_KG,
  REFUEL_TRIGGER_MAX_AGE_MS,
  buildRefuelPlan,
  getActivityEndTime,
  getActivityLocalDate,
  getRemainingTargets,
  getWindowProgress,
  isRefuelRelevant,
  toRefuelActivityFromGarmin,
  toRefuelActivityFromSession,
} from "./engine";
import type { RefuelActivityInput, RefuelMealSuggestion, RefuelPlan } from "./types";

// ─── Activity Completion Listener ────────────────────────────────────────────
// Lauscht auf neu gesyncede Activities (Garmin Auto-Sync, Garmin-Webhook,
// Strava-Bridge, manueller Logger) und erzeugt beim Abschluss einer relevanten
// Einheit einen Refuel-Plan inkl. Push-Notification.

export const REFUEL_PLANS_STORAGE_KEY = "hybrid_athlete_refuel_plans";

/** Maximal persistierte Pläne (Fenster ist eh nur 2h aktiv). */
const MAX_PERSISTED_PLANS = 20;

/**
 * Session-/Mount-übergreifendes Dedup-Set (überlebt StrictMode-Remounts).
 * Zusätzlich wird gegen persistierte Pläne (State + localStorage) dedupliziert.
 */
const globallyProcessedActivityIds = new Set<string>();

function validateRefuelPlans(raw: unknown): RefuelPlan[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (p): p is RefuelPlan =>
      !!p &&
      typeof p.id === "string" &&
      typeof p.windowEndsAtISO === "string" &&
      !!p.classification &&
      !!p.targets &&
      Array.isArray(p.suggestions)
  );
}

/** Browser-Push (nur wenn Permission bereits erteilt wurde – kein Nagging). */
function fireRefuelNotification(plan: RefuelPlan): void {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const c = plan.classification;
    new Notification(`Refuel-Fenster offen – ${c.headline}`, {
      body: `${plan.activityName} · Ziel: ${plan.targets.carbsG}g Carbs / ${plan.targets.proteinG}g Protein. ${c.reason}`,
      tag: plan.id,
      requireInteraction: true,
    });
  } catch {
    /* Notifications sind optional – still scheitern */
  }
}

export function useRefuelingAssistant() {
  const {
    garminActivities,
    loggedSessions,
    bodyWeightLog,
    pantryItems,
    quickAddCalories,
  } = useApp();

  const [plans, setPlans] = usePersistentState<RefuelPlan[]>(
    REFUEL_PLANS_STORAGE_KEY,
    [],
    { validate: validateRefuelPlans }
  );

  // Ticker (30 s) für den Ablauf-Filter des aktiven Plans – Date.now() darf
  // wegen der React-Purity-Regel nicht direkt im Render/Memo stehen.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (!cancelled) setNowMs(Date.now());
    };
    queueMicrotask(update);
    const interval = setInterval(update, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Ref auf dem State – der Scan-Effekt hängt NICHT von plans ab
  // (verhindert Rescan-Schleifen bei Konsum-Updates), liest aber immer den
  // aktuellen Stand für die Deduplizierung.
  const plansRef = useRef<RefuelPlan[]>(plans);
  useEffect(() => {
    plansRef.current = plans;
  }, [plans]);

  /** Neuestes Körpergewicht (Fallback: Default-Athlet). */
  const getBodyWeightKg = useCallback(() => {
    const latest = bodyWeightLog.find((e) => typeof e.weight === "number" && e.weight > 30);
    return latest?.weight ?? DEFAULT_BODY_WEIGHT_KG;
  }, [bodyWeightLog]);

  // ── Scan: neue, frisch beendete Activities erkennen ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    // Erster Scan wartet bewusst kurz: die Persistenz-Hydratation
    // (localStorage + Server-Merge) soll Pläne früherer Syncs liefern.
    const delayMs = globallyProcessedActivityIds.size === 0 && plansRef.current.length === 0 ? 5000 : 750;

    const timer = setTimeout(() => {
      if (cancelled) return;

      const allInputs: RefuelActivityInput[] = [
        ...garminActivities.map(toRefuelActivityFromGarmin),
        ...loggedSessions
          .map((s) => toRefuelActivityFromSession(s))
          .filter((a): a is RefuelActivityInput => a !== null),
      ].filter(isRefuelRelevant);

      // Dedup: bereits geplante Activities (State, Storage-Fallback, Session-Gedächtnis)
      const known = new Set<string>(globallyProcessedActivityIds);
      for (const plan of plansRef.current) {
        plan.activityIds.forEach((id) => known.add(id));
      }
      const stored = readStoredJson<RefuelPlan[] | null>(REFUEL_PLANS_STORAGE_KEY, null, validateRefuelPlans);
      stored?.forEach((p) => p.activityIds.forEach((id) => known.add(id)));

      const nowMs = Date.now();
      const candidates = allInputs.filter((a) => {
        if (known.has(a.id)) return false;
        const endedAtMs = getActivityEndTime(a).getTime();
        const ageMs = nowMs - endedAtMs;
        // Nur frisch beendete Units triggergen (Stale-Daten beim App-Start bleiben ruhig)
        return ageMs >= -60_000 && ageMs <= REFUEL_TRIGGER_MAX_AGE_MS;
      });
      if (candidates.length === 0) return;

      const bodyWeightKg = getBodyWeightKg();
      const now = new Date();
      const newPlans = candidates.map((activity) =>
        buildRefuelPlan({
          activity,
          sameDayActivities: allInputs.filter(
            (o) => getActivityLocalDate(o) === getActivityLocalDate(activity)
          ),
          bodyWeightKg,
          pantryItems,
          now,
        })
      );

      candidates.forEach((a) => globallyProcessedActivityIds.add(a.id));
      setPlans((prev) => [...newPlans, ...prev].slice(0, MAX_PERSISTED_PLANS));
      newPlans.forEach(fireRefuelNotification);
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [garminActivities, loggedSessions, pantryItems, getBodyWeightKg, setPlans]);

  // ── Aktiver Plan: jüngster, nicht abgelaufener mit offenen Zielen ───────────
  const activePlan = useMemo(() => {
    return (
      plans.find((p) => {
        if (p.dismissedAtISO) return false;
        if (getWindowProgress(p, nowMs).expired) return false;
        const remaining = getRemainingTargets(p);
        return remaining.carbsG > 0 || remaining.proteinG > 0;
      }) ?? null
    );
  }, [plans, nowMs]);

  // ── Aktionen ────────────────────────────────────────────────────────────────

  /** Mahlzeit konsumiert: ins Ernährungstagebuch buchen + Rest-Ziele senken. */
  const logSuggestion = useCallback(
    (planId: string, suggestion: RefuelMealSuggestion) => {
      quickAddCalories(
        getLocalDateString(),
        "snack",
        `${suggestion.title} (Refuel)`,
        suggestion.calories,
        suggestion.proteinG,
        suggestion.carbsG,
        0
      );
      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId
            ? {
                ...p,
                consumedCarbsG: Math.min(p.targets.carbsG, p.consumedCarbsG + suggestion.carbsG),
                consumedProteinG: Math.min(p.targets.proteinG, p.consumedProteinG + suggestion.proteinG),
              }
            : p
        )
      );
    },
    [quickAddCalories, setPlans]
  );

  const dismissPlan = useCallback(
    (planId: string) => {
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, dismissedAtISO: new Date().toISOString() } : p))
      );
    },
    [setPlans]
  );

  return { activePlan, logSuggestion, dismissPlan };
}
