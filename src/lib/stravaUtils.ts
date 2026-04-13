import type { StravaActivity, EnduranceSession, DayPlan } from "@/types";
import { generateId } from "@/lib/utils";

// ─── Format helpers ───────────────────────────────────────────────────────────

/** m/s → "5:07/km" */
function speedToPaceStr(ms: number): string {
  if (ms <= 0) return "";
  const secsPerKm = 1000 / ms;
  const min = Math.floor(secsPerKm / 60);
  const sec = Math.round(secsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

/** seconds → "45:00" or "1:23:45" */
function secondsToDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/** Convert a Strava activity into an EnduranceSession for the training log */
export function stravaToEnduranceSession(activity: StravaActivity): EnduranceSession {
  const isRun = activity.sport_type === "Run" || activity.type === "Run";
  const activityType: "cycling" | "running" = isRun ? "running" : "cycling";

  const pace = isRun
    ? speedToPaceStr(activity.average_speed)
    : `${(activity.average_speed * 3.6).toFixed(1)} km/h`;

  return {
    kind: "endurance",
    id: `strava-${activity.id}`,
    date: activity.start_date_local,
    activityType,
    duration: secondsToDuration(activity.moving_time),
    heartRate: activity.average_heartrate ?? "",
    pace,
    rpe: 0, // not tracked by Strava
    templateName: activity.name,
    stravaId: activity.id,
  };
}

// ─── Weekly stats ─────────────────────────────────────────────────────────────

function getThisWeekRange(): { start: Date; end: Date } {
  const today = new Date();
  const jsDay = today.getDay();
  const toMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + toMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

export interface WeekStats {
  runKm: number;
  rideKm: number;
  totalHours: number;
  runCount: number;
  rideCount: number;
}

export function getWeekStats(
  activities: StravaActivity[],
  range?: { start: Date; end: Date }
): WeekStats {
  const { start, end } = range || getThisWeekRange();

  const filtered = activities.filter((a) => {
    const d = new Date(a.start_date_local);
    return d >= start && d <= end;
  });

  let runKm = 0, rideKm = 0, totalSecs = 0, runCount = 0, rideCount = 0;

  for (const a of filtered) {
    const isRun = a.sport_type === "Run" || a.type === "Run";
    if (isRun) { runKm += a.distance / 1000; runCount++; }
    else        { rideKm += a.distance / 1000; rideCount++; }
    totalSecs += a.moving_time;
  }

  return {
    runKm:      Math.round(runKm  * 10) / 10,
    rideKm:     Math.round(rideKm * 10) / 10,
    totalHours: Math.round((totalSecs / 3600) * 10) / 10,
    runCount,
    rideCount,
  };
}

// ─── Plan matching ────────────────────────────────────────────────────────────

/** ISO date string for a Mon-based dayIndex within a target week (default: current) */
export function getDateForDayIndex(dayIndex: number, referenceDate: Date = new Date()): string {
  const jsDay = referenceDate.getDay();
  const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const diff = dayIndex - dayIdx;
  const d = new Date(referenceDate);
  d.setDate(referenceDate.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns the set of dayIndices (0-6) where a Strava activity matches
 * the planned workout type for the specified range.
 */
export function getStravaCompletedDays(
  activities: StravaActivity[],
  weeklyPlan: DayPlan[],
  range?: { start: Date; end: Date }
): Set<number> {
  const completed = new Set<number>();
  const { start } = range || getThisWeekRange();

  for (const day of weeklyPlan) {
    if (day.workoutType === "rest" || day.workoutType === "stretching" || day.workoutType === "warmup") continue;
    if (day.workoutType === "gym") continue; 

    // Match relative to the start of the providing week/range
    const dateStr = getDateForDayIndex(day.dayIndex, start);

    const matched = activities.some((a) => {
      const aDate = a.start_date_local.split("T")[0];
      if (aDate !== dateStr) return false;
      const isRun = a.sport_type === "Run" || a.type === "Run";
      if (day.workoutType === "running" && isRun)  return true;
      if (day.workoutType === "cycling" && !isRun) return true;
      return false;
    });

    if (matched) completed.add(day.dayIndex);
  }

  return completed;
}

// Suppress unused import warning — generateId is re-exported for convenience
void generateId;
