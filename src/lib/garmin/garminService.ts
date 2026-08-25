// ─── Garmin Service & Connect Hub ───────────────────────────────────────────

import { GarminDailyHealth, GarminActivity, GarminActivityDetails } from "@/types";
import { getLocalDateString } from "@/lib/utils";

export const GARMIN_HEALTH_STORAGE_KEY = "hybrid_athlete_garmin_health";
export const GARMIN_ACTIVITIES_STORAGE_KEY = "hybrid_athlete_garmin_activities";
export const GARMIN_CREDENTIALS_STORAGE_KEY = "hybrid_athlete_garmin_creds";

export function getDefaultGarminHealth(dateStr: string): GarminDailyHealth {
  return {
    date: dateStr,
    trainingReadiness: 75,
    bodyBattery: 80,
    hrvStatus: "balanced",
    hrvWeeklyAvgMs: 56,
    sleepScore: 82,
    sleepDurationHours: 7.5,
    recoveryTimeHours: 12,
    restingHeartRate: 48,
    activeCaloriesBurned: 500,
    totalCaloriesBurned: 2500,
    trainingStatus: "productive",
    lastSyncedAt: undefined,
    deviceSource: "Forerunner 265",
  };
}

/**
 * Check if Garmin Connect session is active on server
 */
export async function checkGarminConnectionStatus(): Promise<boolean> {
  try {
    const res = await fetch("/api/garmin/status");
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.connected;
  } catch {
    return false;
  }
}

/**
 * Login to Garmin Connect using credentials
 */
export async function loginToGarminConnect(
  email: string,
  pass: string,
  mfa?: string
): Promise<{ success: boolean; mfa_required?: boolean; error?: string; message?: string }> {
  try {
    const res = await fetch("/api/garmin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass, mfa }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, error: err.message || "Verbindungsfehler" };
  }
}

/**
 * Fetch 100% REAL live data from Garmin Connect via python garminconnect engine
 */
export async function syncRealGarminData(dateStr: string): Promise<{
  success: boolean;
  health?: Partial<GarminDailyHealth>;
  activities?: GarminActivity[];
  error?: string;
}> {
  try {
    const res = await fetch(`/api/garmin/sync?date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson.error || "Sync-Fehler" };
    }
    const data = await res.json();
    if (!data.success) {
      return { success: false, error: data.error || "Garmin Sync nicht erfolgreich" };
    }

    return {
      success: true,
      health: {
        ...data.health,
        date: dateStr,
        lastSyncedAt: data.syncedAt || new Date().toISOString(),
        deviceSource: "Garmin Connect",
      },
      activities: data.activities || [],
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Netzwerkfehler beim Garmin Sync" };
  }
}

/**
 * Lädt die vollständige Telemetrie einer Aktivität aus Garmin Connect
 * (Messreihen, GPS-Track, Splits, Zonen, Kraft-Sets, Wetter, Gear).
 */
export async function fetchGarminActivityDetails(
  activity: GarminActivity
): Promise<GarminActivityDetails> {
  // Legacy-Einträge tragen die native ID als "garmin-<id>" im id-Feld
  const garminId = activity.garminId || (activity.id.startsWith("garmin-") ? activity.id.slice(7) : null);
  if (!garminId) throw new Error("Keine Garmin Activity-ID vorhanden (nur für Garmin-Connect-Syncs verfügbar).");

  const res = await fetch(`/api/garmin/activity-details?id=${encodeURIComponent(garminId)}`);
  const data = (await res.json()) as GarminActivityDetails;
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Fehler beim Laden der Aktivitätsdetails");
  }
  return data;
}

/**
 * Uploads and schedules a structured workout directly into the native Garmin Calendar.
 * The watch (Forerunner 265 / Edge 840) will automatically prompt the workout when starting the activity.
 */
export async function scheduleNativeGarminWorkout(
  dateStr: string,
  workout: any
): Promise<{
  success: boolean;
  workoutId?: string;
  workoutName?: string;
  date?: string;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/garmin/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateStr,
        workout,
      }),
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Fehler beim Senden an den Garmin-Kalender.",
    };
  }
}

/**
 * Schedules all non-rest workouts of the weekly plan to Garmin Connect calendar
 */
export async function scheduleEntireWeekToGarmin(
  weeklyPlan: any[],
  gymTemplates: any[]
): Promise<{ success: boolean; scheduledCount?: number; error?: string }> {
  try {
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday);

    let scheduled = 0;

    for (const day of weeklyPlan) {
      if (day.workoutType === "rest") continue;

      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + day.dayIndex);
      const dateStr = getLocalDateString(targetDate);

      const workoutPayload: any = {
        name: day.title || `Workout (${day.workoutType})`,
        type: day.workoutType === "running" ? "running" : day.workoutType === "cycling" ? "cycling" : "strength",
        // Wichtig: Description enthält die Intervall-Vorgaben (z.B. "4x8 Min @ 95% FTP mit 3 Min Pause")
        // und wird vom Python-NLP-Parser in Garmin Workout-Steps übersetzt.
        description: day.description || "",
        exercises: [],
      };

      if (day.templateId) {
        const template = gymTemplates.find((t) => t.id === day.templateId);
        if (template && template.exercises) {
          workoutPayload.name = template.name;
          workoutPayload.exercises = template.exercises.map((ex: any) => ({
            name: ex.name,
            sets: (ex.sets || []).map((s: any) => ({
              reps: s.targetReps || 10,
              weight: 0,
            })),
          }));
        }
      }

      const res = await scheduleNativeGarminWorkout(dateStr, workoutPayload);
      if (res.success) {
        scheduled++;
      }
    }

    return { success: true, scheduledCount: scheduled };
  } catch (err: any) {
    return { success: false, error: err.message || "Fehler beim Wochen-Sync" };
  }
}


