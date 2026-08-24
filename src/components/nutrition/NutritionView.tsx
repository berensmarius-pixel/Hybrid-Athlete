"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Flame,
  Dumbbell,
  Target,
  Plus,
  Trash2,
  Utensils,
  Sun,
  Moon,
  Coffee,
  Apple,
  Droplet,
  ScanBarcode,
  Sparkles,
  Info,
  Zap,
  ShoppingCart,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import { Camera } from "lucide-react";

// Dynamic imports for instant page load & code splitting
const FoodSearchModal = dynamic(() => import("./FoodSearchModal"), { ssr: false });
const NutritionGoalsModal = dynamic(() => import("./NutritionGoalsModal"), { ssr: false });
const AIMealPlanModal = dynamic(() => import("./AIMealPlanModal"), { ssr: false });
const BarcodeScannerModal = dynamic(() => import("./BarcodeScannerModal"), { ssr: false });
const PhotoMealLoggerModal = dynamic(() => import("./PhotoMealLoggerModal"), { ssr: false });
const ShoppingListModal = dynamic(() => import("./ShoppingListModal"), { ssr: false });
import type { MealType, MealEntry } from "@/types";
import { cn } from "@/lib/utils";

const MEAL_CONFIG: Array<{
  type: MealType;
  title: string;
  Icon: React.ElementType;
  colorClass: string;
  iconBg: string;
}> = [
  {
    type: "breakfast",
    title: "Frühstück",
    Icon: Coffee,
    colorClass: "text-amber-400",
    iconBg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  {
    type: "lunch",
    title: "Mittagessen",
    Icon: Sun,
    colorClass: "text-emerald-400",
    iconBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  {
    type: "dinner",
    title: "Abendessen",
    Icon: Moon,
    colorClass: "text-blue-400",
    iconBg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
  {
    type: "snack",
    title: "Snacks & Pre/Post-Workout",
    Icon: Apple,
    colorClass: "text-violet-400",
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

export default function NutritionView() {
  const {
    nutritionLogs,
    nutritionGoals,
    garminHealthLogs,
    removeMealEntry,
    updateMealEntryAmount,
    addWaterIntake,
  } = useApp();

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [activeModalMeal, setActiveModalMeal] = useState<MealType | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<"search" | "barcode">("search");
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const [isShoppingOpen, setIsShoppingOpen] = useState(false);

  // Find daily log for selected date
  const currentLog = nutritionLogs.find((l) => l.date === selectedDate);
  const entries: MealEntry[] = currentLog?.entries || [];
  const waterMl = currentLog?.waterMl || 0;
  const garminHealth = garminHealthLogs[selectedDate];
  const garminBurned = garminHealth?.activeCaloriesBurned || 0;

  // Calculate totals
  const totalKcal = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
  const totalProtein = Math.round(
    entries.reduce((sum, e) => sum + (e.protein || 0), 0) * 10
  ) / 10;
  const totalCarbs = Math.round(
    entries.reduce((sum, e) => sum + (e.carbs || 0), 0) * 10
  ) / 10;
  const totalFat = Math.round(
    entries.reduce((sum, e) => sum + (e.fat || 0), 0) * 10
  ) / 10;

  // Goals
  const baseGoalKcal = nutritionGoals.calories;
  const adjustedGoalKcal = baseGoalKcal + garminBurned;
  const goalProtein = nutritionGoals.protein;
  const goalCarbs = (nutritionGoals.carbs || 280) + Math.round(garminBurned * 0.18);
  const goalFat = nutritionGoals.fat || 70;
  const goalWater = (nutritionGoals.waterMl || 3000) + Math.round(garminBurned * 0.8);

  const remainingKcal = adjustedGoalKcal - totalKcal;
  const proteinPct = Math.min(100, Math.round((totalProtein / (goalProtein || 1)) * 100));
  const kcalPct = Math.min(100, Math.round((totalKcal / (adjustedGoalKcal || 1)) * 100));
  const waterPct = Math.min(100, Math.round((waterMl / (goalWater || 1)) * 100));

  // Date step helper
  const stepDate = (delta: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${year}-${month}-${day}`);
  };

  const isToday = selectedDate === getTodayDateString();

  const openMealModal = (meal: MealType, tab: "search" | "barcode" = "search") => {
    setActiveModalMeal(meal);
    setModalInitialTab(tab);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950 pb-20 md:pb-0">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Utensils size={20} className="text-emerald-400" />
            Ernährung & Makros
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            OpenNutriTracker • Open Food Facts
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Shopping List & Recipes button */}
          <button
            onClick={() => setIsShoppingOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 shadow-xs transition-colors"
            title="Einkaufsliste & Rezepte"
          >
            <ShoppingCart size={14} className="text-emerald-400" />
            <span>Einkauf</span>
          </button>

          {/* AI Photo Meal Tracker button */}
          <button
            onClick={() => setIsPhotoOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 shadow-xs transition-colors"
            title="Mahlzeit fotografieren"
          >
            <Camera size={14} className="text-purple-400" />
            <span>Foto</span>
          </button>

          {/* Dedicated Barcode Scanner button */}
          <button
            onClick={() => setIsBarcodeOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 shadow-xs transition-colors"
            title="Barcode scannen (OpenFoodFacts)"
          >
            <ScanBarcode size={14} className="text-cyan-400" />
            <span>Barcode</span>
          </button>

          {/* AI Meal Plan generator button */}
          <button
            onClick={() => setIsAIModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 shadow-xs transition-colors"
            title="KI-Mahlzeitenplan generieren"
          >
            <Sparkles size={14} className="text-blue-400" />
            <span>Planer</span>
          </button>

          <button
            onClick={() => setIsGoalsModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
          >
            <Target size={14} className="text-emerald-400" />
            <span>Ziele</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-5 pb-28 md:pb-8 max-w-7xl mx-auto w-full">
        {/* ── Responsive Grid (1-Col on Mobile, 12-Col on Desktop) ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left Column: Targets & Water ───────────────────────────────── */}
          <div className="lg:col-span-5 space-y-4">
            {/* Date Strip / Selector */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
              <button
                onClick={() => stepDate(-1)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Vorheriger Tag"
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
                    onClick={() => setSelectedDate(getTodayDateString())}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  >
                    Zu Heute
                  </button>
                )}
              </div>

              <button
                onClick={() => stepDate(1)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                title="Nächster Tag"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Primary Macro & Calorie Ring Dashboard Card */}
            <div className="p-5 rounded-3xl bg-linear-to-b from-zinc-900 to-zinc-900/70 border border-zinc-800 shadow-xl space-y-4">
              {/* Calorie Budget Overview */}
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

              {/* Calorie Bar */}
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

              {/* Protein Highlight Target Card (Crucial for Hybrid Athlete) */}
              <div className="p-3.5 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                      <Dumbbell size={14} />
                    </div>
                    <span className="text-xs font-bold text-blue-200">
                      Proteinziel (Muskelschutz & Aufbau)
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-blue-400 font-mono">
                    {totalProtein}g <span className="text-zinc-400 font-normal">/ {goalProtein}g</span>
                  </span>
                </div>

                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                    style={{ width: `${proteinPct}%` }}
                  />
                </div>
              </div>

              {/* Carbs & Fat distribution */}
              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div className="p-3 rounded-2xl bg-zinc-950/50 border border-zinc-800/60">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Kohlenhydrate</span>
                    <span className="font-bold text-amber-400 font-mono">
                      {totalCarbs}g <span className="text-zinc-500 font-normal">/ {goalCarbs}g</span>
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((totalCarbs / (goalCarbs || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-950/50 border border-zinc-800/60">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Fett</span>
                    <span className="font-bold text-rose-400 font-mono">
                      {totalFat}g <span className="text-zinc-500 font-normal">/ {goalFat}g</span>
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-400 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((totalFat / (goalFat || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Water Tracker Card */}
            <div className="p-4 rounded-3xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Droplet size={20} />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-extrabold font-mono text-zinc-100">{waterMl} ml</span>
                    <span className="text-xs text-zinc-400">/ {goalWater} ml</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">Wasseraufnahme</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => addWaterIntake(selectedDate, 250)}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 font-bold text-xs transition-colors"
                >
                  +250 ml
                </button>
                <button
                  onClick={() => addWaterIntake(selectedDate, 500)}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 font-bold text-xs transition-colors"
                >
                  +500 ml
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Column: Meals Breakdown ──────────────────────────────── */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                Mahlzeiten-Tagebuch
              </h2>
              <span className="text-xs text-zinc-500">
                {entries.length} Einträge heute
              </span>
            </div>

            {/* Meal Sections (OpenNutriTracker / MFP Style) */}
            <div className="space-y-3.5">
              {MEAL_CONFIG.map(({ type, title, Icon, colorClass, iconBg }) => {
                const mealEntries = entries.filter((e) => e.mealType === type);
                const mealKcal = mealEntries.reduce((s, e) => s + (e.calories || 0), 0);
                const mealProtein = Math.round(
                  mealEntries.reduce((s, e) => s + (e.protein || 0), 0) * 10
                ) / 10;

                return (
                  <div
                    key={type}
                className="rounded-2xl bg-zinc-900/80 border border-zinc-800/80 overflow-hidden shadow-sm"
              >
                {/* Meal Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("p-1.5 rounded-lg border", iconBg)}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-100">{title}</h3>
                      <p className="text-[11px] text-zinc-400">
                        <span className="text-zinc-300 font-medium">{mealKcal} kcal</span>
                        {" • "}
                        <span className="text-blue-400 font-medium">{mealProtein}g P</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openMealModal(type, "barcode")}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-300 hover:bg-zinc-800 transition-colors"
                      title="Barcode scannen"
                    >
                      <ScanBarcode size={16} />
                    </button>

                    <button
                      onClick={() => openMealModal(type, "search")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
                    >
                      <Plus size={14} className="text-emerald-400" />
                      <span>Hinzufügen</span>
                    </button>
                  </div>
                </div>

                {/* Meal Food List */}
                {mealEntries.length > 0 ? (
                  <div className="divide-y divide-zinc-800/40">
                    {mealEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-800/20 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {entry.food.imageUrl ? (
                            <img
                              src={entry.food.imageUrl}
                              alt={entry.food.name}
                              className="w-9 h-9 object-contain rounded-md bg-zinc-950 p-0.5 border border-zinc-800 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-md bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                              <Utensils size={14} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-200 truncate">
                              {entry.food.name}
                            </p>
                            <p className="text-[11px] text-zinc-400">
                              <span className="text-zinc-300 font-medium">{entry.amount}g</span>
                              {entry.food.brand ? ` • ${entry.food.brand}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-emerald-400 block">
                              {entry.calories} kcal
                            </span>
                            <span className="text-[10px] text-blue-400 block">
                              {entry.protein}g P
                            </span>
                          </div>
                          <button
                            onClick={() => removeMealEntry(selectedDate, entry.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-80 group-hover:opacity-100"
                            title="Eintrag entfernen"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <button
                      onClick={() => openMealModal(type, "search")}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5 mx-auto"
                    >
                      <Plus size={13} />
                      Keine Einträge. Klicke um Lebensmittel hinzuzufügen.
                    </button>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModalMeal && (
        <FoodSearchModal
          isOpen={!!activeModalMeal}
          onClose={() => setActiveModalMeal(null)}
          mealType={activeModalMeal}
          date={selectedDate}
          initialTab={modalInitialTab}
        />
      )}

      {isGoalsModalOpen && (
        <NutritionGoalsModal
          isOpen={isGoalsModalOpen}
          onClose={() => setIsGoalsModalOpen(false)}
        />
      )}

      {isAIModalOpen && (
        <AIMealPlanModal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          selectedDate={selectedDate}
        />
      )}

      {isBarcodeOpen && (
        <BarcodeScannerModal
          isOpen={isBarcodeOpen}
          onClose={() => setIsBarcodeOpen(false)}
          targetDate={selectedDate}
        />
      )}

      {isPhotoOpen && (
        <PhotoMealLoggerModal
          isOpen={isPhotoOpen}
          onClose={() => setIsPhotoOpen(false)}
          targetDate={selectedDate}
        />
      )}

      {isShoppingOpen && (
        <ShoppingListModal
          isOpen={isShoppingOpen}
          onClose={() => setIsShoppingOpen(false)}
        />
      )}
    </div>
  );
}
