"use client";

import { useState } from "react";
import {
  Clock,
  Sparkles,
  CheckCircle2,
  Circle,
  Flame,
  Dumbbell,
  Moon,
  Sun,
  Coffee,
  Apple,
  BatteryCharging,
  Heart,
  ChevronRight,
  Zap,
  Activity,
  Calendar,
  Utensils,
  ArrowRight,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import type { MealType, DayPlan } from "@/types";

export default function DailyTimelineCard() {
  const {
    garminHealthLogs,
    garminActivities,
    weeklyPlan,
    nutritionLogs,
    nutritionGoals,
    setActiveView,
  } = useApp();

  const today = new Date().toISOString().split("T")[0];
  const garmin = garminHealthLogs[today] || {
    trainingReadiness: 64,
    bodyBattery: 69,
    hrvStatus: "balanced",
    sleepScore: 95,
    sleepDurationHours: 8.7,
    activeCaloriesBurned: 97,
    restingHeartRate: 42,
    recoveryTimeHours: 14.5,
  };

  // Day plan
  const dayIndex = (new Date().getDay() + 6) % 7;
  const todayPlan = weeklyPlan.find((p) => p.dayIndex === dayIndex) || {
    dayIndex,
    workoutType: "running",
    title: "Ausdauer & Gym",
    description: "Geplante Einheit",
    isCompleted: false,
  };

  // Nutrition logs
  const todayNutri = nutritionLogs.find((l) => l.date === today);
  const entries = todayNutri?.entries || [];
  const totalCalories = entries.reduce((s, e) => s + (e.calories || 0), 0);
  const totalProtein = Math.round(entries.reduce((s, e) => s + (e.protein || 0), 0));

  const hasBreakfast = entries.some((e) => e.mealType === "breakfast");
  const hasLunch = entries.some((e) => e.mealType === "lunch");
  const hasSnack = entries.some((e) => e.mealType === "snack");
  const hasDinner = entries.some((e) => e.mealType === "dinner");

  const currentHour = new Date().getHours();

  // Determine readiness tone
  const readiness = garmin.trainingReadiness || 78;
  const isHighReadiness = readiness >= 70;
  const isModerateReadiness = readiness >= 50 && readiness < 70;

  // Real activities logged today
  const hasCompletedActivity =
    todayPlan.isCompleted || garminActivities.length > 0;

  const timelineEvents = [
    {
      time: "07:00",
      title: "Morgen-Check & Garmin Readiness",
      subtitle: `Readiness ${readiness}/100 • Body Battery ${garmin.bodyBattery}% • Schlaf ${garmin.sleepDurationHours}h (${garmin.sleepScore}/100)`,
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
      action: !hasBreakfast ? () => setActiveView("nutrition") : undefined,
      actionLabel: "Mahlzeit loggen",
    },
    {
      time: "13:00",
      title: "Pre-Workout Mittag & Hydration",
      subtitle: hasLunch
        ? `Geloggt: ${entries.filter((e) => e.mealType === "lunch").reduce((s, e) => s + e.calories, 0)} kcal`
        : "Leichte Mahlzeit 2–3h vor dem Training zur Glykogen-Optimierung",
      category: "nutrition",
      icon: Sun,
      color: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      isPast: currentHour >= 15,
      isCurrent: currentHour >= 11 && currentHour < 15,
      isDone: hasLunch,
    },
    {
      time: "16:30",
      title: todayPlan.title || "Tages-Trainingseinheit",
      subtitle: hasCompletedActivity
        ? `✅ Abgeschlossen • Garmin (+${garmin.activeCaloriesBurned} kcal verbrannt)`
        : `${todayPlan.description} • Geplante Belastung`,
      category: "workout",
      icon: todayPlan.workoutType === "gym" ? Dumbbell : Activity,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
      isPast: currentHour >= 18 || hasCompletedActivity,
      isCurrent: (currentHour >= 15 && currentHour < 18) && !hasCompletedActivity,
      isDone: hasCompletedActivity,
      action: !hasCompletedActivity ? () => setActiveView("training") : undefined,
      actionLabel: "Trainingsplan öffnen",
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
    <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-linear-to-br from-blue-500/20 to-indigo-500/20 text-blue-400 border border-blue-500/30">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <span>Dein Tag als Hybrid-Athlet</span>
              <Sparkles size={13} className="text-blue-400" />
            </h3>
            <p className="text-xs text-zinc-400">
              Garmin Forerunner 265 • Edge 840 • Ernährung
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveView("coach")}
          className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
        >
          <span>Coach fragen</span>
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Timeline List */}
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-linear-to-b before:from-blue-500/50 before:via-zinc-800 before:to-purple-500/50">
        {timelineEvents.map((evt, idx) => {
          const Icon = evt.icon;

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
                  <Circle size={8} className={evt.isCurrent ? "fill-white" : ""} />
                )}
              </div>

              {/* Event Card */}
              <div
                className={`p-3 rounded-2xl border transition-all ${
                  evt.isCurrent
                    ? "bg-linear-to-r from-blue-950/30 via-zinc-900 to-zinc-900 border-blue-500/40 shadow-sm"
                    : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-zinc-500">
                      {evt.time}
                    </span>
                    <h4 className="text-xs font-bold text-zinc-200">{evt.title}</h4>
                  </div>

                  {evt.badge && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${evt.badgeColor}`}
                    >
                      {evt.badge}
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{evt.subtitle}</p>

                {evt.action && (
                  <div className="pt-2">
                    <button
                      onClick={evt.action}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <span>{evt.actionLabel}</span>
                      <ArrowRight size={12} />
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
