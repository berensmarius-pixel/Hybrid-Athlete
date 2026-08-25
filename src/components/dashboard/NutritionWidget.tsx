"use client";

import { Utensils, Flame, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useApp } from "@/context/AppContext";
import { cn, getTodayIndex } from "@/lib/utils";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";

interface NutritionWidgetProps {
  selectedDate?: string;
  selectedDay?: number;
}

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NutritionWidget({ selectedDate, selectedDay }: NutritionWidgetProps) {
  const { nutritionLogs, nutritionGoals, garminHealthLogs, setActiveView } = useApp();

  const activeDate = selectedDate || getTodayDateString();
  const currentTodayIndex = getTodayIndex();
  const activeDay = selectedDay !== undefined ? selectedDay : currentTodayIndex;
  const isToday = activeDay === currentTodayIndex;

  const todayLog = nutritionLogs.find((l) => l.date === activeDate);
  const entries = todayLog?.entries || [];

  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);
  const activeCalories = health.activeCaloriesBurned && health.activeCaloriesBurned > 50 ? health.activeCaloriesBurned : 0;

  const totalKcal = Math.round(entries.reduce((sum, e) => sum + (e.calories || 0), 0));
  const totalProtein = Math.round(entries.reduce((sum, e) => sum + (e.protein || 0), 0) * 10) / 10;
  const totalCarbs = Math.round(entries.reduce((sum, e) => sum + (e.carbs || 0), 0) * 10) / 10;
  const totalFat = Math.round(entries.reduce((sum, e) => sum + (e.fat || 0), 0) * 10) / 10;

  // Base goals + dynamic Garmin active calories (100% mathematically balanced)
  const goalKcal = (nutritionGoals.calories || 2500) + activeCalories;
  const goalProtein = nutritionGoals.protein || 160;
  const goalFat = nutritionGoals.fat || 70;
  const remainingCarbKcal = Math.max(0, goalKcal - goalProtein * 4 - goalFat * 9);
  const goalCarbs = Math.round(remainingCarbKcal / 4);

  const kcalPct = Math.min(100, Math.round((totalKcal / (goalKcal || 1)) * 100));
  const proteinPct = Math.min(100, Math.round((totalProtein / (goalProtein || 1)) * 100));
  const carbsPct = Math.min(100, Math.round((totalCarbs / (goalCarbs || 1)) * 100));
  const fatPct = Math.min(100, Math.round((totalFat / (goalFat || 1)) * 100));

  return (
    <div
      onClick={() => setActiveView("nutrition")}
      className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer group shadow-xl shadow-black/30 space-y-4 relative overflow-hidden"
    >
      {/* Ambient Glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shadow-md shadow-emerald-500/10 group-hover:scale-105 transition-transform">
            <Utensils size={18} />
          </div>
          <div>
            <h3 className="text-xs font-black text-zinc-100 group-hover:text-emerald-300 transition-colors flex items-center gap-2 flex-wrap font-mono tracking-tight uppercase">
              <span>Ernährung & Makros</span>
              {!isToday && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {DAY_NAMES[activeDay]}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-zinc-500">
              {isToday ? "Tages-Tracking & Makro-Bilanz" : `Bilanz für ${DAY_NAMES[activeDay]}`}
              {activeCalories > 0 && (
                <span className="text-emerald-400 font-mono"> · +{activeCalories} kcal Aktiv</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0">
          <span className="text-[11px]">Tagebuch</span>
          <ChevronRight size={14} />
        </div>
      </div>

      {/* Main Calories Hero Progress */}
      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-2 relative z-10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-zinc-200">
            <Flame size={15} className="text-emerald-400" />
            <span>Kalorien-Budget</span>
          </div>
          <div className="text-xs font-mono">
            <span className="font-bold text-zinc-100">{totalKcal}</span>
            <span className="text-zinc-600"> / {goalKcal} kcal</span>
          </div>
        </div>

        <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, kcalPct)}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              kcalPct > 100 ? "bg-rose-500" : "bg-linear-to-r from-emerald-500 to-teal-400"
            )}
          />
        </div>
      </div>

      {/* 3 Macro Cards */}
      <div className="grid grid-cols-3 gap-2 relative z-10">
        {[
          { label: "Protein", total: totalProtein, goal: goalProtein, pct: proteinPct, color: "#3b82f6", bar: "bg-blue-500" },
          { label: "Carbs", total: totalCarbs, goal: goalCarbs, pct: carbsPct, color: "#fbbf24", bar: "bg-amber-500" },
          { label: "Fett", total: totalFat, goal: goalFat, pct: fatPct, color: "#ec4899", bar: "bg-pink-500" },
        ].map((m) => (
          <div key={m.label} className="p-2.5 rounded-2xl bg-black/40 border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-medium">{m.label}</span>
              <span className="text-[10px] font-bold font-mono" style={{ color: m.color }}>
                {m.pct}%
              </span>
            </div>
            <div className="text-xs font-bold text-zinc-100 font-mono">
              {m.total} <span className="text-[10px] font-normal text-zinc-600">/ {m.goal}g</span>
            </div>
            <div className="h-1.5 w-full bg-black/60 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, m.pct)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={cn("h-full rounded-full", m.bar)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
