"use client";

import { useMemo } from "react";
import { Target } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getStravaCompletedDays, getDateForDayIndex } from "@/lib/stravaUtils";

export default function AdherenceWidget() {
  const { weeklyPlan, loggedSessions } = useApp();
  const { activities, connection } = useStrava();

  const { planned, completed, pct } = useMemo(() => {
    const plannedDays = weeklyPlan.filter(
      (d) => d.workoutType !== "rest"
    );
    const planned = plannedDays.length;
    if (planned === 0) return { planned: 0, completed: 0, pct: 0 };

    // Strava-matched days
    const stravaCompleted = connection.isConnected
      ? getStravaCompletedDays(activities, weeklyPlan)
      : new Set<number>();

    // Manually logged sessions this week (by dayIndex)
    const manualCompleted = new Set<number>();
    for (const day of plannedDays) {
      const dateStr = getDateForDayIndex(day.dayIndex);
      const hasManual = loggedSessions.some((s) => {
        if (s.date.startsWith(dateStr)) {
          if (day.workoutType === "gym" && s.kind === "gym") return true;
          if (day.workoutType === "running" && s.kind === "endurance" && (s as { activityType?: string }).activityType === "running") return true;
          if (day.workoutType === "cycling" && s.kind === "endurance" && (s as { activityType?: string }).activityType === "cycling") return true;
        }
        return false;
      });
      if (hasManual) manualCompleted.add(day.dayIndex);
    }

    const completedDays = new Set([...stravaCompleted, ...manualCompleted]);
    // Only count planned days
    const completed = plannedDays.filter((d) => completedDays.has(d.dayIndex)).length;
    const pct = Math.round((completed / planned) * 100);
    return { planned, completed, pct };
  }, [weeklyPlan, loggedSessions, activities, connection]);

  if (planned === 0) return null;

  const color =
    pct >= 80 ? "text-green-400" :
    pct >= 50 ? "text-amber-400" :
    "text-red-400";

  const barColor =
    pct >= 80 ? "bg-green-500" :
    pct >= 50 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="mx-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800/60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Trainingserfüllung</span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${color}`}>{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-zinc-500">
        {completed} von {planned} geplanten Einheiten diese Woche absolviert
      </p>
    </div>
  );
}
