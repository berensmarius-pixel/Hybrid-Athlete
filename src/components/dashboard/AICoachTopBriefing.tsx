"use client";

import { useState, useMemo } from "react";
import {
  Sparkles,
  Bot,
  Zap,
  Activity,
  Heart,
  Moon,
  ChevronRight,
  RefreshCw,
  Award,
  AlertTriangle,
  CheckCircle2,
  Dumbbell,
  Bike,
  ShieldCheck,
  Flame,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { getTodayIndex, cn } from "@/lib/utils";
import type { LoggedSession } from "@/types";

interface AICoachTopBriefingProps {
  selectedDay?: number;
  selectedDate?: string;
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

export default function AICoachTopBriefing({
  selectedDay,
  selectedDate,
}: AICoachTopBriefingProps) {
  const {
    garminHealthLogs,
    weeklyPlan,
    loggedSessions,
    nutritionLogs,
    nutritionGoals,
    setActiveView,
  } = useApp();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentTodayIndex = getTodayIndex();
  const dayIndex = selectedDay !== undefined ? selectedDay : currentTodayIndex;
  const isToday = dayIndex === currentTodayIndex;
  const activeDate = selectedDate || new Date().toISOString().split("T")[0];

  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);
  const plannedWorkout = weeklyPlan.find((p) => p.dayIndex === dayIndex) || weeklyPlan[0];
  const acwr = useMemo(() => computeACWR(loggedSessions), [loggedSessions]);

  // Compute dynamic AI Coach Insight
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
      headline = `Top-Verfassung für ${plannedWorkout.title}`;
      message = `Hervorragende Vitalwerte! Dein autonomes Nervensystem ist voll regeneriert (Readiness ${readiness}/100, HRV ausgeglichen). Du kannst die geplante Einheit mit maximaler Intensität und vollem Fokus angehen.`;
      actionItem = plannedWorkout.workoutType === "cycling"
        ? "Ziel-Intervalle in Zone 4 (FTP) präzise ausfahren und Kohlenhydrate rechtzeitig zuführen."
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
      headline = `Solide Basis für ${plannedWorkout.title}`;
      message = `Stabile Ausgangslage für dein Training. Dein ACWR-Belastungsquotient liegt bei ${acwr.acwr} (optimaler Bereich: 0.8–1.3). Achte auf eine konstante Pacing- und Pausensteuerung.`;
      actionItem = "30–45g Kohlenhydrate ca. 60 Min. vor der Einheit einnehmen & ausreichend hydrieren.";
      focusTag = "Stabiler Sweet-Spot";
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
    };
  }, [health, plannedWorkout, acwr, refreshKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-blue-950/40 via-zinc-900 to-zinc-900 border border-blue-500/30 shadow-xl shadow-blue-950/20 space-y-3.5 relative overflow-hidden group">
      {/* Subtle background glow element */}
      <div className="absolute top-0 right-0 w-80 h-32 bg-blue-500/5 blur-3xl pointer-events-none rounded-full" />

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-linear-to-br from-blue-500/20 to-indigo-500/20 text-blue-400 border border-blue-500/30 shadow-inner">
            <Bot size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-zinc-100 flex items-center gap-1.5">
                <span>KI-Coach Live-Briefing</span>
                <Sparkles size={14} className="text-blue-400 animate-pulse" />
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {isToday ? "Heute" : DAY_NAMES[dayIndex]}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  briefing.statusType === "optimal"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : briefing.statusType === "caution"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : briefing.statusType === "rest"
                    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                )}
              >
                {briefing.focusTag}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Echtzeit-Analyse aus Garmin-Vitalwerten, ACWR-Belastung & Wochenplan
            </p>
          </div>
        </div>

        {/* Action button controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
            title="Briefing neu berechnen"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-blue-400" : ""} />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("coach")}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>Mit Coach sprechen</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Main Text Content Box */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-2 relative z-10">
        <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
          <span>{briefing.headline}</span>
        </h3>
        <p className="text-xs text-zinc-300 leading-relaxed font-normal">
          {briefing.message}
        </p>

        {/* Action Recommendation Banner */}
        <div className="pt-2 border-t border-zinc-800/60 flex items-start gap-2 text-xs">
          <div className="p-1 rounded-lg bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
            <Zap size={13} />
          </div>
          <p className="text-zinc-200 font-medium leading-normal">
            <span className="text-blue-300 font-bold">Coaching-Empfehlung: </span>
            {briefing.actionItem}
          </p>
        </div>
      </div>

      {/* Key Quick Status Micro-Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10 pt-0.5">
        <div className="p-2 rounded-xl bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1">
            <Activity size={12} className="text-emerald-400" /> Readiness:
          </span>
          <span className="font-bold font-mono text-emerald-400">{briefing.readiness}/100</span>
        </div>

        <div className="p-2 rounded-xl bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1">
            <Moon size={12} className="text-purple-400" /> Schlaf:
          </span>
          <span className="font-bold font-mono text-purple-300">{briefing.sleep}/100</span>
        </div>

        <div className="p-2 rounded-xl bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1">
            <Flame size={12} className="text-orange-400" /> ACWR Ratio:
          </span>
          <span className="font-bold font-mono text-orange-300">{acwr.acwr}</span>
        </div>

        <div className="p-2 rounded-xl bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1">
            <ShieldCheck size={12} className="text-cyan-400" /> Belastung:
          </span>
          <span className="font-bold text-cyan-300 truncate max-w-[90px]">{plannedWorkout.workoutType.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
