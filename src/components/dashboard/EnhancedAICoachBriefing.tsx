"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  Zap,
  Moon,
  ChevronRight,
  RefreshCw,
  Flame,
  Target,
  ArrowUpRight,
  Scale,
  Droplets,
  Dumbbell,
  UtensilsCrossed,
  Sun,
  Cloud,
  CloudRain,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { getTodayIndex, cn, getLocalDateString } from "@/lib/utils";
import type { LoggedSession, BodyCompositionEntry, DailyNutritionGoal } from "@/types";
import { motion } from "motion/react";

interface EnhancedAICoachBriefingProps {
  selectedDay?: number;
  selectedDate?: string;
  onOpenCoach?: () => void;
}

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function computeACWR(sessions: LoggedSession[]): { acwr: number; status: string } {
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff28 = new Date();
  cutoff28.setDate(cutoff28.getDate() - 28);

  const acuteSessions = sessions.filter((s) => new Date(s.date) >= cutoff7);
  const chronicSessions = sessions.filter((s) => new Date(s.date) >= cutoff28);

  const acuteLoad = Math.max(350, acuteSessions.length * 100);
  const chronicLoad = Math.max(300, (chronicSessions.length * 100) / 4);
  const ratio = Math.round((acuteLoad / Math.max(1, chronicLoad)) * 10) / 10;
  return {
    acwr: ratio || 1.1,
    status: ratio > 1.4 ? "Hoch" : ratio < 0.8 ? "Niedrig" : "Optimal",
  };
}

function computeWeightTrend(entries: BodyCompositionEntry[], days: number): number | null {
  if (entries.length < 2) return null;
  const recent = entries.slice(0, days);
  if (recent.length < 2) return null;
  const oldest = recent[recent.length - 1].weight;
  const newest = recent[0].weight;
  const weeks = days / 7;
  return Math.round((newest - oldest) / weeks * 10) / 10;
}

function getWeatherIcon(weatherType: string) {
  const type = weatherType.toLowerCase();
  if (type.includes("clear") || type.includes("sun")) return <Sun size={16} className="text-amber-400" />;
  if (type.includes("rain") || type.includes("drizzle") || type.includes("shower")) return <CloudRain size={16} className="text-blue-400" />;
  if (type.includes("cloud") || type.includes("overcast")) return <Cloud size={16} className="text-zinc-400" />;
  return <Cloud size={16} className="text-zinc-400" />;
}

export default function EnhancedAICoachBriefing({
  selectedDay,
  selectedDate,
  onOpenCoach,
}: EnhancedAICoachBriefingProps) {
  const {
    garminHealthLogs,
    weeklyPlan,
    loggedSessions,
    bodyWeightLog,
    nutritionGoals,
  } = useApp();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentTodayIndex = getTodayIndex();
  const dayIndex = selectedDay !== undefined ? selectedDay : currentTodayIndex;
  const isToday = dayIndex === currentTodayIndex;
  const activeDate = selectedDate || getLocalDateString();

  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);
  const plannedWorkout = weeklyPlan.find((p) => p.dayIndex === dayIndex) || weeklyPlan[0];
  const acwr = useMemo(() => computeACWR(loggedSessions), [loggedSessions]);
  const latestWeight = bodyWeightLog[0] || null;
  const weightTrend = useMemo(() => computeWeightTrend(bodyWeightLog, 14), [bodyWeightLog]);
  const bmr = latestWeight?.bmrKcal || (latestWeight ? Math.round(latestWeight.weight * 24.2) : 0);
  const calorieTarget = nutritionGoals.calories;

  // Compute nutrition progress for today
  const todayNutritionLog = useApp().nutritionLogs.find((l) => l.date === activeDate);
  const caloriesConsumed = todayNutritionLog?.entries.reduce((sum, e) => sum + e.calories, 0) || 0;
  const proteinConsumed = todayNutritionLog?.entries.reduce((sum, e) => sum + e.protein, 0) || 0;
  const waterConsumed = todayNutritionLog?.waterMl || 0;
  const caloriesRemaining = Math.max(0, calorieTarget - caloriesConsumed);
  const proteinRemaining = Math.max(0, nutritionGoals.protein - proteinConsumed);
  const waterPercent = nutritionGoals.waterMl > 0 ? Math.round((waterConsumed / nutritionGoals.waterMl) * 100) : 0;

  // Compute briefing insights
  const briefing = useMemo(() => {
    const readiness = health.trainingReadiness || 65;
    const bodyBattery = health.bodyBattery || 70;
    const sleep = health.sleepScore || 85;
    const hrv = health.hrvStatus || "balanced";

    let statusType: "optimal" | "balanced" | "caution" | "rest" = "balanced";
    let headline = "";
    let message = "";
    let actionItem = "";
    let focusTag = "";

    if (plannedWorkout.workoutType === "rest") {
      statusType = "rest";
      headline = "Aktiver Regenerationstag";
      message = `Dein Körper nutzt den heutigen Ruhetag zur Superkompensation. Mit einem Schlaf-Score von ${sleep}/100 und ${health.sleepDurationHours || 8}h Schlaf ist deine zelluläre Regeneration auf Kurs.`;
      actionItem = "Mobilitätsroutine (15 Min.) durchführen & Protein-Zufuhr bei mind. 160g halten.";
      focusTag = "Regeneration & Erholung";
    } else if (readiness >= 75 && hrv === "balanced") {
      statusType = "optimal";
      headline = `Peak Performance für ${plannedWorkout.title}`;
      message = `Optimale Vitalwerte: Dein autonomes Nervensystem ist voll regeneriert (Readiness ${readiness}/100, HRV ausgeglichen). Du kannst die geplante Einheit mit maximaler Intensität und vollem Fokus angehen.`;
      actionItem =
        plannedWorkout.workoutType === "cycling"
          ? "Ziel-Intervalle in Zone 4 (FTP) präzise ausfahren und Kohlenhydrate rechtzeitig zuführen."
          : plannedWorkout.workoutType === "running"
          ? "Schrittfrequenz (175–180 spm) und Zonen-Pacing konstant halten."
          : plannedWorkout.workoutType === "swimming"
          ? "Fokus auf sauberen Kraul-Wasserzug und gleichmäßige Gleitphasen."
          : plannedWorkout.workoutType === "mobility" || plannedWorkout.workoutType === "stretching"
          ? "Atmung vertiefen und Endpositionen aktiv für 30–45s halten."
          : "Im ersten Arbeitssatz auf RIR 1–2 pushen und saubere Progression anstreben.";
      focusTag = "Volle Leistungsbereitschaft";
    } else if (readiness < 50 || hrv === "low") {
      statusType = "caution";
      headline = `Erhöhte Vorermüdung erkannt`;
      message = `Deine Garmin-Vitalwerte zeigen eine leichte Ermüdung (Readiness ${readiness}/100, Body Battery ${bodyBattery}%). Die Belastung von ${plannedWorkout.title} sollte heute adaptiv gesteuert werden.`;
      actionItem = "Volumen um 1–2 Sätze reduzieren oder Intervalle in Zone 2–3 deckeln. Schlaf heute priorisieren.";
      focusTag = "Adaptive Drosselung";
    } else {
      statusType = "balanced";
      headline = `Solide Ausgangslage für ${plannedWorkout.title}`;
      message = `Stabile Ausgangslage für dein Training. Dein ACWR-Belastungsquotient liegt bei ${acwr.acwr} (optimaler Bereich: 0.8–1.3). Achte auf eine konstante Pacing- und Pausensteuerung.`;
      actionItem = "30–45g Kohlenhydrate ca. 60 Min. vor der Einheit einnehmen & ausreichend hydrieren.";
      focusTag = "Stabiler Sweet-Spot";
    }

    // Add nutrition context to action item
    if (proteinRemaining > 20) {
      actionItem += ` Protein-Lücke: ${proteinRemaining}g fehlen noch.`;
    }

    return {
      statusType,
      headline,
      message,
      actionItem,
      focusTag,
      readiness,
      bodyBattery,
      sleep,
      hrv,
    };
  }, [health, plannedWorkout, acwr, proteinRemaining, refreshKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 500);
  };

  const handleOpenCoach = () => {
    if (onOpenCoach) onOpenCoach();
  };

  // Mock weather data - in reality would come from WeatherWidget context
  const mockWeather = {
    temperature: 18,
    condition: "Partly Cloudy",
    rainChance: 20,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="p-4 sm:p-5 rounded-3xl glass-panel relative overflow-hidden group shadow-2xl space-y-4 border border-white/[0.08]"
    >
      {/* Ambient Telemetry Accent */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/[0.03] rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-zinc-900 border border-white/10 text-cyan-400 shadow-inner flex items-center justify-center shrink-0">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs sm:text-sm font-black text-zinc-100 uppercase tracking-wider font-mono">
                Performance Telemetrie
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 text-zinc-400 border border-white/10 font-mono">
                {isToday ? "HEUTE" : DAY_NAMES[dayIndex].toUpperCase()}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border font-mono tracking-tight",
                  briefing.statusType === "optimal"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : briefing.statusType === "caution"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : briefing.statusType === "rest"
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                )}
              >
                {briefing.focusTag}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">
              Echtzeit-Synthese aus Garmin-Vitals, ACWR-Quotient, Waage & Periodisierung
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Telemetrie neu berechnen"
            title="Telemetrie neu berechnen"
          >
            <RefreshCw size={15} className={isRefreshing ? "animate-spin text-cyan-400" : ""} />
          </button>

          <button
            type="button"
            onClick={handleOpenCoach}
            className="px-4 py-2 min-h-[44px] rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 hover:shadow-cyan-500/10 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Performance Coach öffnen"
            title="Performance Coach öffnen"
          >
            <span>Coach</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>

      {/* Main Text Content Box */}
      <div className="p-4 rounded-2xl glass-card space-y-2 relative z-10 border border-white/[0.06]">
        <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
          <span>{briefing.headline}</span>
        </h3>
        <p className="text-xs text-zinc-300 leading-relaxed font-normal">
          {briefing.message}
        </p>

        {/* Action Recommendation Banner */}
        <div className="pt-2.5 border-t border-white/5 flex items-start gap-2.5 text-xs">
          <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5">
            <Zap size={12} />
          </div>
          <p className="text-zinc-200 font-medium leading-normal">
            <span className="text-cyan-400 font-bold">Empfehlung: </span>
            {briefing.actionItem}
          </p>
        </div>
      </div>

      {/* High-Precision Telemetry Grid - Row 1: Garmin Vitals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10">
        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Activity size={13} className="text-emerald-400" /> Readiness
          </span>
          <span className="font-bold font-mono text-emerald-400">{briefing.readiness}/100</span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Moon size={13} className="text-purple-400" /> Schlaf
          </span>
          <span className="font-bold font-mono text-purple-300">{briefing.sleep}/100</span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Flame size={13} className="text-orange-400" /> ACWR
          </span>
          <span className="font-bold font-mono text-orange-300">{acwr.acwr}</span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Target size={13} className="text-cyan-400" /> Fokus
          </span>
          <span className="font-bold text-cyan-300 font-mono text-[10px] uppercase truncate max-w-[90px]">{plannedWorkout.workoutType}</span>
        </div>
      </div>

      {/* High-Precision Telemetry Grid - Row 2: Body & Nutrition */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10 border-t border-white/[0.04] pt-2">
        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col items-start gap-0.5 text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Scale size={13} className="text-blue-400" /> Gewicht
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-bold font-mono text-blue-400">{latestWeight?.weight || "--.-"}</span>
            <span className="text-xs text-zinc-500">kg</span>
            {weightTrend !== null && (
              <span className={cn("text-[10px] font-bold flex items-center gap-0.5", weightTrend < 0 ? "text-emerald-400" : "text-amber-400")}>
                {weightTrend > 0 ? "+" : ""}{weightTrend} kg/Wo
              </span>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col items-start gap-0.5 text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Dumbbell size={13} className="text-purple-400" /> KF%
          </span>
          <span className="font-bold font-mono text-purple-300">{latestWeight?.bodyFatPct || "--"}<span className="text-[10px] text-purple-500/80 ml-0.5">%</span></span>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col items-start gap-0.5 text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Flame size={13} className="text-orange-400" /> BMR / Ziel
          </span>
          <div className="flex items-baseline gap-1">
            <span className="font-bold font-mono text-orange-300">{bmr}</span>
            <span className="text-[10px] text-zinc-500">→</span>
            <span className="font-bold font-mono text-cyan-300 text-[10px]">{calorieTarget}</span>
            <span className="text-[10px] text-zinc-500">kcal</span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.06] flex flex-col items-start gap-0.5 text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <UtensilsCrossed size={13} className="text-emerald-400" /> Ernährung
          </span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="font-bold font-mono text-emerald-300">{caloriesRemaining}kcal</span>
            <span className="text-zinc-500">•</span>
            <span className="font-bold font-mono text-blue-300">{proteinRemaining}g P</span>
            <span className="text-zinc-500">•</span>
            <span className="font-bold font-mono text-cyan-300">{waterPercent}% H₂O</span>
          </div>
        </div>
      </div>

      {/* Weather compact */}
      <div className="relative z-10 border-t border-white/[0.04] pt-3 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
          {getWeatherIcon(mockWeather.condition)}
          <span className="font-bold font-mono text-zinc-100">{mockWeather.temperature}°C</span>
        </div>
        <span className="text-zinc-400">{mockWeather.condition}</span>
        <span className="flex items-center gap-1 text-zinc-500">
          <Droplets size={12} className="text-blue-400" />
          <span className="font-mono">{mockWeather.rainChance}%</span>
        </span>
        <span className="text-zinc-600 font-mono ml-auto">Outdoor: {plannedWorkout.workoutType === "cycling" || plannedWorkout.workoutType === "running" ? "geeignet" : "indoor"}</span>
      </div>
    </motion.div>
  );
}