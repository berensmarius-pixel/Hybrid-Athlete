"use client";

import { cn, WORKOUT_COLORS, getDayOfMonth } from "@/lib/utils";
import type { DayPlan } from "@/types";

interface DayCardProps {
  day: DayPlan;
  isToday: boolean;
  isSelected: boolean;
  /** True when a matching Strava activity was logged on this day */
  stravaCompleted?: boolean;
  onClick: () => void;
}

/** Small Strava flame SVG used as the completion indicator */
function StravaFlame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

export default function DayCard({ day, isToday, isSelected, stravaCompleted = false, onClick }: DayCardProps) {
  const colors = WORKOUT_COLORS[day.workoutType];
  const dayNum = getDayOfMonth(day.dayIndex);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl min-w-[56px] transition-all duration-150 select-none relative",
        isSelected
          ? cn("bg-zinc-800", colors.border, "border")
          : "hover:bg-zinc-800/50 active:bg-zinc-800"
      )}
    >
      {/* Day short */}
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          isSelected ? colors.text : "text-zinc-500"
        )}
      >
        {day.dayShort}
      </span>

      {/* Day number */}
      <span
        className={cn(
          "text-lg font-bold leading-none",
          isToday && !isSelected && "text-zinc-100",
          isSelected ? "text-zinc-100" : "text-zinc-400"
        )}
      >
        {dayNum}
      </span>

      {/* Bottom indicator: Strava flame when completed, Check when manually finished, otherwise a dot */}
      <div className="flex items-center justify-center gap-0.5 mt-0.5">
        {stravaCompleted && <StravaFlame className="w-3 h-3 text-orange-400" />}
        {day.isCompleted && !stravaCompleted && (
          <svg viewBox="0 0 24 24" className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {!stravaCompleted && !day.isCompleted && (
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isToday ? colors.dot : isSelected ? colors.dot : "bg-zinc-700"
            )}
          />
        )}
      </div>
    </button>
  );
}
