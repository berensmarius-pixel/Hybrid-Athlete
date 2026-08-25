"use client";

import { useState, useMemo } from "react";
import {
  X,
  Target,
  Sparkles,
  Check,
  Flame,
  Dumbbell,
  Droplet,
  Zap,
  Activity,
  ShieldCheck,
  Scale,
  RefreshCw,
  Info,
  TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  calculateAICoachMacros,
  type AthleteFocusGoal,
} from "@/lib/nutrition/aiMacroEngine";
import { getTodayIndex, getLocalDateString, cn } from "@/lib/utils";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { motion } from "motion/react";

interface NutritionGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOAL_OPTIONS: Array<{
  id: AthleteFocusGoal;
  label: string;
  sublabel: string;
  icon: string;
  badge: string;
}> = [
  {
    id: "recomp",
    label: "Hybrid Recomp",
    sublabel: "Simultaner Muskelaufbau & Fettverbrennung (Erhaltungskalorien + Carb-Timing)",
    icon: "⚡",
    badge: "Empfohlen für Hybrid-Athleten",
  },
  {
    id: "hypertrophy",
    label: "Hypertrophie / Aufbau",
    sublabel: "Leichter Kalorienüberschuss (+10%) & 2.1g Protein/kg für maximales Muskelwachstum",
    icon: "🏋️‍♂️",
    badge: "+280 kcal Überschuss",
  },
  {
    id: "endurance",
    label: "Ausdauer & Wettkampf",
    sublabel: "Hohe Kohlenhydrat-Periodisierung zur maximalen Glykogen-Bereitstellung",
    icon: "🏃‍♂️",
    badge: "High-Carb Fokus",
  },
  {
    id: "cut",
    label: "Fettabbau / Definierter Cut",
    sublabel: "Moderates Defizit (-15%) mit erhöhtem Protein (2.3g/kg) für maximalen Muskelschutz",
    icon: "✂️",
    badge: "-450 kcal Defizit",
  },
];

export default function NutritionGoalsModal({
  isOpen,
  onClose,
}: NutritionGoalsModalProps) {
  const {
    nutritionGoals,
    setNutritionGoals,
    bodyWeightLog,
    garminHealthLogs,
    weeklyPlan,
  } = useApp();

  const todayStr = getLocalDateString();
  const currentTodayIndex = getTodayIndex();
  const todayPlannedWorkout = weeklyPlan.find((p) => p.dayIndex === currentTodayIndex);
  const garminHealth = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);
  const latestWeight = bodyWeightLog.length > 0 ? bodyWeightLog[0] : null;

  const [athleteGoal, setAthleteGoal] = useState<AthleteFocusGoal>(
    (nutritionGoals.athleteGoal as AthleteFocusGoal) || "recomp"
  );
  const [isAutoPilot, setIsAutoPilot] = useState<boolean>(
    nutritionGoals.isAutoPilot !== undefined ? nutritionGoals.isAutoPilot : true
  );

  // Live calculation from AI Coach Engine
  const aiCalculation = useMemo(() => {
    return calculateAICoachMacros({
      latestWeightEntry: latestWeight,
      garminHealth,
      todayPlannedWorkout,
      athleteGoal,
      customHeightCm: 180,
      customAge: 26,
      gender: "male",
    });
  }, [latestWeight, garminHealth, todayPlannedWorkout, athleteGoal]);

  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleApplyAICoachGoals = () => {
    setNutritionGoals({
      ...aiCalculation.goals,
      isAutoPilot: true,
      athleteGoal,
    });
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const weightKg = latestWeight?.weight || 80.0;
  const activeBurn = garminHealth?.activeCaloriesBurned || (todayPlannedWorkout?.workoutType !== "rest" ? 350 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden glass-panel"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100 font-mono tracking-tight">
                  KI-COACH ERNÄHRUNGS-AUTOPILOT
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  LIVE
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Automatische Makro- & Kalorienberechnung anhand deiner Telemetrie
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* AI Coach Auto-Pilot Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-teal-950/30 to-zinc-900/80 border border-emerald-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Zap size={16} />
                <span>KI-Coach Auto-Pilot aktiv</span>
              </div>
              <span className="text-[11px] text-zinc-400 font-mono">
                {weightKg.toFixed(1)} kg • Garmin Sync aktiv
              </span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {aiCalculation.breakdown.explanation}
            </p>
          </div>

          {/* Telemetry Sources (Weight + Garmin + Workout) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400">
                <Scale size={13} className="text-blue-400" />
                <span>Körpergewicht</span>
              </div>
              <p className="text-sm font-bold text-zinc-100 font-mono">{weightKg.toFixed(1)} kg</p>
              <p className="text-[10px] text-zinc-500">Insmart BIA</p>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400">
                <Flame size={13} className="text-emerald-400" />
                <span>Garmin Burn</span>
              </div>
              <p className="text-sm font-bold text-emerald-400 font-mono">+{activeBurn} kcal</p>
              <p className="text-[10px] text-zinc-500">Aktiv-Verbrauch</p>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 text-center space-y-1">
              <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400">
                <Activity size={13} className="text-cyan-400" />
                <span>Readiness</span>
              </div>
              <p className="text-sm font-bold text-cyan-400 font-mono">
                {garminHealth?.trainingReadiness || 70}/100
              </p>
              <p className="text-[10px] text-zinc-500">Regeneration</p>
            </div>
          </div>

          {/* Goal Focus Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider px-1 flex items-center justify-between">
              <span>Wähle deinen primären Trainings-Fokus</span>
              <span className="text-[10px] text-zinc-500 font-normal">KI passt Makros sofort an</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GOAL_OPTIONS.map((opt) => {
                const isSelected = athleteGoal === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAthleteGoal(opt.id)}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-1.5",
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-zinc-100 shadow-md shadow-emerald-500/10"
                        : "bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-zinc-200 flex items-center gap-1.5">
                        <span>{opt.icon}</span>
                        <span>{opt.label}</span>
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {opt.sublabel}
                    </p>
                    <div className="pt-1">
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                        isSelected
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                      )}>
                        {opt.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Coach Calculated Targets Preview */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <Target size={15} className="text-emerald-400" />
                Vom KI-Coach berechnete Tagesziele
              </span>
              <span className="text-xs font-black text-emerald-400 font-mono">
                {aiCalculation.goals.calories} kcal
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <p className="text-[10px] text-zinc-400">Protein</p>
                <p className="text-sm font-bold text-blue-400 font-mono mt-0.5">
                  {aiCalculation.goals.protein}g
                </p>
                <p className="text-[9px] text-zinc-500">
                  {aiCalculation.breakdown.proteinGPerKg} g/kg
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <p className="text-[10px] text-zinc-400">Carbs</p>
                <p className="text-sm font-bold text-amber-400 font-mono mt-0.5">
                  {aiCalculation.goals.carbs}g
                </p>
                <p className="text-[9px] text-zinc-500">Glykogen</p>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <p className="text-[10px] text-zinc-400">Fett</p>
                <p className="text-sm font-bold text-rose-400 font-mono mt-0.5">
                  {aiCalculation.goals.fat}g
                </p>
                <p className="text-[9px] text-zinc-500">Hormone</p>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
                <p className="text-[10px] text-zinc-400">Wasser</p>
                <p className="text-sm font-bold text-cyan-400 font-mono mt-0.5">
                  {Math.round(aiCalculation.goals.waterMl / 100) / 10}L
                </p>
                <p className="text-[9px] text-zinc-500">Hydration</p>
              </div>
            </div>

            {/* Formula Highlights */}
            <div className="space-y-1 pt-1">
              {aiCalculation.breakdown.highlights.map((h, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <Check size={12} className="text-emerald-400 shrink-0" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer / Apply Action */}
        <div className="p-4 border-t border-white/10 bg-zinc-900/90 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors cursor-pointer"
          >
            Schließen
          </button>

          <button
            type="button"
            onClick={handleApplyAICoachGoals}
            className="flex-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-black text-xs shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {savedSuccess ? (
              <>
                <Check size={16} />
                <span>KI-Ziele übernommen!</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>KI-Coach Ziele synchronisieren</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
