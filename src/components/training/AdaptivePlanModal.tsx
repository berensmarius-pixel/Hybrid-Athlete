"use client";

import { useState } from "react";
import {
  X,
  Zap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Activity,
  Bike,
  Dumbbell,
  Clock,
  Gauge,
  ArrowRight,
  Flame,
  Check,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { AdaptiveWorkoutSuggestion } from "@/lib/adaptiveWorkoutEngine";
import type { DayPlan, WorkoutType } from "@/types";

interface AdaptivePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestion: AdaptiveWorkoutSuggestion;
}

export default function AdaptivePlanModal({ isOpen, onClose, suggestion }: AdaptivePlanModalProps) {
  const { weeklyPlan, updateWeeklyPlan, saveEnduranceTemplate, saveGymTemplate } = useApp();

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(suggestion.dayIndexToModify);
  const [isApplied, setIsApplied] = useState(false);

  if (!isOpen) return null;

  const workout = suggestion.recommendedWorkout;

  function handleApply() {
    // 1. Update weekly plan
    const nextPlan = weeklyPlan.map((d) => {
      if (d.dayIndex === selectedDayIndex) {
        return {
          ...d,
          workoutType: workout.workoutType,
          title: workout.title,
          description: workout.description,
          isCompleted: false,
        };
      }
      return d;
    });

    updateWeeklyPlan(nextPlan);

    // 2. Also save as a template in library
    if (workout.workoutType === "cycling" || workout.workoutType === "running") {
      saveEnduranceTemplate({
        id: `adaptive_${Date.now()}`,
        name: workout.title,
        type: workout.workoutType,
        estimatedDuration: `${workout.targetDurationMins} Min`,
        description: workout.description,
      });
    }

    setIsApplied(true);
    setTimeout(() => {
      setIsApplied(false);
      onClose();
    }, 1200);
  }

  const daysShort = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-amber-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Zap size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                  {suggestion.title}
                </h2>
              </div>
              <p className="text-xs text-zinc-400">
                Automatische Garmin Belastungs- & Formsteuerung
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Reason Alert */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle size={15} />
              <span>Garmin Analyse</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">{suggestion.reason}</p>
            <p className="text-[11px] text-amber-400/90 font-medium">{suggestion.impactExplanation}</p>
          </div>

          {/* Recommended Workout Box */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {workout.sport === "cycling" ? <Bike size={16} /> : workout.sport === "running" ? <Activity size={16} /> : <Dumbbell size={16} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">{workout.title}</h4>
                  <span className="text-xs text-cyan-400 font-medium">{workout.targetZone}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-zinc-200 block">{workout.targetDurationMins} Min</span>
                <span className="text-[10px] text-emerald-400 font-semibold block">+{workout.estimatedLoadGain} Lastpunkte</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-2">
              {workout.description}
            </p>

            {/* Structured Intervals Table if available */}
            {workout.structuredIntervals && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                  Intervall-Struktur:
                </span>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {workout.structuredIntervals.map((iv, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between text-xs p-2 rounded-xl border ${
                        iv.phase === "Intervall"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                          : iv.phase === "Pause"
                          ? "bg-blue-500/5 border-blue-500/20 text-blue-300"
                          : "bg-zinc-900/80 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{iv.durationMins} Min</span>
                        <span>{iv.phase}</span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">{iv.targetDetail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Choose target day in weekly plan */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-300">
              In welchem Wochentag soll die Einheit eingeplant werden?
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {daysShort.map((dayName, idx) => {
                const isSelected = selectedDayIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDayIndex(idx)}
                    className={`py-2 px-1 text-center rounded-xl border text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span className="block text-[10px] opacity-75">{dayName.slice(0, 2)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold"
          >
            Schließen
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={isApplied}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all"
          >
            {isApplied ? (
              <>
                <Check size={16} />
                <span>Erfolgreich eingeplant!</span>
              </>
            ) : (
              <>
                <Zap size={15} />
                <span>Für {daysShort[selectedDayIndex]} übernehmen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
