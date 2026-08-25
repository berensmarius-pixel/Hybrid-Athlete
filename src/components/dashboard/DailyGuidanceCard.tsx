"use client";

import { useState } from "react";
import {
  Sparkles,
  Dumbbell,
  Utensils,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateHolisticGuidance } from "@/lib/adaptiveEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { cn, getTodayIndex, getLocalDateString } from "@/lib/utils";

interface DailyGuidanceCardProps {
  selectedDay?: number;
  selectedDate?: string;
}

export default function DailyGuidanceCard({ selectedDay, selectedDate }: DailyGuidanceCardProps) {
  const {
    garminHealthLogs,
    weeklyPlan,
    nutritionGoals,
    nutritionLogs,
    garminActivities,
    setActiveView,
  } = useApp();

  const [expandedMeals, setExpandedMeals] = useState(false);

  const currentTodayIndex = getTodayIndex();
  const dayIndex = selectedDay !== undefined ? selectedDay : currentTodayIndex;
  const activeDate = selectedDate || getLocalDateString();

  const targetHealth = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);
  const targetWorkout = weeklyPlan[dayIndex] || weeklyPlan[0];
  const targetNutrition = nutritionLogs.find((l) => l.date === activeDate);

  const guidance = generateHolisticGuidance({
    health: targetHealth,
    plannedWorkout: targetWorkout,
    nutritionGoals,
    loggedNutrition: targetNutrition,
    activitiesToday: garminActivities,
  });

  const { trainingAdvice, nutritionAdvice, readinessCategory } = guidance;

  const getStatusBadge = () => {
    switch (readinessCategory) {
      case "optimal":
        return {
          text: "Top Form",
          bg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
        };
      case "moderate":
        return {
          text: "Solide",
          bg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
        };
      case "fatigued":
        return {
          text: "Ermüdet",
          bg: "bg-amber-500/10 text-amber-300 border-amber-500/25",
        };
      case "recovery_needed":
        return {
          text: "Regeneration",
          bg: "bg-rose-500/10 text-rose-300 border-rose-500/25",
        };
    }
  };

  const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const isToday = dayIndex === currentTodayIndex;
  const badge = getStatusBadge();

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 shadow-xl shadow-black/30 space-y-4 relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute -top-10 -right-10 w-48 h-48 bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

      {/* Top Title Bar */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-linear-to-br from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 shadow-md shadow-amber-500/10">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight uppercase">
                {isToday ? "Tages-Guide" : `Guide · ${DAY_NAMES[dayIndex]}`}
              </h3>
              {!isToday && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono uppercase tracking-wider">
                  Vorschau
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              Readiness · Hybrid-Training · Fueling-Strategie
            </p>
          </div>
        </div>

        <span
          className={cn(
            "text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider font-mono relative z-10",
            badge.bg
          )}
        >
          {badge.text}
        </span>
      </div>

      {/* ── Section 1: Training Instruction ─────────────────────────────────── */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2 relative z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Dumbbell size={15} className="text-blue-400 shrink-0" />
            <h4 className="text-xs font-bold text-zinc-200 truncate">
              {trainingAdvice.headline}
            </h4>
          </div>
          <button
            onClick={() => setActiveView("training")}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-0.5 shrink-0 cursor-pointer"
          >
            <span>Training</span>
            <ArrowRight size={12} />
          </button>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {trainingAdvice.description}
        </p>
        {targetWorkout && (
          <div className="pt-1 flex items-center gap-2 text-xs text-zinc-300">
            <span className="text-zinc-600">{isToday ? "Heute:" : DAY_NAMES[dayIndex] + ":"}</span>
            <span className="font-semibold text-zinc-200">
              {targetWorkout.title}
            </span>
          </div>
        )}
      </div>

      {/* ── Section 2: Adaptive Nutrition & Fueling ─────────────────────────── */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2.5 relative z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Utensils size={15} className="text-emerald-400" />
            <h4 className="text-xs font-bold text-zinc-200">
              Ernährungs- & Fueling-Strategie
            </h4>
          </div>
          <button
            onClick={() => setActiveView("nutrition")}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5 shrink-0 cursor-pointer"
          >
            <span>Tracker</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Dynamic Calorie Target Box */}
        <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-500 block font-mono uppercase tracking-wider">
              Tagesbedarf
            </span>
            <span className="text-sm font-extrabold text-emerald-400 font-mono">
              {nutritionAdvice.adjustedCalories} kcal
            </span>
          </div>
          <div className="text-right text-[11px] text-zinc-400 space-x-2 font-mono">
            <span>
              <strong className="text-blue-400">
                {nutritionAdvice.recommendedProtein}g
              </strong>{" "}
              Protein
            </span>
            <span>•</span>
            <span>
              <strong className="text-amber-400">
                {nutritionAdvice.recommendedCarbs}g
              </strong>{" "}
              Carbs
            </span>
          </div>
        </div>

        {/* Tips list */}
        <ul className="space-y-1 text-xs text-zinc-400">
          {nutritionAdvice.fuelingTips.map((tip, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <CheckCircle2
                size={13}
                className="text-emerald-400 shrink-0 mt-0.5"
              />
              <span>{tip}</span>
            </li>
          ))}
        </ul>

        {/* Toggle Meal Breakdown */}
        <button
          type="button"
          onClick={() => setExpandedMeals(!expandedMeals)}
          className="w-full pt-1.5 text-xs text-zinc-500 hover:text-zinc-300 flex items-center justify-center gap-1 transition-colors border-t border-white/5 cursor-pointer"
        >
          <span>
            {expandedMeals
              ? "Mahlzeiten-Vorschläge schließen"
              : "Konkrete Mahlzeiten & Timing anzeigen"}
          </span>
          {expandedMeals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {expandedMeals && (
          <div className="space-y-2 pt-1">
            {nutritionAdvice.mealSuggestions.map((m, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-zinc-300 font-semibold">
                  <span className="text-amber-300 text-[11px] flex items-center gap-1">
                    <Clock size={11} />
                    {m.timing}
                  </span>
                  <span className="text-zinc-500 text-[11px] font-mono">
                    {m.carbsG}g C · {m.proteinG}g P
                  </span>
                </div>
                <p className="font-medium text-zinc-200">{m.title}</p>
                <p className="text-[11px] text-zinc-500">{m.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
