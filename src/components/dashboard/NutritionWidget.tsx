"use client";

import { Utensils, Flame, Dumbbell, ChevronRight, Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NutritionWidget() {
  const { nutritionLogs, nutritionGoals, setActiveView } = useApp();

  const todayStr = getTodayDateString();
  const todayLog = nutritionLogs.find((l) => l.date === todayStr);
  const entries = todayLog?.entries || [];

  const totalKcal = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
  const totalProtein = Math.round(
    entries.reduce((sum, e) => sum + (e.protein || 0), 0) * 10
  ) / 10;

  const goalKcal = nutritionGoals.calories;
  const goalProtein = nutritionGoals.protein;

  const remainingKcal = goalKcal - totalKcal;
  const kcalPct = Math.min(100, Math.round((totalKcal / (goalKcal || 1)) * 100));
  const proteinPct = Math.min(100, Math.round((totalProtein / (goalProtein || 1)) * 100));

  return (
    <div
      onClick={() => setActiveView("nutrition")}
      className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group shadow-sm space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Utensils size={17} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors">
              Ernährung & Makros
            </h3>
            <p className="text-[11px] text-zinc-500">Heutiger Stand</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
          <span>Details</span>
          <ChevronRight size={15} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Calories */}
        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1">
              <Flame size={13} className="text-emerald-400" />
              Kalorien
            </span>
            <span className="font-bold text-zinc-200">
              {totalKcal} <span className="text-zinc-500 font-normal text-[10px]">/ {goalKcal}</span>
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                remainingKcal >= 0 ? "bg-emerald-400" : "bg-rose-500"
              )}
              style={{ width: `${kcalPct}%` }}
            />
          </div>
        </div>

        {/* Protein */}
        <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 flex items-center gap-1">
              <Dumbbell size={13} className="text-blue-400" />
              Protein
            </span>
            <span className="font-bold text-blue-400">
              {totalProtein}g <span className="text-zinc-500 font-normal text-[10px]">/ {goalProtein}g</span>
            </span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all duration-500"
              style={{ width: `${proteinPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
