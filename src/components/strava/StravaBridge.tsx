"use client";

/**
 * StravaBridge — sits between AppProvider and StravaProvider.
 * On every Strava sync, it auto-imports new activities as EnduranceSessions
 * into the app's training log, making them visible in the calendar and history.
 * Uses a ref-based Set to prevent duplicate imports within one page session.
 */

import { useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { stravaToEnduranceSession } from "@/lib/stravaUtils";

export default function StravaBridge({ children }: { children: React.ReactNode }) {
  const { addSession } = useApp();
  const { activities } = useStrava();
  const importedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const activity of activities) {
      if (!importedRef.current.has(activity.id)) {
        importedRef.current.add(activity.id);
        addSession(stravaToEnduranceSession(activity));
      }
    }
  }, [activities, addSession]);

  return <>{children}</>;
}
