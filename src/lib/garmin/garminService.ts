// ─── Garmin Service & Connect Hub ───────────────────────────────────────────

import { GarminDailyHealth, GarminActivity } from "@/types";

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
