"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Calculator,
  CheckCircle2,
  Coffee,
  Flame,
  Moon,
  Sun,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { cn, getLocalDateString } from "@/lib/utils";
import {
  getFrequentMeals,
  inferMealTypeFromTime,
  isWithinPostWorkoutWindow,
  minuteOfDayFromDate,
} from "@/lib/nutrition/frequent-meals";
import type { FrequentMeal } from "@/lib/nutrition/frequent-meals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MealType } from "@/types";

// ─── Optik je MealType (spiegelt die Meal-Cards im Tagebuch) ─────────────────

const MEAL_TYPE_STYLE: Record<MealType, { Icon: typeof Coffee; iconBg: string }> = {
  breakfast: { Icon: Coffee, iconBg: "bg-amber-500/10 border border-amber-500/20 text-amber-400" },
  lunch: { Icon: Sun, iconBg: "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" },
  dinner: { Icon: Moon, iconBg: "bg-blue-500/10 border border-blue-500/20 text-blue-400" },
  snack: { Icon: Apple, iconBg: "bg-violet-500/10 border border-violet-500/20 text-violet-400" },
};

const EMPTY_CUSTOM_FORM = { name: "", kcal: "", p: "", c: "", f: "" };

/**
 * Quick-Log-Bar: horizontal scrollbare Chips der häufigsten Mahlzeiten
 * (letzte 30 Tage, nach Tageszeit-/Post-Workout-Kontext gerankt) plus
 * Popover für freie Makro-Schnelleinträge – jeweils mit Undo-Toast.
 */
export default function QuickLogBar() {
  const {
    nutritionLogs,
    garminActivities,
    loggedSessions,
    activeSession,
    addMealEntry,
    removeMealEntry,
    quickAddCalories,
  } = useApp();

  // Stabiler Zeit-Stempel pro Mount, damit das Memo nicht flackert
  const nowRef = useRef<Date | null>(null);
  if (nowRef.current === null) nowRef.current = new Date();

  const [customForm, setCustomForm] = useState(EMPTY_CUSTOM_FORM);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Frischer Log-Stand für den Undo-Callback im Toast
  const logsRef = useRef(nutritionLogs);
  useEffect(() => {
    logsRef.current = nutritionLogs;
  }, [nutritionLogs]);

  // Trainings-Startzeiten je Datum (Garmin, geloggte Sessions, aktive Session)
  const workoutsByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    const push = (iso: string | undefined) => {
      if (!iso || typeof iso !== "string") return;
      const date = iso.split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      (map[date] ??= []).push(iso);
    };
    garminActivities.forEach((a) => push(a.startTime));
    loggedSessions.forEach((s) => push(s.date));
    if (activeSession && "startTime" in activeSession && typeof activeSession.startTime === "string") {
      push(activeSession.startTime);
    }
    return map;
  }, [garminActivities, loggedSessions, activeSession]);

  const isPostWorkoutNow = isWithinPostWorkoutWindow(nowRef.current ?? undefined, workoutsByDate);

  const frequentMeals = useMemo(
    () =>
      getFrequentMeals(nutritionLogs, {
        now: nowRef.current ?? undefined,
        limit: 10,
        workoutsByDate,
      }),
    [nutritionLogs, workoutsByDate]
  );

  /** Entfernt den zuletzt geloggten Eintrag mit passendem Namen (Undo). */
  const undoLastEntryByName = (todayStr: string, name: string) => {
    const day = logsRef.current.find((l) => l.date === todayStr);
    const entry = [...(day?.entries ?? [])]
      .reverse()
      .find((e) => e.food.name === name);
    if (entry) removeMealEntry(todayStr, entry.id);
  };

  const handleQuickLog = (meal: FrequentMeal) => {
    const todayStr = getLocalDateString();
    const mealType = inferMealTypeFromTime(minuteOfDayFromDate(new Date()));
    const { calories, protein, carbs, fat } = meal.macros;

    addMealEntry(todayStr, {
      mealType,
      food: meal.food,
      amount: meal.defaultAmount,
    });

    toast.success(`${meal.food.name} geloggt`, {
      description: `${calories} kcal · ${protein}g P · ${carbs}g C · ${fat}g F`,
      duration: 6000,
      action: {
        label: "Rückgängig",
        onClick: () => undoLastEntryByName(todayStr, meal.food.name),
      },
    });
  };

  const customTotals = {
    kcal: Number(customForm.kcal) || 0,
    p: Number(customForm.p) || 0,
    c: Number(customForm.c) || 0,
    f: Number(customForm.f) || 0,
  };
  const isCustomValid =
    customTotals.kcal > 0 || customTotals.p > 0 || customTotals.c > 0 || customTotals.f > 0;

  const handleCustomAdd = () => {
    if (!isCustomValid) return;
    const todayStr = getLocalDateString();
    const name = customForm.name.trim() || "Schnelleintrag";
    const mealType = inferMealTypeFromTime(minuteOfDayFromDate(new Date()));

    quickAddCalories(todayStr, mealType, name, customTotals.kcal, customTotals.p, customTotals.c, customTotals.f);
    setIsPopoverOpen(false);
    setCustomForm(EMPTY_CUSTOM_FORM);

    toast.success("Makros geloggt", {
      description: `${customTotals.kcal} kcal · ${customTotals.p}g P · ${customTotals.c}g C · ${customTotals.f}g F`,
      duration: 6000,
      action: {
        label: "Rückgängig",
        onClick: () => undoLastEntryByName(todayStr, name),
      },
    });
  };

  const numberField = (
    label: string,
    key: keyof typeof EMPTY_CUSTOM_FORM,
    accentClass: string
  ) => (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
        {label}
      </label>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="0"
        value={customForm[key]}
        onChange={(e) => setCustomForm((prev) => ({ ...prev, [key]: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCustomAdd();
        }}
        className={cn(
          "w-full px-2.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-right font-mono font-bold focus:outline-hidden focus:border-emerald-500 transition-colors",
          accentClass
        )}
      />
    </div>
  );

  return (
    <section className="rounded-3xl bg-zinc-900/70 border border-zinc-800/80 px-3.5 py-3 sm:px-5 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs sm:text-sm font-black font-mono text-zinc-100 flex items-center gap-2 tracking-tight">
          <Zap size={14} className="text-emerald-400" />
          <span>QUICK-LOG</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-bold">
            30 Tage Favoriten
          </span>
          {isPostWorkoutNow && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25 font-bold flex items-center gap-1">
              <Flame size={9} />
              POST-WORKOUT
            </span>
          )}
        </h2>

        {/* Custom Makro-Schnelleintrag */}
        <Popover
          open={isPopoverOpen}
          onOpenChange={(open) => {
            setIsPopoverOpen(open);
            if (open) setCustomForm(EMPTY_CUSTOM_FORM);
          }}
        >
          <PopoverTrigger asChild>
            <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300 hover:text-emerald-200 text-xs font-bold transition-all cursor-pointer active:scale-95">
              <Calculator size={13} />
              <span>Makros</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-80 rounded-2xl bg-zinc-900 border-zinc-700/80 p-4 space-y-3 shadow-xl shadow-black/40"
          >
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-zinc-100">Freier Makro-Eintrag</p>
              <p className="text-[10px] text-zinc-500">
                Ohne Lebensmittel – direkt Kalorien & Makros eintragen.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Bezeichnung (optional)
              </label>
              <input
                type="text"
                placeholder="z. B. Standard Post-Workout Shake"
                value={customForm.name}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {numberField("kcal", "kcal", "text-zinc-100")}
              {numberField("P (g)", "p", "text-blue-300")}
              {numberField("C (g)", "c", "text-amber-300")}
              {numberField("F (g)", "f", "text-rose-300")}
            </div>

            <button
              onClick={handleCustomAdd}
              disabled={!isCustomValid}
              className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-zinc-950 font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              <span>
                {customTotals.kcal > 0 ? `${customTotals.kcal} kcal` : "Makros"} ins Tagebuch
              </span>
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Chips-Zeile */}
      {frequentMeals.length === 0 ? (
        <p className="text-[11px] text-zinc-500 pb-0.5">
          Noch keine Favoriten – logge Mahlzeiten und sie erscheinen hier als 1-Tipp-Chip.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 -mx-0.5 px-0.5">
          {frequentMeals.map((meal) => {
            const style = MEAL_TYPE_STYLE[meal.dominantMealType];
            return (
              <button
                key={meal.key}
                onClick={() => handleQuickLog(meal)}
                title={`${meal.food.name} · Ø ${meal.typicalTimeLabel} Uhr · ${meal.count}× geloggt`}
                className="group shrink-0 flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-800/60 text-left transition-all active:scale-95 cursor-pointer"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                    style.iconBg
                  )}
                >
                  <style.Icon size={15} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-200 group-hover:text-white truncate max-w-[150px] leading-tight">
                      {meal.food.name}
                    </span>
                    <span className="shrink-0 text-[9px] px-1.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-mono font-bold leading-4">
                      {meal.count}×
                    </span>
                    {isPostWorkoutNow && meal.postWorkoutAffinity >= 0.34 && (
                      <Flame size={11} className="shrink-0 text-amber-400" />
                    )}
                  </div>
                  <span className="block text-[10px] font-mono text-zinc-500 mt-0.5 whitespace-nowrap">
                    <span className="font-bold text-zinc-300">{meal.macros.calories}</span> kcal ·{" "}
                    {meal.defaultAmount}g · {meal.typicalTimeLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
