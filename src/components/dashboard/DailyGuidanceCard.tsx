"use client";

import { useState } from "react";
import {
  Sparkles,
  Dumbbell,
  Utensils,
  ChevronDown,
  ChevronUp,
  Flame,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateHolisticGuidance } from "@/lib/adaptiveEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { getTodayIndex } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function DailyGuidanceCard() {
  const {
    garminHealthLogs,
    weeklyPlan,
    nutritionGoals,
    nutritionLogs,
    garminActivities,
    setActiveView,
  } = useApp();

  const [expandedMeals, setExpandedMeals] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayHealth = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);
  const todayWorkout = weeklyPlan[getTodayIndex()];
  const todayNutrition = nutritionLogs.find((l) => l.date === todayStr);

  const guidance = generateHolisticGuidance({
    health: todayHealth,
    plannedWorkout: todayWorkout,
    nutritionGoals,
    loggedNutrition: todayNutrition,
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

  const badge = getStatusBadge();

  return (
    <div className="p-4 rounded-2xl bg-linear-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 shadow-xl space-y-4">
      {/* Top Title Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-linear-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              Ganzheitlicher Tages-Guide
            </h3>
            <p className="text-[11px] text-zinc-400">
              Garmin Readiness + Hybrid-Training + Fueling Plan
            </p>
          </div>
        </div>

        <span
          className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
            badge.bg
          )}
        >
          {badge.text}
        </span>
      </div>

      {/* ── Section 1: Training Instruction ─────────────────────────────────── */}
      <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell size={15} className="text-blue-400" />
            <h4 className="text-xs font-bold text-zinc-200">
              {trainingAdvice.headline}
            </h4>
          </div>
          <button
            onClick={() => setActiveView("training")}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
          >
            <span>Training</span>
            <ArrowRight size={12} />
          </button>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {trainingAdvice.description}
        </p>
        {todayWorkout && (
          <div className="pt-1 flex items-center gap-2 text-xs text-zinc-300">
            <span className="text-zinc-500">Heutiger Plan:</span>
            <span className="font-semibold text-zinc-200">
              {todayWorkout.title}
            </span>
          </div>
        )}
      </div>

      {/* ── Section 2: Adaptive Nutrition & Fueling ─────────────────────────── */}
      <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils size={15} className="text-emerald-400" />
            <h4 className="text-xs font-bold text-zinc-200">
              Ernährungs- & Fueling-Strategie
            </h4>
          </div>
          <button
            onClick={() => setActiveView("nutrition")}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
          >
            <span>Tracker</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Dynamic Calorie Target Box */}
        <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-400 block">
              Angepasster Tagesbedarf
            </span>
            <span className="text-sm font-extrabold text-emerald-400">
              {nutritionAdvice.adjustedCalories} kcal
            </span>
          </div>
          <div className="text-right text-[11px] text-zinc-400 space-x-2">
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
          className="w-full pt-1.5 text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1 transition-colors border-t border-zinc-800/60"
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
                className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/70 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-zinc-300 font-semibold">
                  <span className="text-amber-300 text-[11px] flex items-center gap-1">
                    <Clock size={11} />
                    {m.timing}
                  </span>
                  <span className="text-zinc-400 text-[11px]">
                    {m.carbsG}g Carbs • {m.proteinG}g Protein
                  </span>
                </div>
                <p className="font-medium text-zinc-200">{m.title}</p>
                <p className="text-[11px] text-zinc-400">{m.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
