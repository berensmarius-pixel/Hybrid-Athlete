"use client";

import dynamic from "next/dynamic";
import { Dumbbell, Bike, Footprints, Moon, Zap, Activity, Calendar, Check, Loader2, LogIn } from "lucide-react";
import { cn, WORKOUT_COLORS, WORKOUT_TYPE_LABELS, generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import type { DayPlan, WorkoutType, GymTemplate, ActiveGymSession, ActiveEnduranceSession, ExerciseEntry } from "@/types";
import { useState } from "react";
import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";

const GarminHubModal = dynamic(() => import("@/components/garmin/GarminHubModal"), { ssr: false });

const WORKOUT_ICONS: Record<WorkoutType, React.ElementType> = {
  gym: Dumbbell,
  cycling: Bike,
  running: Footprints,
  rest: Moon,
  stretching: Moon,
  warmup: Dumbbell,
  mobility: Activity,
};

function templateToEntries(template: GymTemplate): ExerciseEntry[] {
  return template.exercises.map((ex) => ({
    id: generateId(),
    exercise: ex.name,
    sets: ex.sets.map((s) => ({
      id: generateId(),
      type: s.type,
      weight: "",
      reps: "",
      duration: s.targetDuration ?? "",
      rir: s.targetRir ?? "",
    })),
  }));
}

interface WorkoutDetailCardProps {
  day: DayPlan;
}

export default function WorkoutDetailCard({ day }: WorkoutDetailCardProps) {
  const { gymTemplates, setActiveSession, setActiveView } = useApp();
  const [isSchedulingGarmin, setIsSchedulingGarmin] = useState(false);
  const [garminSuccessMsg, setGarminSuccessMsg] = useState<string | null>(null);
  const [garminErrorMsg, setGarminErrorMsg] = useState<string | null>(null);
  const [hubOpen, setHubOpen] = useState(false);

  const colors = WORKOUT_COLORS[day.workoutType];
  const Icon = WORKOUT_ICONS[day.workoutType];

  // Find linked gym template
  const linkedTemplate = day.templateId
    ? gymTemplates.find((t) => t.id === day.templateId)
    : null;

  function handleStart() {
    if (linkedTemplate) {
      setActiveSession({
        kind: linkedTemplate.type === "warmup" ? "warmup" : linkedTemplate.type === "stretching" ? "stretching" : "gym",
        templateId: linkedTemplate.id,
        templateName: linkedTemplate.name,
        entries: templateToEntries(linkedTemplate),
        startTime: new Date().toISOString(),
      } as ActiveGymSession);
    } else if (day.workoutType === "running") {
      setActiveSession({ kind: "endurance", activityType: "running", duration: "", heartRate: "", pace: "", rpe: 5 } as ActiveEnduranceSession);
    } else if (day.workoutType === "cycling") {
      setActiveSession({ kind: "endurance", activityType: "cycling", duration: "", heartRate: "", pace: "", rpe: 5 } as ActiveEnduranceSession);
    }
    setActiveView("training");
  }

  async function handleScheduleToGarmin() {
    setIsSchedulingGarmin(true);
    setGarminSuccessMsg(null);
    setGarminErrorMsg(null);

    // Calculate target date based on dayIndex
    const now = new Date();
    const currentDayIdx = (now.getDay() + 6) % 7; // Monday = 0
    const diffDays = day.dayIndex - currentDayIdx;
    const targetDateObj = new Date(now);
    targetDateObj.setDate(now.getDate() + diffDays);
    const targetDateStr = targetDateObj.toISOString().split("T")[0];

    const workoutPayload = linkedTemplate
      ? {
          name: linkedTemplate.name,
          type: linkedTemplate.type,
          description: day.description,
          exercises: linkedTemplate.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets.map((s) => ({
              targetReps: s.targetReps || 8,
              targetWeight: 0,
              restSeconds: s.restSeconds || 90,
            })),
          })),
        }
      : {
          name: day.title,
          type: day.workoutType,
          description: day.description,
          durationMinutes: 45,
        };

    try {
      const res = await scheduleNativeGarminWorkout(targetDateStr, workoutPayload);
      if (res.success) {
        setGarminSuccessMsg(`Auf Garmin geplant für ${targetDateStr}!`);
        setTimeout(() => setGarminSuccessMsg(null), 5000);
      } else {
        setGarminErrorMsg(res.error || "Fehler beim Planen");
      }
    } catch (err: any) {
      setGarminErrorMsg(err.message || "Netzwerkfehler");
    } finally {
      setIsSchedulingGarmin(false);
    }
  }

  const canStart = day.workoutType !== "rest" && day.workoutType !== "stretching" && day.workoutType !== "warmup"
    ? true
    : linkedTemplate != null;

  return (
    <>
      <div
        id="today-workout-card"
        className={cn(
          "mx-4 rounded-2xl overflow-hidden border transition-all duration-300",
          colors.border,
          "border-opacity-40 bg-zinc-900"
        )}
      >
        {/* Colored top accent strip */}
        <div className={cn("h-1 w-full", colors.bg)} />

        <div className="p-5">
          {/* Badge + Icon row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex gap-2 items-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                  colors.badge
                )}
              >
                <Icon size={12} strokeWidth={2.5} />
                {WORKOUT_TYPE_LABELS[day.workoutType]}
              </span>
              {day.isDeload && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-blue-400 border border-blue-500/30">
                  Deload
                </span>
              )}
              {day.isCompleted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Check size={12} strokeWidth={3} />
                  Absolviert
                </span>
              )}
            </div>

            <div
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center",
                colors.bgLight
              )}
            >
              <Icon size={22} className={colors.text} strokeWidth={1.8} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-zinc-100 mb-1 leading-tight">
            {day.title}
          </h2>

          {/* Day label */}
          <p className={cn("text-sm font-medium mb-3", colors.text)}>
            {day.dayFull}
          </p>

          {/* Description */}
          {day.description && (
            <p className="text-sm text-zinc-400 leading-relaxed mb-4">{day.description}</p>
          )}

          {/* Linked template exercises */}
          {linkedTemplate && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Übungen</p>
              <div className="flex flex-wrap gap-1.5">
                {linkedTemplate.exercises.map((ex) => (
                  <span
                    key={ex.id}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      colors.bgLight,
                      colors.text,
                      "border border-current border-opacity-20"
                    )}
                  >
                    {ex.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weather Context Advice for Outdoor / Cycling / Running */}
          {(day.workoutType === "cycling" || day.workoutType === "running") && (
            <div className="mb-4 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">🌦️</span>
              <div className="leading-relaxed">
                <span className="font-bold text-cyan-300">Wetter-Empfehlung: </span>
                <span>Regenschauer am Nachmittag gemeldet. Optimales Zeitfenster: </span>
                <span className="font-bold text-zinc-100">18:00 – 20:00 Uhr</span>
                <span>
                  {day.workoutType === "cycling"
                    ? " oder Indoor auf Smart Trainer / Rolle (Zwift)."
                    : " oder Indoor auf dem Laufband."}
                </span>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {garminSuccessMsg && (
            <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <Check size={14} className="shrink-0" />
              <span>{garminSuccessMsg}</span>
            </div>
          )}

          {garminErrorMsg && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
              <span className="truncate">{garminErrorMsg}</span>
              <button
                onClick={() => setHubOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <LogIn size={12} />
                Einloggen →
              </button>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex items-center gap-2 pt-1">
            {canStart && (
              <button
                onClick={handleStart}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]",
                  day.isCompleted
                    ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                    : colors.bg,
                  "hover:opacity-90 shadow-md shadow-black/30 cursor-pointer"
                )}
              >
                {day.isCompleted ? (
                  <>
                    <Check size={15} className="text-emerald-400" />
                    <span>Absolviert (Erneut starten)</span>
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    <span>Training starten</span>
                  </>
                )}
              </button>
            )}

            {day.workoutType !== "rest" && (
              <button
                onClick={handleScheduleToGarmin}
                disabled={isSchedulingGarmin}
                className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 text-cyan-400 border border-cyan-500/30 transition-all disabled:opacity-50 cursor-pointer"
                title="Direkt auf Garmin Uhr & Kalender planen"
              >
                {isSchedulingGarmin ? (
                  <Loader2 size={15} className="animate-spin text-cyan-400" />
                ) : (
                  <Calendar size={15} />
                )}
                <span className="hidden sm:inline">Auf Garmin</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {hubOpen && <GarminHubModal isOpen={hubOpen} onClose={() => setHubOpen(false)} />}
    </>
  );
}
