"use client";

import { Utensils, Flame, Dumbbell, ChevronRight, Wheat, Droplet } from "lucide-react";
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
      className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/40 transition-all cursor-pointer group shadow-xl space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
            <Utensils size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors flex items-center gap-2 flex-wrap">
              <span>Ernährung & Makros</span>
              {!isToday && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {DAY_NAMES[activeDay]}
                </span>
              )}
              {activeCalories > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  +{activeCalories} kcal Aktiv
                </span>
              )}
            </h3>
            <p className="text-[11px] text-zinc-400">
              {isToday ? "Tages-Tracking & Makro-Bilanz" : `Ernährungsbilanz für ${DAY_NAMES[activeDay]}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
          <span>Tagebuch</span>
          <ChevronRight size={14} />
        </div>
      </div>

      {/* Main Calories Hero Progress */}
      <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-zinc-200">
            <Flame size={15} className="text-emerald-400" />
            <span>Kalorien-Budget</span>
          </div>
          <div className="text-xs">
            <span className="font-bold text-zinc-100">{totalKcal}</span>
            <span className="text-zinc-500"> / {goalKcal} kcal</span>
          </div>
        </div>

        <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              kcalPct > 100 ? "bg-rose-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(100, kcalPct)}%` }}
          />
        </div>
      </div>

      {/* 3 Macro Cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Protein */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-medium">Protein</span>
            <span className="text-[10px] font-bold text-blue-400">{proteinPct}%</span>
          </div>
          <div className="text-xs font-bold text-zinc-100">
            {totalProtein} <span className="text-[10px] font-normal text-zinc-400">/ {goalProtein}g</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, proteinPct)}%` }}
            />
          </div>
        </div>

        {/* Carbs */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-medium">Carbs</span>
            <span className="text-[10px] font-bold text-amber-400">{carbsPct}%</span>
          </div>
          <div className="text-xs font-bold text-zinc-100">
            {totalCarbs} <span className="text-[10px] font-normal text-zinc-400">/ {goalCarbs}g</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, carbsPct)}%` }}
            />
          </div>
        </div>

        {/* Fat */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-medium">Fett</span>
            <span className="text-[10px] font-bold text-pink-400">{fatPct}%</span>
          </div>
          <div className="text-xs font-bold text-zinc-100">
            {totalFat} <span className="text-[10px] font-normal text-zinc-400">/ {goalFat}g</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, fatPct)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
