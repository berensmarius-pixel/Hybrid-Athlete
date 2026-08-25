"use client";

import { useState, useMemo } from "react";
import {
  Sparkles,
  Bot,
  Zap,
  Activity,
  Moon,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Flame,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { getTodayIndex, cn, getLocalDateString } from "@/lib/utils";
import type { LoggedSession } from "@/types";
import { motion } from "motion/react";

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
    setActiveView,
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-5 rounded-3xl glass-panel relative overflow-hidden group shadow-2xl shadow-black/40 border border-white/10"
    >
      {/* Animated Subtle Cyber Background Light */}
      <div className="absolute -top-12 -right-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-700" />
      <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-500/20">
            <Bot size={20} />
            <Sparkles size={11} className="absolute -top-1 -right-1 text-cyan-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-zinc-100 flex items-center gap-1.5 tracking-tight font-mono">
                KI-COACH LIVE-BRIEFING
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-zinc-300 border border-white/10 font-mono">
                {isToday ? "HEUTE" : DAY_NAMES[dayIndex].toUpperCase()}
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
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Echtzeit-Synthese aus Garmin-Vitals, ACWR-Quotient & Periodisierung
            </p>
          </div>
        </div>

        {/* Action button controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
            title="Briefing neu berechnen"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-cyan-400" : ""} />
          </button>

          <button
            type="button"
            onClick={() => setActiveView("coach")}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-extrabold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>Mit Coach chatten</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Main Text Content Box */}
      <div className="p-3.5 sm:p-4 rounded-2xl glass-card space-y-2 relative z-10 mt-3 border border-white/5">
        <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
          <span>{briefing.headline}</span>
        </h3>
        <p className="text-xs text-zinc-300 leading-relaxed font-normal">
          {briefing.message}
        </p>

        {/* Action Recommendation Banner */}
        <div className="pt-2.5 border-t border-white/5 flex items-start gap-2.5 text-xs">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 mt-0.5">
            <Zap size={13} />
          </div>
          <p className="text-zinc-200 font-medium leading-normal">
            <span className="text-cyan-300 font-bold">Empfehlung: </span>
            {briefing.actionItem}
          </p>
        </div>
      </div>

      {/* Key Quick Status Micro-Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10 pt-2.5">
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Activity size={13} className="text-emerald-400" /> Readiness:
          </span>
          <span className="font-bold font-mono text-emerald-400">{briefing.readiness}/100</span>
        </div>

        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Moon size={13} className="text-purple-400" /> Schlaf:
          </span>
          <span className="font-bold font-mono text-purple-300">{briefing.sleep}/100</span>
        </div>

        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Flame size={13} className="text-orange-400" /> ACWR Ratio:
          </span>
          <span className="font-bold font-mono text-orange-300">{acwr.acwr}</span>
        </div>

        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-cyan-400" /> Fokus:
          </span>
          <span className="font-bold text-cyan-300 font-mono text-[10px] truncate max-w-[90px]">{plannedWorkout.workoutType.toUpperCase()}</span>
        </div>
      </div>
    </motion.div>
  );
}
