"use client";

import { Loader2, Watch, X, CalendarDays } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const DAYS = [
  { index: 0, short: "Mo", full: "Montag" },
  { index: 1, short: "Di", full: "Dienstag" },
  { index: 2, short: "Mi", full: "Mittwoch" },
  { index: 3, short: "Do", full: "Donnerstag" },
  { index: 4, short: "Fr", full: "Freitag" },
  { index: 5, short: "Sa", full: "Samstag" },
  { index: 6, short: "So", full: "Sonntag" },
];

interface ScheduleDialogProps {
  workoutTitle: string;
  mode: "calendar" | "garmin";
  onClose: () => void;
  onPickDay: (dayIndex: number) => void;
}

export default function ScheduleDialog({
  workoutTitle,
  mode,
  onClose,
  onPickDay,
}: ScheduleDialogProps) {
  const [picked, setPicked] = useState<number | null>(null);

  function handlePick(dayIndex: number) {
    setPicked(dayIndex);
    onPickDay(dayIndex);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center",
                mode === "calendar" ? "bg-cyan-500/15 text-cyan-300" : "bg-blue-500/15 text-blue-300"
              )}
            >
              {mode === "calendar" ? <CalendarDays size={18} /> : <Watch size={18} />}
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-100">
                {mode === "calendar" ? "Zum Wochenplan hinzufügen" : "An Garmin senden"}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate max-w-[240px]">{workoutTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          {mode === "calendar"
            ? "Wähle den Wochentag, auf den diese Einheit geplant werden soll."
            : "Das Workout wird als strukturierter Termin in deinen Garmin-Kalender übertragen (Forerunner / Edge)."}

        </p>

        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((day) => (
            <button
              key={day.index}
              onClick={() => handlePick(day.index)}
              disabled={picked !== null}
              className={cn(
                "py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer flex flex-col items-center gap-0.5",
                picked === day.index
                  ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-200"
                  : "bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300"
              )}
            >
              <span>{day.short}</span>
              <span className="text-[9px] font-mono text-zinc-500">{day.full.slice(0, 2)}</span>
            </button>
          ))}
        </div>

        {picked !== null && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-cyan-300">
            <Loader2 size={14} className="animate-spin" />
            <span>Wird übertragen…</span>
          </div>
        )}
      </div>
    </div>
  );
}
