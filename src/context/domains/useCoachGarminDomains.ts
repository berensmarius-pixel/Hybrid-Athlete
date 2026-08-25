"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage, CoachMemory } from "@/types";
import { generateId, getLocalDateString } from "@/lib/utils";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  getDefaultGarminHealth,
  GARMIN_HEALTH_STORAGE_KEY,
  GARMIN_ACTIVITIES_STORAGE_KEY,
  checkGarminConnectionStatus,
  syncRealGarminData,
} from "@/lib/garmin/garminService";
import type { GarminDailyHealth, GarminActivity } from "@/types";

/**
 * Domänen Coach (Chat + Gedächtnis) und Garmin (Vitaldaten + Activities
 * inkl. Auto-Sync im Hintergrund).
 */

const CHAT_STORAGE_KEY = "hybrid_athlete_chat";
const COACH_MEMORY_KEY = "hybrid_athlete_coach_memory";

function validateChatMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((m): m is ChatMessage => !!m && typeof m.id === "string" && typeof m.text === "string")
    .map((m) => ({ ...m, timestamp: new Date(m.timestamp as unknown as string) }));
}

/**
 * Base64-Fotos werden NICHT persistiert (sprengen die Quota) – hochgeladene
 * Bilder liegen im Storage-Bucket und werden als Proxy-URL geführt.
 * Zusätzlich wird die persistierte Historie auf MAX_PERSISTED_CHAT_MESSAGES
 * begrenzt (älteste Nachrichten verwerfen).
 */
const MAX_PERSISTED_CHAT_MESSAGES = 200;

function stripChatImagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  const capped =
    messages.length > MAX_PERSISTED_CHAT_MESSAGES
      ? messages.slice(-MAX_PERSISTED_CHAT_MESSAGES)
      : messages;
  return capped.map((m) => {
    if (!m.images || m.images.length === 0) return m;
    const persistable = m.images.filter((img) => img.startsWith("/"));
    return { ...m, images: persistable.length > 0 ? persistable : undefined };
  });
}

export function useCoachDomain() {
  // Kein Mock-Seed mehr: der Chat startet leer, echte Historie kommt aus dem Storage.
  const [chatMessages, setChatMessages] = usePersistentState<ChatMessage[]>(
    CHAT_STORAGE_KEY,
    [],
    { validate: validateChatMessages, transformForStorage: stripChatImagesForStorage }
  );
  const [coachMemories, setCoachMemories] = usePersistentState<CoachMemory[]>(
    COACH_MEMORY_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as CoachMemory[]) : null) }
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

  /** Chat-Historie begrenzen (älteste Nachrichten verwerfen). */
  const appendMessages = useCallback(
    (...messages: ChatMessage[]) => {
      setChatMessages((prev) =>
        [...prev, ...messages].slice(-MAX_PERSISTED_CHAT_MESSAGES)
      );
    },
    [setChatMessages]
  );

  return {
    chatMessages,
    setChatMessages,
    coachMemories,
    addCoachMemory,
    deleteCoachMemory,
    appendMessages,
  };
}

export function useGarminDomain() {
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

    // Aktive Kalorien auf den Activity-Tag addieren – innerhalb des
    // setGarminHealthLogs-Updaters, damit mehrere Activities am selben Tag
    // in einer Sync-Runde sich korrekt akkumulieren (kein stale Snapshot).
    const activityDate = activity.startTime.split("T")[0];
    if (activity.caloriesBurned > 0) {
      setGarminHealthLogs((prev) => {
        const existing = prev[activityDate] || getDefaultGarminHealth(activityDate);
        const current = existing.activeCaloriesBurned || 0;
        return {
          ...prev,
          [activityDate]: {
            ...existing,
            activeCaloriesBurned: current + activity.caloriesBurned,
            lastSyncedAt: new Date().toISOString(),
          },
        };
      });
    }
  }, [setGarminActivities, setGarminHealthLogs]);

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

  return {
    garminHealthLogs,
    updateGarminHealth,
    garminActivities,
    addGarminActivity,
  };
}
