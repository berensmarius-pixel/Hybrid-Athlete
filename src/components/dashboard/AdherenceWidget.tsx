"use client";

import { useMemo } from "react";
import { Target, CheckCircle2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getStravaCompletedDays, getDateForDayIndex } from "@/lib/stravaUtils";

export default function AdherenceWidget() {
  const { weeklyPlan, loggedSessions } = useApp();
  const { activities, connection } = useStrava();

  const { planned, completed, pct } = useMemo(() => {
    const plannedDays = weeklyPlan.filter((d) => d.workoutType !== "rest");
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
    const completed = plannedDays.filter((d) => completedDays.has(d.dayIndex)).length;
    const pct = Math.round((completed / planned) * 100);
    return { planned, completed, pct };
  }, [weeklyPlan, loggedSessions, activities, connection]);

  if (planned === 0) return null;

  const color =
    pct >= 80 ? "text-emerald-400" :
    pct >= 50 ? "text-amber-400" :
    "text-blue-400";

  const barColor =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 50 ? "bg-amber-500" :
    "bg-blue-500";

  return (
    <div className="mx-4 p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-zinc-800 text-emerald-400">
            <Target size={16} />
          </div>
          <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
            Trainingserfüllung
          </span>
        </div>
        <span className={`text-base font-black font-mono tabular-nums ${color}`}>{pct}%</span>
      </div>

      {/* Progress bar with clear h-2 track and vibrant color */}
      <div className="h-2.5 w-full bg-neutral-800 rounded-full overflow-hidden p-0.5 border border-zinc-700/40">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 5 : 0)}%` }}
        />
      </div>

      <p className="text-xs text-neutral-400 font-medium flex items-center justify-between">
        <span>{completed} von {planned} geplanten Einheiten absolviert</span>
        {pct === 100 && <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Wochenziel erreicht!</span>}
      </p>
    </div>
  );
}
