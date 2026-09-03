"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Dumbbell,
  Footprints,
  Bike,
  Waves,
  Activity,
  BedDouble,
  ExternalLink,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getStoredCalendarEvents } from "@/lib/calendar/googleCalendarService";
import { detectTrainingConflicts, FreeTimeSlot } from "@/lib/calendar/conflictDetector";
import { WORKOUT_COLORS, cn } from "@/lib/utils";

interface TodayScheduleCardProps {
  selectedDay: number;
  selectedDate: string;
  onReschedule?: (slot: FreeTimeSlot) => void;
  onOpenFullCalendar?: () => void;
}

const WORKOUT_ICONS: Record<string, React.ElementType> = {
  gym: Dumbbell,
  running: Footprints,
  cycling: Bike,
  swimming: Waves,
  mobility: Activity,
  stretching: Activity,
  warmup: Activity,
  rest: BedDouble,
};

export default function TodayScheduleCard({
  selectedDay,
  selectedDate,
  onReschedule,
  onOpenFullCalendar,
}: TodayScheduleCardProps) {
  const { weeklyPlan } = useApp();
  const [events, setEvents] = useState<ReturnType<typeof getStoredCalendarEvents>>([]);
  const [preferredWorkoutTime, setPreferredWorkoutTime] = useState<string>("17:00");
  const [rescheduleSuccessMsg, setRescheduleSuccessMsg] = useState<string | null>(null);

  const dayIndex = (new Date().getDay() + 6) % 7;
  const selectedPlan = weeklyPlan.find((p) => p.dayIndex === selectedDay);

  // Load calendar events asynchronously on mount and when selectedDate changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setEvents(getStoredCalendarEvents());
      }
    });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  const conflictInfo = useMemo(
    () =>
      detectTrainingConflicts(
        events,
        selectedPlan,
        selectedDate,
        preferredWorkoutTime,
        60
      ),
    [events, selectedPlan, selectedDate, preferredWorkoutTime]
  );

  const workoutType = selectedPlan?.workoutType || "rest";
  const WorkoutIcon = WORKOUT_ICONS[workoutType] || BedDouble;
  const workoutColor = WORKOUT_COLORS[workoutType as keyof typeof WORKOUT_COLORS] || WORKOUT_COLORS.rest;

  const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const isSelectedToday = selectedDay === dayIndex;
  const dayLabel = isSelectedToday ? "Heute" : (DAY_NAMES[selectedDay] || "Tagesplan");

  function handleApplyReschedule(slot: FreeTimeSlot) {
    setPreferredWorkoutTime(slot.startTime);
    setRescheduleSuccessMsg(`Workout erfolgreich auf ${slot.startTime} Uhr verschoben!`);
    setTimeout(() => setRescheduleSuccessMsg(null), 3000);
    onReschedule?.(slot);
  }

  function formatTime(timeStr: string) {
    return timeStr;
  }

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-4 shadow-xl shadow-black/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-900 border border-white/10 text-blue-400 flex items-center justify-center">
            <Calendar size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <span>{dayLabel}: Training & Termine</span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Kollisionen vermeiden & freie Fenster nutzen
            </p>
          </div>
        </div>

        {onOpenFullCalendar && (
          <button
            onClick={onOpenFullCalendar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-700 hover:border-zinc-500 text-zinc-200 hover:text-white text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs"
          >
            <ExternalLink size={12} className="text-zinc-400" />
            <span>Auto-Planung</span>
          </button>
        )}
      </div>

      {/* Success message */}
      {rescheduleSuccessMsg && (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2 animate-in zoom-in-95">
          <CheckCircle2 size={16} />
          <span>{rescheduleSuccessMsg}</span>
        </div>
      )}

      {/* Workout Card */}
      <div className={cn(
        "p-4 rounded-2xl border transition-all flex items-center gap-4",
        conflictInfo.hasConflict
          ? "bg-rose-500/5 border-rose-500/20"
          : "bg-zinc-950/50 border-zinc-800/50"
      )}>
        <div className={cn("p-3 rounded-xl shrink-0", workoutColor.bgLight, workoutColor.text)}>
          <WorkoutIcon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={cn("text-sm font-bold truncate", workoutColor.text)}>
              {selectedPlan?.title || "Kein Workout geplant"}
            </h4>
            {conflictInfo.hasConflict && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                Kollision
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {selectedPlan?.description || "Keine Beschreibung"}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {preferredWorkoutTime} Uhr
            </span>
            <span className="flex items-center gap-1">
              <Zap size={12} />
              60 Min
            </span>
          </div>
        </div>
      </div>

      {/* Conflict Alert or Free Status */}
      {conflictInfo.hasConflict ? (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-3">
          <div className="flex items-center gap-2 font-bold text-xs">
            <AlertTriangle size={16} className="text-rose-400" />
            <span>Termin-Kollision erkannt!</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Dein geplantes Workout ({preferredWorkoutTime} Uhr) kollidiert mit{" "}
            <strong className="text-rose-300">
              „{conflictInfo.conflictingEvent?.title}“
            </strong>{" "}
            ({conflictInfo.conflictingEvent?.startTime}–{conflictInfo.conflictingEvent?.endTime} Uhr).
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <div>
              <h4 className="text-xs font-bold">Keine Terminkonflikte</h4>
              <p className="text-[11px] text-zinc-400">
                Dein Zeitfenster ({preferredWorkoutTime} Uhr) ist frei für Training!
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Optimal
          </span>
        </div>
      )}

      {/* Free Slot Suggestions */}
      {conflictInfo.suggestedFreeSlots.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
              Gefundene freie Trainingsfenster:
            </span>
            <span className="text-[10px] text-zinc-500">
              {conflictInfo.suggestedFreeSlots.length} Optionen
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {conflictInfo.suggestedFreeSlots.map((slot, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 transition-all flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-100 font-mono">
                      {slot.startTime} – {slot.endTime} Uhr
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold",
                        slot.quality === "optimal"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-300 border-blue-500/20"
                      )}
                    >
                      {slot.durationMinutes} Min
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">{slot.recommendationNote}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleApplyReschedule(slot)}
                  className="w-full py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap size={13} />
                  <span>Auf {slot.startTime} Uhr legen</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Appointments List */}
      <div className="space-y-2 pt-2 border-t border-white/[0.05]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            Heutige Termine ({events.filter((e) => e.date === selectedDate).length})
          </span>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {events.filter((e) => e.date === selectedDate).length > 0 ? (
            events
              .filter((e) => e.date === selectedDate)
              .map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-100 truncate">{ev.title}</h4>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {ev.startTime} – {ev.endTime} Uhr {ev.location ? `• ${ev.location}` : ""}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {ev.category}
                  </span>
                </div>
              ))
          ) : (
            <p className="text-xs text-zinc-500 text-center py-3">
              Keine Termine für heute hinterlegt.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}