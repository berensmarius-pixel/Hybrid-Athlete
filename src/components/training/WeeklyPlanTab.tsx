"use client";

import { useState } from "react";
import {
  Calendar,
  CalendarSync,
  Check,
  Dumbbell,
  Footprints,
  Bike,
  Activity,
  BedDouble,
  Settings2,
  Sparkles,
  Zap,
  Loader2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { DayPlan, WorkoutType } from "@/types";
import { scheduleEntireWeekToGarmin } from "@/lib/garmin/garminService";

const WORKOUT_COLORS: Record<WorkoutType, { bg: string; text: string; border: string; iconBg: string }> = {
  gym: {
    bg: "bg-blue-500",
    text: "text-blue-400",
    border: "border-blue-500/30",
    iconBg: "bg-blue-500/10 text-blue-400",
  },
  running: {
    bg: "bg-teal-500",
    text: "text-teal-400",
    border: "border-teal-500/30",
    iconBg: "bg-teal-500/10 text-teal-400",
  },
  cycling: {
    bg: "bg-amber-500",
    text: "text-amber-400",
    border: "border-amber-500/30",
    iconBg: "bg-amber-500/10 text-amber-400",
  },
  mobility: {
    bg: "bg-pink-500",
    text: "text-pink-400",
    border: "border-pink-500/30",
    iconBg: "bg-pink-500/10 text-pink-400",
  },
  stretching: {
    bg: "bg-violet-500",
    text: "text-violet-400",
    border: "border-violet-500/30",
    iconBg: "bg-violet-500/10 text-violet-400",
  },
  warmup: {
    bg: "bg-orange-500",
    text: "text-orange-400",
    border: "border-orange-500/30",
    iconBg: "bg-orange-500/10 text-orange-400",
  },
  rest: {
    bg: "bg-zinc-700",
    text: "text-zinc-400",
    border: "border-zinc-800",
    iconBg: "bg-zinc-800 text-zinc-400",
  },
};

function getWorkoutIcon(type: WorkoutType) {
  switch (type) {
    case "gym":
      return Dumbbell;
    case "running":
      return Footprints;
    case "cycling":
      return Bike;
    case "mobility":
    case "stretching":
    case "warmup":
      return Activity;
    case "rest":
    default:
      return BedDouble;
  }
}

interface WeeklyPlanTabProps {
  onStartDayPlan: (day: DayPlan) => void;
  onOpenPlanEditor: () => void;
  onOpenAdaptiveModal: () => void;
}

export default function WeeklyPlanTab({
  onStartDayPlan,
  onOpenPlanEditor,
}: WeeklyPlanTabProps) {
  const { weeklyPlan, gymTemplates } = useApp();

  const [isSyncingGarminWeek, setIsSyncingGarminWeek] = useState(false);
  const [garminSyncResult, setGarminSyncResult] = useState<string | null>(null);

  const todayIndex = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();

  async function handleSyncEntireWeekToGarmin() {
    setIsSyncingGarminWeek(true);
    setGarminSyncResult(null);
    try {
      const res = await scheduleEntireWeekToGarmin(weeklyPlan, gymTemplates);
      if (res.success) {
        setGarminSyncResult(`✅ ${res.scheduledCount} Workouts übertragen!`);
      } else {
        setGarminSyncResult(`⚠️ ${res.error || "Fehler"}`);
      }
    } catch {
      setGarminSyncResult("⚠️ Fehler beim Sync");
    } finally {
      setIsSyncingGarminWeek(false);
      setTimeout(() => setGarminSyncResult(null), 5000);
    }
  }

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-4 sm:space-y-6 pb-28 md:pb-8">
      {/* Action Header Banner with Clear Button Hierarchy */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5 rounded-3xl bg-linear-to-r from-cyan-950/30 via-zinc-900/80 to-zinc-900/80 border border-cyan-500/20">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
            <span>7-Tage Hybrid Periodisierung</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-extrabold border border-cyan-500/30">
              Mo – So
            </span>
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
            Synchronisiere deinen gesamten Trainingsplan mit 1 Klick auf deinen Garmin-Kalender (Forerunner 265 / Edge 840)
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Primary CTA Button: Garmin Week Sync */}
          <button
            onClick={handleSyncEntireWeekToGarmin}
            disabled={isSyncingGarminWeek}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer",
              garminSyncResult
                ? "bg-emerald-500 text-zinc-950 shadow-emerald-500/20"
                : "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/25"
            )}
          >
            {isSyncingGarminWeek ? (
              <Loader2 size={15} className="animate-spin text-zinc-950" />
            ) : garminSyncResult ? (
              <Check size={15} className="text-zinc-950" />
            ) : (
              <CalendarSync size={15} className="text-zinc-950" />
            )}
            <span>
              {isSyncingGarminWeek
                ? "Übertrage..."
                : garminSyncResult || "Wochenplan -> Garmin Uhr"}
            </span>
          </button>

          {/* Secondary Outline Button: Edit Plan */}
          <button
            onClick={onOpenPlanEditor}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs"
          >
            <Settings2 size={14} className="text-zinc-400" />
            <span>Plan anpassen</span>
          </button>
        </div>
      </div>

      {/* 7-Days Continuous Desktop Grid (1 Row on XL/WQHD, 2 Rows on Tablet, 1 on Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 sm:gap-4">
        {weeklyPlan.map((day) => {
          const isToday = day.dayIndex === todayIndex;
          const color = WORKOUT_COLORS[day.workoutType];
          const Icon = getWorkoutIcon(day.workoutType);

          return (
            <div
              key={day.dayIndex}
              className={cn(
                "p-4 rounded-3xl border transition-all duration-300 flex flex-col justify-between space-y-3 relative group",
                isToday
                  ? "bg-linear-to-b from-zinc-900 via-zinc-900 to-cyan-950/20 border-cyan-500/80 ring-2 ring-cyan-500/40 shadow-xl shadow-cyan-500/10 scale-[1.01]"
                  : "bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
                    {day.dayFull}
                  </span>
                  {isToday && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide bg-cyan-500 text-zinc-950 shadow-xs shadow-cyan-500/30">
                      <span className="w-1 h-1 rounded-full bg-zinc-950 animate-ping" />
                      Heute
                    </span>
                  )}
                </div>

                <div className={cn("p-1.5 rounded-xl", color.iconBg)}>
                  <Icon size={16} />
                </div>
              </div>

              {/* Workout details */}
              <div className="space-y-1">
                <h3 className={cn("text-xs sm:text-sm font-bold leading-tight", color.text)}>
                  {day.title}
                </h3>
                <p className="text-[11px] sm:text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                  {day.description || "Keine Notizen hinterlegt"}
                </p>
              </div>

              {/* Action button */}
              {day.workoutType !== "rest" ? (
                <button
                  onClick={() => onStartDayPlan(day)}
                  className={cn(
                    "w-full py-2.5 rounded-2xl text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-md",
                    isToday
                      ? "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black shadow-cyan-500/20"
                      : `${color.bg} hover:opacity-90`
                  )}
                >
                  <Zap size={13} className={isToday ? "text-zinc-950" : "text-white"} />
                  <span>Workout starten</span>
                </button>
              ) : (
                /* Disabled / Muted Rest Day Button */
                <button
                  disabled
                  className="w-full py-2.5 rounded-2xl text-xs font-semibold text-zinc-500 bg-zinc-950/60 border border-zinc-900 cursor-not-allowed opacity-50 flex items-center justify-center gap-1.5 select-none"
                >
                  <BedDouble size={13} className="text-zinc-600" />
                  <span>Regenerationstag (Pausiert)</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
