"use client";

import { useRef } from "react";
import DayCard from "./DayCard";
import { getTodayIndex } from "@/lib/utils";
import { getStravaCompletedDays } from "@/lib/stravaUtils";
import { useStrava } from "@/context/StravaContext";
import type { DayPlan } from "@/types";

interface WeekStripProps {
  plan: DayPlan[];
  selectedDay: number;
  onSelectDay: (index: number) => void;
}

export default function WeekStrip({ plan, selectedDay, onSelectDay }: WeekStripProps) {
  const todayIndex = getTodayIndex();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const { activities, connection } = useStrava();

  // Compute which days have a matching Strava activity this week
  const stravaCompleted = connection.isConnected
    ? getStravaCompletedDays(activities, plan)
    : new Set<number>();

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-7 gap-1.5 sm:gap-2.5 w-full py-1"
    >
      {plan.map((day) => (
        <div
          key={day.dayIndex}
          ref={day.dayIndex === selectedDay ? selectedRef : undefined}
          className="w-full min-w-0"
        >
          <DayCard
            day={day}
            isToday={day.dayIndex === todayIndex}
            isSelected={day.dayIndex === selectedDay}
            stravaCompleted={stravaCompleted.has(day.dayIndex)}
            onClick={() => onSelectDay(day.dayIndex)}
          />
        </div>
      ))}
    </div>
  );
}
