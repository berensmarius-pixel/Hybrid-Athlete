"use client";

import { useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Trash2,
  Sun,
  Moon,
  Coffee,
  Apple,
  Droplet,
  Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { MealType, MealEntry } from "@/types";

const MEAL_CONFIG: Array<{
  type: MealType;
  title: string;
  Icon: React.ElementType;
  iconBg: string;
}> = [
  {
    type: "breakfast",
    title: "Frühstück",
    Icon: Coffee,
    iconBg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  {
    type: "lunch",
    title: "Mittagessen",
    Icon: Sun,
    iconBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  {
    type: "dinner",
    title: "Abendessen",
    Icon: Moon,
    iconBg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
  {
    type: "snack",
    title: "Snacks & Pre/Post-Workout",
    Icon: Apple,
    iconBg: "bg-violet-500/10 border-violet-500/20 text-violet-400",
  },
];

function formatDateGerman(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface NutritionDiaryTabProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenMealModal: (meal: MealType, tab?: "search" | "barcode") => void;
}

export default function NutritionDiaryTab({
  selectedDate,
  onSelectDate,
  onOpenMealModal,
}: NutritionDiaryTabProps) {
  const {
    nutritionLogs,
    nutritionGoals,
    garminHealthLogs,
    removeMealEntry,
    addWaterIntake,
  } = useApp();

  const currentLog = nutritionLogs.find((l) => l.date === selectedDate);
  const entries: MealEntry[] = currentLog?.entries || [];
  const waterMl = currentLog?.waterMl || 0;
  const garminHealth = garminHealthLogs[selectedDate];

  // Plausibility filter: Only apply active burn if > 50 kcal to filter sync lags
  const rawBurned = garminHealth?.activeCaloriesBurned || 0;
  const garminBurned = rawBurned > 50 ? rawBurned : 0;

  // Calculate totals
  const totalKcal = Math.round(entries.reduce((sum, e) => sum + (e.calories || 0), 0));
  const totalProtein = Math.round(
    entries.reduce((sum, e) => sum + (e.protein || 0), 0) * 10
  ) / 10;
  const totalCarbs = Math.round(
    entries.reduce((sum, e) => sum + (e.carbs || 0), 0) * 10
  ) / 10;
  const totalFat = Math.round(
    entries.reduce((sum, e) => sum + (e.fat || 0), 0) * 10
  ) / 10;

  // Goals - 100% mathematically balanced (P*4 + C*4 + F*9 = Kcal)
  const baseGoalKcal = nutritionGoals.calories || 2500;
  const adjustedGoalKcal = baseGoalKcal + garminBurned;
  const goalProtein = nutritionGoals.protein || 160;
  const goalFat = nutritionGoals.fat || 70;

  // Dynamically calculate carbs so total kcal is exactly balanced: (TotalKcal - P*4 - F*9) / 4
  const proteinKcal = goalProtein * 4;
  const fatKcal = goalFat * 9;
  const remainingCarbKcal = Math.max(0, adjustedGoalKcal - proteinKcal - fatKcal);
  const goalCarbs = Math.round(remainingCarbKcal / 4);

  const goalWater = (nutritionGoals.waterMl || 3000) + Math.round(garminBurned * 0.8);

  const remainingKcal = adjustedGoalKcal - totalKcal;
  const proteinPct = Math.min(100, Math.round((totalProtein / (goalProtein || 1)) * 100));
  const carbsPct = Math.min(100, Math.round((totalCarbs / (goalCarbs || 1)) * 100));
  const fatPct = Math.min(100, Math.round((totalFat / (goalFat || 1)) * 100));
  const kcalPct = Math.min(100, Math.round((totalKcal / (adjustedGoalKcal || 1)) * 100));
  const waterPct = Math.min(100, Math.round((waterMl / (goalWater || 1)) * 100));

  const stepDate = useCallback(
    (delta: number) => {
      const d = new Date(selectedDate + "T00:00:00");
      d.setDate(d.getDate() + delta);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      onSelectDate(`${year}-${month}-${day}`);
    },
    [selectedDate, onSelectDate]
  );

  // Keyboard navigation shortcuts: ArrowLeft & ArrowRight
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowLeft") {
        stepDate(-1);
      } else if (e.key === "ArrowRight") {
        stepDate(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepDate]);

  const isToday = selectedDate === getTodayDateString();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 2xl:grid-cols-12 gap-4 sm:gap-6 items-start">
      {/* ── Left Column: Targets & Water ───────────────────────────────── */}
      <div className="lg:col-span-5 2xl:col-span-5 space-y-3 sm:space-y-4">
        {/* Date Strip / Selector with keyboard hints */}
        <div className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <button
            onClick={() => stepDate(-1)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
            title="Vorheriger Tag (Pfeiltaste links)"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-emerald-400" />
            <span className="text-sm font-semibold text-zinc-200">
              {formatDateGerman(selectedDate)}
            </span>
            {isToday ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Heute
              </span>
            ) : (
              <button
                onClick={() => onSelectDate(getTodayDateString())}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Zu Heute
              </button>
            )}
          </div>

          <button
            onClick={() => stepDate(1)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
            title="Nächster Tag (Pfeiltaste rechts)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Primary Macro & Calorie Ring Card */}
        <div className="p-5 rounded-3xl bg-linear-to-b from-zinc-900 to-zinc-900/70 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Kalorien-Budget
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-zinc-100 tracking-tight font-mono">
                  {totalKcal}
                </span>
                <span className="text-sm text-zinc-400 font-medium">
                  / {adjustedGoalKcal} kcal
                </span>
              </div>
              {garminBurned > 0 && (
                <span className="text-[11px] text-cyan-400 font-medium flex items-center gap-1 mt-0.5">
                  <Zap size={12} />
                  + {garminBurned} kcal Aktiv-Verbrauch (Garmin)
                </span>
              )}
            </div>

            <div className="text-right">
              <span className="text-[11px] text-zinc-400 block">Verbleibend</span>
              <span
                className={cn(
                  "text-xl font-black font-mono",
                  remainingKcal >= 0 ? "text-emerald-400" : "text-rose-400"
                )}
              >
                {remainingKcal >= 0 ? remainingKcal : `+${Math.abs(remainingKcal)} Über`}
              </span>
              <span className="text-[10px] text-zinc-500 block">kcal</span>
            </div>
          </div>

          {/* Calorie Progress Bar */}
          <div className="w-full h-2.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                remainingKcal >= 0
                  ? "bg-linear-to-r from-emerald-500 to-teal-400 shadow-xs shadow-emerald-500/50"
                  : "bg-linear-to-r from-amber-500 to-rose-500"
              )}
              style={{ width: `${kcalPct}%` }}
            />
          </div>

          {/* 3 Macro Cards with Linear Progress Bars */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {/* Protein Card with Progress Bar */}
            <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 text-center space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 font-medium">Protein</span>
                <span className="text-blue-400 font-bold">{proteinPct}%</span>
              </div>
              <p className="text-sm sm:text-base font-black text-blue-300 font-mono">
                {totalProtein} <span className="text-[10px] font-normal text-zinc-500">/ {goalProtein}g</span>
              </p>
              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${proteinPct}%` }}
                />
              </div>
            </div>

            {/* Carbs Card with Progress Bar */}
            <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 text-center space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 font-medium">Carbs</span>
                <span className="text-amber-400 font-bold">{carbsPct}%</span>
              </div>
              <p className="text-sm sm:text-base font-black text-amber-300 font-mono">
                {totalCarbs} <span className="text-[10px] font-normal text-zinc-500">/ {goalCarbs}g</span>
              </p>
              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${carbsPct}%` }}
                />
              </div>
            </div>

            {/* Fat Card with Progress Bar */}
            <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 text-center space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 font-medium">Fett</span>
                <span className="text-rose-400 font-bold">{fatPct}%</span>
              </div>
              <p className="text-sm sm:text-base font-black text-rose-300 font-mono">
                {totalFat} <span className="text-[10px] font-normal text-zinc-500">/ {goalFat}g</span>
              </p>
              <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-500"
                  style={{ width: `${fatPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hydration Status Bar with Live Visualizer */}
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-3.5 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Droplet size={18} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>Hydration & Wasser</span>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-cyan-500/15 text-cyan-300 font-bold font-mono">
                    {waterPct}%
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-400">Ziel: {(goalWater / 1000).toFixed(1)} Liter</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-base font-black font-mono text-cyan-400 block">
                {(waterMl / 1000).toFixed(2)} L
              </span>
              <span className="text-[10px] text-zinc-500">
                {Math.max(0, goalWater - waterMl)} ml offen
              </span>
            </div>
          </div>

          {/* Hydration Progress Visualizer */}
          <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80 p-0.5">
            <div
              className="h-full bg-linear-to-r from-cyan-500 via-blue-500 to-indigo-500 rounded-full transition-all duration-500 shadow-sm shadow-cyan-500/50"
              style={{ width: `${waterPct}%` }}
            />
          </div>

          {/* Quick Add Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {[250, 500, 750].map((ml) => (
              <button
                key={ml}
                onClick={() => addWaterIntake(selectedDate, ml)}
                className="py-2.5 rounded-xl bg-zinc-950 hover:bg-cyan-500/10 border border-zinc-800 hover:border-cyan-500/30 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
              >
                <Plus size={12} className="text-cyan-400" />
                <span>{ml} ml</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Column: 4 Meals Diary ────────────────────────────────── */}
      <div className="lg:col-span-7 2xl:col-span-7 space-y-3 sm:space-y-4">
        {MEAL_CONFIG.map(({ type, title, Icon, iconBg }) => {
          const mealEntries = entries.filter((e) => e.mealType === type);
          const mealKcal = mealEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
          const mealProtein = Math.round(
            mealEntries.reduce((sum, e) => sum + (e.protein || 0), 0) * 10
          ) / 10;

          return (
            <div
              key={type}
              className="rounded-3xl bg-zinc-900/80 border border-zinc-800/80 overflow-hidden space-y-3 p-4 sm:p-5 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-2xl border", iconBg)}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span>{mealKcal} kcal</span>
                      <span>•</span>
                      <span className="text-blue-400 font-semibold">{mealProtein}g Protein</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onOpenMealModal(type, "search")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>Hinzufügen</span>
                </button>
              </div>

              {/* Meal entries list or Full-Width Dashed Empty State Button */}
              {mealEntries.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                  {mealEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-200 truncate">
                          {entry.food.name}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          <span className="text-zinc-300 font-medium">{entry.amount}g</span>
                          {entry.food.brand ? ` • ${entry.food.brand}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-400 block font-mono">
                            {entry.calories} kcal
                          </span>
                          <span className="text-[10px] text-blue-400 block font-mono">
                            {entry.protein}g P
                          </span>
                        </div>
                        <button
                          onClick={() => removeMealEntry(selectedDate, entry.id)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-80 group-hover:opacity-100 cursor-pointer"
                          title="Eintrag entfernen"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => onOpenMealModal(type, "search")}
                  className="w-full py-4 px-3 rounded-2xl border border-dashed border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-500/5 text-zinc-500 hover:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer group/btn"
                >
                  <Plus
                    size={14}
                    className="text-zinc-500 group-hover/btn:text-emerald-400 group-hover/btn:scale-110 transition-transform"
                  />
                  <span>Keine Einträge. Klicke hier, um Lebensmittel hinzuzufügen.</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
