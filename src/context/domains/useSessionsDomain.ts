"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { LoggedSession, PersonalRecord, GymSession } from "@/types";
import { detectNewPRs, mergePRs } from "@/lib/training/pr";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  applyServerValue,
  hydrateFromServer,
  readStoredJson,
  writeState,
} from "@/lib/persistence/stateStore";
import {
  hydrateWorkoutsFromCache,
  recordSessionsMutation,
} from "@/lib/offline/syncEngine";

/**
 * Domäne Training: geloggte Sessions, aktive Session-Verwaltung liegt
 * beim Provider; hier inkl. Persistenz + PR-Erkennung.
 *
 * Offline-First: Jede Session-Mutation wird zusätzlich als Snapshot in die
 * IndexedDB-Sync-Queue geschrieben (recordSessionsMutation) und beim nächsten
 * Online-Event automatisch ans Cloud-Backend geflusht – inklusive bei
 * komplett offline geloggten Workouts.
 */

const SESSIONS_STORAGE_KEY = "hybrid_athlete_sessions";
const PR_STORAGE_KEY = "hybrid_athlete_prs";

type SessionAction =
  | { type: "ADD"; session: LoggedSession }
  | { type: "ADD_MANY"; sessions: LoggedSession[] }
  | { type: "INIT"; sessions: LoggedSession[] };

function safeStringifySessions(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

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
      return action.sessions.filter((s) => {
        if (!s?.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    }
    default:
      return state;
  }
}

export function useSessionsDomain() {
  const [loggedSessions, dispatch] = useReducer(sessionsReducer, []);
  const [personalRecords, setPersonalRecords] = usePersistentState<PersonalRecord[]>(
    PR_STORAGE_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as PersonalRecord[]) : null) }
  );
  const [newPRs, setNewPRs] = useState<PersonalRecord[]>([]);
  const sessionsLoadedRef = useRef(false);
  /** Echo-Suppression: JSON des zuletzt server-applizierten Stands. */
  const serverMirrorRef = useRef<string | null>(null);

  // Load persisted sessions (einmalig): zuerst localStorage-Cache, dann
  // IndexedDB-Fallback (Offline-First), dann Server-Merge via /api/state –
  // gleiche Semantik wie usePersistentState.
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
      if (Array.isArray(serverVal)) {
        // Server gewinnt – außer es gibt pending lokale Änderungen
        if (!applyServerValue(SESSIONS_STORAGE_KEY, serverVal)) return;
        try {
          serverMirrorRef.current = JSON.stringify(serverVal);
        } catch { /* ignore */ }
        dispatch({ type: "INIT", sessions: serverVal as LoggedSession[] });
        return;
      }
      // Weder localStorage noch Server haben Daten → IndexedDB-Cache
      // wiederherstellen (Offline-First; spiegelt anschließend zurück zum Server)
      void hydrateWorkoutsFromCache().then((cached) => {
        if (!cancelled || !cached || cached.length === 0) return;
        dispatch({ type: "INIT", sessions: cached });
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist sessions after every change (post-hydration):
  // localStorage + Server-Spiegelung (stateStore) + IndexedDB-Sync-Queue.
  useEffect(() => {
    if (!sessionsLoadedRef.current) return;
    writeState(SESSIONS_STORAGE_KEY, loggedSessions);

    const json = safeStringifySessions(loggedSessions);
    if (json !== null && serverMirrorRef.current === json) {
      // Echo des Server-Stands → kein Sync-Eintrag nötig
      serverMirrorRef.current = null;
      return;
    }
    void recordSessionsMutation(loggedSessions);
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

  const clearNewPRs = useCallback(() => setNewPRs([]), []);

  return {
    loggedSessions,
    addSession,
    addSessions,
    personalRecords,
    newPRs,
    clearNewPRs,
  };
}
