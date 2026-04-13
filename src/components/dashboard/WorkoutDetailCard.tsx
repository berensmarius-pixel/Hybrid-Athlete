"use client";

import { Dumbbell, Bike, Footprints, Moon, Zap } from "lucide-react";
import { cn, WORKOUT_COLORS, WORKOUT_TYPE_LABELS, generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import type { DayPlan, WorkoutType, GymTemplate, ActiveGymSession, ActiveEnduranceSession, ExerciseEntry } from "@/types";

const WORKOUT_ICONS: Record<WorkoutType, React.ElementType> = {
  gym: Dumbbell,
  cycling: Bike,
  running: Footprints,
  rest: Moon,
  stretching: Moon,
  warmup: Dumbbell,
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

  const canStart = day.workoutType !== "rest" && day.workoutType !== "stretching" && day.workoutType !== "warmup"
    ? true
    : linkedTemplate != null;

  return (
    <div
      className={cn(
        "mx-4 rounded-2xl overflow-hidden border",
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

        {/* Start button */}
        {canStart && (
          <button
            onClick={handleStart}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]",
              colors.bg,
              "hover:opacity-90"
            )}
          >
            <Zap size={15} />
            Training starten
          </button>
        )}
      </div>
    </div>
  );
}
