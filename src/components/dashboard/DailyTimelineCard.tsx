"use client";

import {
  Clock,
  CheckCircle2,
  Circle,
  Dumbbell,
  Moon,
  Sun,
  Coffee,
  BatteryCharging,
  ChevronRight,
  Activity,
  Utensils,
  ArrowRight,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId, getTodayIndex, getLocalDateString } from "@/lib/utils";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import type { MealType, MealEntry } from "@/types";

interface DailyTimelineCardProps {
  selectedDay?: number;
  selectedDate?: string;
  onResetToToday?: () => void;
}

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export default function DailyTimelineCard({
  selectedDay,
  selectedDate,
  onResetToToday,
}: DailyTimelineCardProps) {
  const {
    garminHealthLogs,
    weeklyPlan,
    nutritionLogs,
    nutritionGoals,
    addMealEntry,
    setActiveView,
  } = useApp();

  const currentTodayIndex = getTodayIndex();
  const dayIndex = selectedDay !== undefined ? selectedDay : currentTodayIndex;
  const isToday = dayIndex === currentTodayIndex;
  const activeDate = selectedDate || getLocalDateString();

  const garmin = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);

  // Day plan
  const todayPlan = weeklyPlan.find((p) => p.dayIndex === dayIndex) || {
    dayIndex,
    workoutType: "cycling",
    title: "4x4 Min Schwellen-Intervalle",
    description: "4x 4 Min @ 95-102% FTP mit 3 Min lockerer Pause",
    isCompleted: false,
  };

  // Nutrition logs
  const todayNutri = nutritionLogs.find((l) => l.date === activeDate);
  const entries = todayNutri?.entries || [];
  const totalProtein = Math.round(entries.reduce((s, e) => s + (e.protein || 0), 0));

  const hasBreakfast = entries.some((e) => e.mealType === "breakfast");
  const hasLunch = entries.some((e) => e.mealType === "lunch");
  const hasDinner = entries.some((e) => e.mealType === "dinner");

  const currentHour = isToday ? new Date().getHours() : 12;

  // Determine readiness tone
  const readiness = garmin.trainingReadiness || 78;
  const isHighReadiness = readiness >= 70;
  const isModerateReadiness = readiness >= 50 && readiness < 70;

  // Strict check: only mark activity complete if explicitly marked or real completed workout with realistic duration
  const hasCompletedActivity = !!todayPlan.isCompleted;

  function handleQuickAddMeal(mealType: MealType, name: string, calories: number, protein: number, carbs: number, fat: number) {
    const newEntry: MealEntry = {
      id: generateId(),
      mealType,
      food: {
        id: generateId(),
        name,
        caloriesPer100g: calories,
        proteinPer100g: protein,
        carbsPer100g: carbs,
        fatPer100g: fat,
      },
      amount: 100,
      calories,
      protein,
      carbs,
      fat,
      loggedAt: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };
    addMealEntry(activeDate, newEntry);
  }

  const timelineEvents = [
    {
      time: "07:00",
      title: `Morgen-Check & Vitalwerte (${DAY_NAMES[dayIndex]})`,
      subtitle: `Readiness ${readiness}/100 • Body Battery ${garmin.bodyBattery}% • Schlaf ${garmin.sleepDurationHours || 8}h (${garmin.sleepScore || 85}/100)`,
      category: "garmin",
      icon: BatteryCharging,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      isPast: currentHour >= 8,
      isCurrent: currentHour >= 6 && currentHour < 10,
      badge: isHighReadiness ? "Optimal belastbar" : isModerateReadiness ? "Mäßige Belastung" : "Regeneration",
      badgeColor: isHighReadiness ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      time: "08:30",
      title: "Frühstück & Energiespeicher",
      subtitle: hasBreakfast
        ? `Geloggt: ${entries.filter((e) => e.mealType === "breakfast").reduce((s, e) => s + e.calories, 0)} kcal (${entries.filter((e) => e.mealType === "breakfast").reduce((s, e) => s + e.protein, 0).toFixed(0)}g Protein)`
        : "Noch kein Frühstück geloggt • Empfehlung: Komplexe Carbs & 30g Protein",
      category: "nutrition",
      icon: Coffee,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
      isPast: currentHour >= 11,
      isCurrent: currentHour >= 8 && currentHour < 11,
      isDone: hasBreakfast,
      quickActions: !hasBreakfast ? [
        { label: "30g Protein Shake (140 kcal)", onClick: () => handleQuickAddMeal("breakfast", "Whey Isolat Shake", 140, 30, 2, 1) },
        { label: "Haferflocken-Bowl (420 kcal)", onClick: () => handleQuickAddMeal("breakfast", "Haferflocken mit Beeren", 420, 18, 65, 8) },
      ] : undefined,
    },
    {
      time: "13:00",
      title: "Pre-Workout Mittag & Hydration",
      subtitle: hasLunch
        ? `Geloggt: ${entries.filter((e) => e.mealType === "lunch").reduce((s, e) => s + e.calories, 0)} kcal (${entries.filter((e) => e.mealType === "lunch").reduce((s, e) => s + e.protein, 0).toFixed(0)}g Protein)`
        : "Leichte Mahlzeit 2–3h vor dem Training zur Glykogen-Optimierung",
      category: "nutrition",
      icon: Sun,
      color: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      isPast: currentHour >= 15,
      isCurrent: currentHour >= 11 && currentHour < 15,
      isDone: hasLunch,
      quickActions: !hasLunch ? [
        { label: "Hähnchen & Reis (580 kcal)", onClick: () => handleQuickAddMeal("lunch", "Hähnchenbrust mit Basmati & Brokkoli", 580, 48, 68, 8) },
        { label: "Pasta & Rind (650 kcal)", onClick: () => handleQuickAddMeal("lunch", "Vollkornpasta Bolognese", 650, 42, 85, 12) },
      ] : undefined,
    },
    {
      time: "16:30",
      title: todayPlan.title || "Tages-Trainingseinheit",
      subtitle: hasCompletedActivity
        ? `✅ Abgeschlossen • Einheit absolviert`
        : `${todayPlan.description || "Geplante Belastung"} (Geschätzter Verbrauch: ~450 kcal)`,
      category: "workout",
      icon: todayPlan.workoutType === "gym" ? Dumbbell : Activity,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
      isPast: currentHour >= 18 || hasCompletedActivity,
      isCurrent: (currentHour >= 15 && currentHour < 18) && !hasCompletedActivity,
      isDone: hasCompletedActivity,
      action: () => {
        const el = document.getElementById("today-workout-card");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-orange-500", "scale-[1.01]");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-orange-500", "scale-[1.01]");
          }, 1800);
        } else {
          setActiveView("training");
        }
      },
      actionLabel: hasCompletedActivity ? "Workout ansehen" : "Workout fokussieren",
    },
    {
      time: "19:00",
      title: "Post-Workout Dinner & Muskelreparatur",
      subtitle: hasDinner
        ? `Geloggt: ${entries.filter((e) => e.mealType === "dinner").reduce((s, e) => s + e.calories, 0)} kcal (${entries.filter((e) => e.mealType === "dinner").reduce((s, e) => s + e.protein, 0).toFixed(0)}g Protein)`
        : `Ziel: Noch ${Math.max(0, nutritionGoals.protein - totalProtein)}g Protein für optimale Muskelproteinsynthese`,
      category: "nutrition",
      icon: Utensils,
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
      isPast: currentHour >= 21,
      isCurrent: currentHour >= 18 && currentHour < 21,
      isDone: hasDinner,
      quickActions: !hasDinner ? [
        { label: "Lachs & Süßkartoffel (520 kcal)", onClick: () => handleQuickAddMeal("dinner", "Lachsfilet mit Süßkartoffel", 520, 38, 45, 18) },
        { label: "40g Casein / Magerquark (220 kcal)", onClick: () => handleQuickAddMeal("dinner", "Magerquark mit Beeren", 220, 35, 12, 1) },
      ] : undefined,
    },
    {
      time: "22:30",
      title: "Regeneration & Schlafziel",
      subtitle: `Empfehlung: 8.0 – 8.5 Stunden Schlaf für vollständige Erholung (Erholungszeit: ${garmin.recoveryTimeHours || 14}h)`,
      category: "sleep",
      icon: Moon,
      color: "text-purple-400 bg-purple-500/10 border-purple-500/30",
      isPast: false,
      isCurrent: currentHour >= 21,
      badge: "Recovery Phase",
      badgeColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
  ];

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 shadow-xl shadow-black/30 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-linear-to-br from-blue-500/20 to-indigo-500/20 text-blue-300 border border-blue-500/30 shadow-md shadow-blue-500/10">
            <Clock size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight uppercase">
                {isToday ? "Dein Tag" : `Tagesablauf · ${DAY_NAMES[dayIndex]}`}
              </h3>
              {!isToday && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono uppercase tracking-wider">
                  Vorschau
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              {isToday ? "Vitalwerte · Training · Ernährung im Tagesverlauf" : `Geplanter Ablauf & Ernährung für ${DAY_NAMES[dayIndex]}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isToday && onResetToToday && (
            <button
              type="button"
              onClick={onResetToToday}
              className="flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <RotateCcw size={12} />
              <span>Zu Heute</span>
            </button>
          )}

          <button
            onClick={() => setActiveView("coach")}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Coach fragen</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Timeline List */}
      <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-linear-to-b before:from-cyan-500/50 before:via-white/10 before:to-purple-500/50">
        {timelineEvents.map((evt, idx) => {
          return (
            <div key={idx} className="relative group">
              {/* Timeline Bullet */}
              <div
                className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  evt.isDone
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : evt.isCurrent
                    ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/30 animate-pulse"
                    : evt.isPast
                    ? "bg-zinc-900 border-zinc-700 text-zinc-500"
                    : "bg-zinc-950 border-zinc-800 text-zinc-600"
                }`}
              >
                {evt.isDone ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <Circle size={7} className={evt.isCurrent ? "fill-white" : "fill-current"} />
                )}
              </div>

              {/* Event Content */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  evt.isCurrent
                    ? "bg-blue-500/[0.06] border-blue-500/40 shadow-md shadow-blue-500/10"
                    : evt.isPast
                    ? "bg-black/20 border-white/5 opacity-70"
                    : "bg-black/40 border-white/5 hover:border-white/15"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-xl border mt-0.5 shrink-0 ${evt.color}`}>
                      <evt.icon size={15} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-zinc-200">{evt.title}</span>
                        {evt.badge && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${evt.badgeColor}`}>
                            {evt.badge}
                          </span>
                        )}
                        {evt.isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-500 text-white animate-pulse">
                            Jetzt
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{evt.subtitle}</p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-zinc-400 shrink-0">{evt.time}</span>
                </div>

                {/* Quick Add Meal Actions */}
                {evt.quickActions && evt.quickActions.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                      <Plus size={11} /> Schnell-Log:
                    </span>
                    {evt.quickActions.map((qa, qIdx) => (
                      <button
                        key={qIdx}
                        onClick={qa.onClick}
                        className="px-2.5 py-1 rounded-xl bg-white/[0.05] hover:bg-amber-500/15 text-zinc-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 text-[11px] font-semibold transition-all cursor-pointer"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Focus / Action Button */}
                {evt.action && (
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex justify-end">
                    <button
                      onClick={evt.action}
                      className="px-3 py-1.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black text-xs font-bold transition-all shadow-md shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>{evt.actionLabel}</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
