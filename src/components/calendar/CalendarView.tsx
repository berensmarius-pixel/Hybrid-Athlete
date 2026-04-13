"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { LoggedSession } from "@/types";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Color dot for a logged session, with Strava flame for imported activities */
function SessionDot({ session }: { session: LoggedSession }) {
  const isStrava = session.kind === "endurance" && "stravaId" in session && session.stravaId != null;

  if (isStrava) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="w-2 h-2 text-orange-400 fill-current shrink-0"
        aria-label="Strava"
      >
        <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
      </svg>
    );
  }

  const color =
    session.kind === "gym"       ? "bg-blue-500"   :
    session.kind === "endurance" && session.activityType === "running"
                                 ? "bg-green-500"  :
    session.kind === "endurance" && session.activityType === "cycling"
                                 ? "bg-orange-500" :
    "bg-zinc-500";

  return <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", color)} />;
}

export default function CalendarView() {
  const { loggedSessions } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  const monthName = currentDate.toLocaleString("de-DE", { month: "long" });

  const cells = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`empty-${i}`} className="p-2" />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && d === todayDate;
    const localDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const sessionsToday = loggedSessions.filter((s) => s.date.startsWith(localDateStr));

    cells.push(
      <div
        key={d}
        className={cn(
          "flex flex-col items-center justify-center p-3 rounded-lg border transition-colors",
          isToday
            ? "border-blue-500 bg-blue-600/20 text-blue-100"
            : "border-zinc-800/50 bg-zinc-900/50 text-zinc-300"
        )}
      >
        <span className={cn("text-lg font-bold", isToday ? "text-blue-400" : "")}>{d}</span>

        {/* Session indicators */}
        <div className="flex gap-0.5 mt-1 min-h-[8px] items-center flex-wrap justify-center max-w-[28px]">
          {sessionsToday.map((session, idx) => (
            <SessionDot key={idx} session={session} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      {/* Month navigation */}
      <div className="px-4 mb-4 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-zinc-100">
          {monthName} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="px-4">
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-zinc-500">Kraft</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] text-zinc-500">Laufen</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] text-zinc-500">Rad</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="w-2 h-2 text-orange-400 fill-current" aria-hidden="true">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            <span className="text-[10px] text-zinc-500">Strava</span>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-center text-xs font-semibold text-zinc-500 uppercase">
              {wd}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-2">{cells}</div>
      </div>
    </div>
  );
}
