"use client";

/**
 * StravaBridge — sits between AppProvider and StravaProvider.
 * On every Strava sync, it auto-imports activities as EnduranceSessions
 * into the app's training log, making them visible in the calendar and history.
 * Duplikate werden im Reducer per ID gefiltert – auch über Reloads hinweg.
 */

import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { stravaToEnduranceSession } from "@/lib/stravaUtils";

export default function StravaBridge({ children }: { children: React.ReactNode }) {
  const { addSessions } = useApp();
  const { activities } = useStrava();

  useEffect(() => {
    if (activities.length === 0) return;
    // Batch-Import: ein Dispatch statt N Einzel-Dispatches.
    // Der Reducer verwirft Sessions, deren ID bereits existiert,
    // sodass Reloads keine Doppel-Einträge mehr erzeugen.
    addSessions(activities.map(stravaToEnduranceSession));
  }, [activities, addSessions]);

  return <>{children}</>;
}
