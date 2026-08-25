"use client";

import dynamic from "next/dynamic";
import { Dumbbell, Bike, Footprints, Moon, Zap, Activity, Calendar, Check, Loader2, LogIn } from "lucide-react";
import { cn, WORKOUT_COLORS, WORKOUT_TYPE_LABELS, generateId, getLocalDateString } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import type { DayPlan, WorkoutType, GymTemplate, ActiveGymSession, ActiveEnduranceSession, ExerciseEntry } from "@/types";
import { useState } from "react";
import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";
import type { GarminWorkoutPayload } from "@/lib/garmin/garminService";
import { motion } from "motion/react";

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

    const now = new Date();
    const currentDayIdx = (now.getDay() + 6) % 7;
    const diffDays = day.dayIndex - currentDayIdx;
    const targetDateObj = new Date(now);
    targetDateObj.setDate(now.getDate() + diffDays);
    const targetDateStr = getLocalDateString(targetDateObj);

    const workoutPayload: GarminWorkoutPayload = linkedTemplate
      ? {
          name: linkedTemplate.name,
          type: (linkedTemplate.type === "gym" ||
            linkedTemplate.type === "stretching" ||
            linkedTemplate.type === "warmup" ||
            linkedTemplate.type === "mobility"
            ? "gym"
            : "strength") as "gym" | "strength",
          description: day.description,
          exercises: linkedTemplate.exercises.map((ex) => ({
            name: ex.name,
            sets: ex.sets.map((s) => ({
              reps: s.targetReps || 8,
              weight: 0,
            })),
          })),
        }
      : {
          name: day.title,
          type:
            day.workoutType === "running"
              ? "running"
              : day.workoutType === "cycling"
                ? "cycling"
                : "gym",
          description: day.description,
          exercises: [],
        };

    try {
      const res = await scheduleNativeGarminWorkout(targetDateStr, workoutPayload);
      if (res.success && (res as { duplicate?: boolean }).duplicate) {
        setGarminSuccessMsg(`Bereits für ${targetDateStr} geplant – kein Duplikat erstellt.`);
        setTimeout(() => setGarminSuccessMsg(null), 5000);
      } else if (res.success) {
        setGarminSuccessMsg(`Auf Garmin geplant für ${targetDateStr}!`);
        setTimeout(() => setGarminSuccessMsg(null), 5000);
      } else {
        setGarminErrorMsg(res.error || "Fehler beim Planen");
      }
    } catch (err: unknown) {
      setGarminErrorMsg(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setIsSchedulingGarmin(false);
    }
  }

  const canStart = day.workoutType !== "rest" && day.workoutType !== "stretching" && day.workoutType !== "warmup"
    ? true
    : linkedTemplate != null;

  return (
    <>
      <motion.div
        id="today-workout-card"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl shadow-black/40 relative"
      >
        {/* Accent top gradient glow strip */}
        <div className={cn("h-1.5 w-full bg-gradient-to-r", colors.bg, "to-transparent")} />

        <div className="p-5 sm:p-6">
          {/* Badge + Icon row */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono",
                  colors.badge
                )}
              >
                <Icon size={13} strokeWidth={2.5} />
                {WORKOUT_TYPE_LABELS[day.workoutType].toUpperCase()}
              </span>
              {day.isDeload && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-800 text-blue-400 border border-blue-500/30 font-mono">
                  DELOAD
                </span>
              )}
              {day.isCompleted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  <Check size={12} strokeWidth={3} />
                  ABSOLVIERT
                </span>
              )}
            </div>

            <div
              className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg",
                colors.bgLight
              )}
            >
              <Icon size={22} className={colors.text} strokeWidth={2} />
            </div>
          </div>

          {/* Title & Day label */}
          <h2 className="text-xl sm:text-2xl font-black text-zinc-100 mb-1 leading-tight tracking-tight">
            {day.title}
          </h2>

          <p className={cn("text-xs sm:text-sm font-semibold mb-3 font-mono", colors.text)}>
            {day.dayFull}
          </p>

          {/* Description */}
          {day.description && (
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-4">{day.description}</p>
          )}

          {/* Linked template exercises */}
          {linkedTemplate && (
            <div className="mb-5">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2 font-mono">Übungsablauf ({linkedTemplate.exercises.length} Übungen)</p>
              <div className="flex flex-wrap gap-1.5">
                {linkedTemplate.exercises.map((ex) => (
                  <span
                    key={ex.id}
                    className="px-3 py-1 rounded-xl text-xs font-semibold bg-white/[0.04] text-zinc-200 border border-white/10"
                  >
                    {ex.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weather Advice for Outdoor Workouts */}
          {(day.workoutType === "cycling" || day.workoutType === "running") && (
            <div className="mb-4 p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-200 text-xs flex items-start gap-3">
              <span className="text-lg shrink-0">🌦️</span>
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
            <div className="mb-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <Check size={14} className="shrink-0" />
              <span>{garminSuccessMsg}</span>
            </div>
          )}

          {garminErrorMsg && (
            <div className="mb-3 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between gap-2">
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
          <div className="flex items-center gap-2.5 pt-1">
            {canStart && (
              <button
                onClick={handleStart}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl text-sm font-bold text-black transition-all active:scale-[0.98] cursor-pointer shadow-lg",
                  day.isCompleted
                    ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10"
                    : "bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 shadow-cyan-500/25"
                )}
              >
                {day.isCompleted ? (
                  <>
                    <Check size={16} className="text-emerald-400" />
                    <span>Absolviert (Erneut starten)</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} className="fill-current" />
                    <span>Training starten</span>
                  </>
                )}
              </button>
            )}

            {day.workoutType !== "rest" && (
              <button
                onClick={handleScheduleToGarmin}
                disabled={isSchedulingGarmin}
                className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-2xl text-sm font-bold bg-white/[0.05] hover:bg-white/[0.1] text-cyan-300 border border-cyan-500/30 transition-all disabled:opacity-50 cursor-pointer"
                title="Direkt auf Garmin Uhr & Kalender planen"
              >
                {isSchedulingGarmin ? (
                  <Loader2 size={16} className="animate-spin text-cyan-400" />
                ) : (
                  <Calendar size={16} />
                )}
                <span className="hidden sm:inline">Auf Garmin</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {hubOpen && <GarminHubModal isOpen={hubOpen} onClose={() => setHubOpen(false)} />}
    </>
  );
}
