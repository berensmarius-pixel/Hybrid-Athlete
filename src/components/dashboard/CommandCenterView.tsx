"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Settings2,
  Calendar,
  Calculator,
  Bot,
  Sparkles,
  Zap,
  Activity,
  Heart,
  Moon,
  Battery,
  ChevronRight,
  TrendingUp,
  FileText,
  RotateCcw,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getTodayIndex, getLocalDateString, cn } from "@/lib/utils";
import { analyzeAdaptiveTraining, type AdaptiveWorkoutSuggestion } from "@/lib/adaptiveWorkoutEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import type { DayPlan, GarminDailyHealth } from "@/types";

// Dashboard Components
import EnhancedAICoachBriefing from "./EnhancedAICoachBriefing";
import TodayScheduleCard from "./TodayScheduleCard";
import BodyCompositionCompactCard from "./BodyCompositionCompactCard";
import WeeklySummaryCompactCard from "./WeeklySummaryCompactCard";
import AdaptiveSuggestionCard from "./AdaptiveSuggestionCard";
import DeloadRecommendationCard from "./DeloadRecommendationCard";
import VolumeCharts from "./VolumeCharts";
import WeekStrip from "./WeekStrip";
import WorkoutDetailCard from "./WorkoutDetailCard";

// Modals
const PlanEditorModal = dynamic(() => import("./PlanEditorModal"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });
const StravaPanel = dynamic(() => import("@/components/strava/StravaPanel"), { ssr: false });
const GarminHubModal = dynamic(() => import("@/components/garmin/GarminHubModal"), { ssr: false });
const WeeklyReportModal = dynamic(() => import("./WeeklyReportModal"), { ssr: false });

function AthleteVitalsHUD({
  health,
  onOpenGarmin,
}: {
  health: GarminDailyHealth;
  onOpenGarmin: () => void;
}) {
  const readiness = health.trainingReadiness ?? 75;
  const readinessColor =
    readiness >= 75
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : readiness >= 50
      ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
      : "text-rose-400 border-rose-500/30 bg-rose-500/10";

  const readinessLabel =
    readiness >= 75 ? "Optimal bereit" : readiness >= 50 ? "Moderat belastbar" : "Erholung nötig";

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-4 shadow-xl shadow-black/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Activity size={16} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">
            Athleten Telemetrie
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-400 border border-white/10">
          {health.deviceSource || "Garmin Health"}
        </span>
      </div>

      {/* Main Readiness Display */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950/70 border border-white/5">
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
            Trainingsbereitschaft
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-zinc-100">{readiness}</span>
            <span className="text-xs text-zinc-500 font-mono">/100</span>
          </div>
        </div>
        <div className={cn("px-2.5 py-1 rounded-xl text-xs font-bold border font-mono", readinessColor)}>
          {readinessLabel}
        </div>
      </div>

      {/* 2x2 Telemetry Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Body Battery */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Battery</span>
            <Battery size={13} className="text-cyan-400" />
          </div>
          <div className="text-lg font-black font-mono text-zinc-100">
            {health.bodyBattery ?? "--"}
            <span className="text-xs text-zinc-500 font-normal ml-0.5">%</span>
          </div>
          <span className="text-[10px] text-zinc-500 block truncate">
            {health.trainingStatus || "Produktives Training"}
          </span>
        </div>

        {/* HRV Status */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">HRV Status</span>
            <Activity size={13} className="text-emerald-400" />
          </div>
          <div className="text-lg font-black font-mono text-zinc-100">
            {health.hrvWeeklyAvgMs ?? "--"}
            <span className="text-xs text-zinc-500 font-normal ml-0.5">ms</span>
          </div>
          <span className="text-[10px] text-emerald-400/90 block capitalize truncate">
            {health.hrvStatus || "Ausgeglichen"}
          </span>
        </div>

        {/* Schlaf */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Schlaf</span>
            <Moon size={13} className="text-indigo-400" />
          </div>
          <div className="text-lg font-black font-mono text-zinc-100">
            {health.sleepScore ?? "--"}
            <span className="text-xs text-zinc-500 font-normal ml-0.5">pts</span>
          </div>
          <span className="text-[10px] text-zinc-500 block truncate">
            {health.sleepDurationHours ? `${health.sleepDurationHours}h Dauer` : "Keine Schlafdaten"}
          </span>
        </div>

        {/* Ruhepuls */}
        <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Ruhepuls</span>
            <Heart size={13} className="text-rose-400" />
          </div>
          <div className="text-lg font-black font-mono text-zinc-100">
            {health.restingHeartRate ?? "--"}
            <span className="text-xs text-zinc-500 font-normal ml-0.5">bpm</span>
          </div>
          <span className="text-[10px] text-zinc-500 block truncate">
            {health.recoveryTimeHours ? `${health.recoveryTimeHours}h Erholung` : "Optimal"}
          </span>
        </div>
      </div>

      {/* Footer / Connect Hub Shortcut */}
      <button
        onClick={onOpenGarmin}
        className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-all cursor-pointer active:scale-[0.98]"
      >
        <span className="flex items-center gap-1.5">
          <Zap size={13} className="text-cyan-400" />
          <span>Garmin Connect Hub</span>
        </span>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function CommandCenterView() {
  const { weeklyPlan, updateWeeklyPlan, garminHealthLogs, isCoachOpen, openCoach, closeCoach } = useApp();
  const { connection } = useStrava();

  const todayIndex = getTodayIndex();
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stravaPanelOpen, setStravaPanelOpen] = useState(false);
  const [garminHubOpen, setGarminHubOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const selectedDate = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay();
    const currentDayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const diffDays = selectedDay - currentDayIndex;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diffDays);
    return getLocalDateString(targetDate);
  }, [selectedDay]);

  const formattedDateLabel = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      return d.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const selectedPlan = weeklyPlan.find((d) => d.dayIndex === selectedDay);

  // Health data for selected day
  const currentHealth = useMemo(() => {
    return garminHealthLogs[selectedDate] || getDefaultGarminHealth(selectedDate);
  }, [garminHealthLogs, selectedDate]);

  // Adaptive suggestion for selected day
  const adaptiveSuggestion = useMemo(() => {
    const suggestions = analyzeAdaptiveTraining(currentHealth, weeklyPlan);
    return suggestions.length > 0 ? suggestions[0] : null;
  }, [currentHealth, weeklyPlan]);

  const isToday = selectedDay === todayIndex;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-3 flex items-center justify-between border-b border-white/5 bg-zinc-950/90 backdrop-blur-md shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight font-mono uppercase">
              Command <span className="text-cyan-400">Center</span>
            </h1>
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
              LIVE TELEMETRIE
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5 font-medium">
            KI-Steuerung • Garmin Vitals • Bklit Telemetrie • Trainingscockpit
          </p>
        </div>

        {/* Quick actions bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReportOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-200 hover:text-white transition-all cursor-pointer active:scale-95"
            title="Wochenbericht öffnen"
          >
            <FileText size={14} className="text-cyan-400" />
            <span>Bericht</span>
          </button>

          <button
            onClick={() => setToolsOpen(true)}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            aria-label="Pro Tools & Rechner"
            title="Pro Tools & Rechner"
          >
            <Calculator size={15} />
            <span className="hidden xl:inline">Tools</span>
          </button>

          <button
            onClick={() => setCalendarOpen(true)}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-blue-300 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            aria-label="Google Kalender & Termine"
            title="Google Kalender"
          >
            <Calendar size={15} />
            <span className="hidden xl:inline">Kalender</span>
          </button>

          <button
            onClick={() => setStravaPanelOpen(true)}
            className={cn(
              "p-2 sm:px-3 sm:py-1.5 rounded-xl border active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold",
              connection.isConnected
                ? "text-orange-300 bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20"
                : "text-zinc-400 bg-white/[0.06] border border-white/10 hover:bg-white/[0.1]"
            )}
            aria-label={connection.isConnected ? "Strava Status: Verbunden" : "Mit Strava verbinden"}
            title={connection.isConnected ? "Strava Status: Verbunden" : "Mit Strava verbinden"}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            <span className="hidden xl:inline">Strava</span>
          </button>

          <button
            onClick={() => setGarminHubOpen(true)}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            aria-label="Garmin Connect Hub"
            title="Garmin Connect Hub"
          >
            <Zap size={15} />
            <span className="hidden xl:inline">Garmin</span>
          </button>

          <button
            onClick={() => setEditorOpen(true)}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl text-zinc-300 bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            aria-label="Plan bearbeiten"
            title="Plan bearbeiten"
          >
            <Settings2 size={15} />
            <span className="hidden xl:inline">Plan</span>
          </button>

          <button
            onClick={() => (isCoachOpen ? closeCoach() : openCoach())}
            className={cn(
              "p-2 sm:px-3 sm:py-1.5 rounded-xl border active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold",
              isCoachOpen
                ? "text-purple-100 bg-purple-500/30 border-purple-500/50 shadow-sm"
                : "text-purple-300 bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20"
            )}
            aria-label={isCoachOpen ? "Coach Chat schließen" : "Coach Chat öffnen"}
            title={isCoachOpen ? "Coach Chat schließen" : "Coach Chat öffnen"}
          >
            <Bot size={15} />
            <span className="hidden xl:inline">Coach</span>
          </button>
        </div>
      </header>

      {/* ── Scrollable Dashboard Content Area ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 space-y-4 sm:space-y-6 pb-28 md:pb-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full">
        {/* Top Sticky/Prominent Day Navigation Ribbon */}
        <section className="p-3 sm:p-4 rounded-3xl glass-panel border border-white/10 space-y-2.5 shadow-xl shadow-black/30">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">
                Wochenübersicht <span className="text-zinc-500 font-normal">({formattedDateLabel})</span>
              </h2>
              {isToday ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  HEUTE
                </span>
              ) : (
                <button
                  onClick={() => setSelectedDay(todayIndex)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 cursor-pointer active:scale-95 transition-all"
                  title="Zurück zum heutigen Tag springen"
                >
                  <RotateCcw size={10} />
                  <span>Zu Heute</span>
                </button>
              )}
            </div>
            <span className="text-[10px] text-cyan-400/80 font-semibold hidden sm:inline">
              Tag antippen für Trainingsvorschau & Telemetrie
            </span>
          </div>

          <WeekStrip
            plan={weeklyPlan}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        </section>

        {/* ── High-Density Bento Grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* Row 1: AI Coach Briefing (8 cols) + Athlete Telemetry & Adaptive (4 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-6">
            <EnhancedAICoachBriefing
              selectedDay={selectedDay}
              selectedDate={selectedDate}
              onOpenCoach={openCoach}
            />
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Adaptive suggestion if active for this day */}
            {adaptiveSuggestion && (
              <AdaptiveSuggestionCard selectedDate={selectedDate} />
            )}

            {/* Deload detection recommendation */}
            <DeloadRecommendationCard />

            {/* Telemetry HUD */}
            <AthleteVitalsHUD
              health={currentHealth}
              onOpenGarmin={() => setGarminHubOpen(true)}
            />
          </div>

          {/* Row 2: Selected Day Workout Detail (7 cols) + Schedule & Appointments (5 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {selectedPlan && (
              <WorkoutDetailCard day={selectedPlan} />
            )}
          </div>

          <div className="lg:col-span-5 flex flex-col gap-4">
            <TodayScheduleCard
              selectedDay={selectedDay}
              selectedDate={selectedDate}
              onOpenFullCalendar={() => setCalendarOpen(true)}
            />
          </div>

          {/* Row 3: Bklit Telemetry Charts - Volume & Body Composition */}
          <div className="lg:col-span-6 flex flex-col">
            <VolumeCharts />
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <BodyCompositionCompactCard />
          </div>

          {/* Row 4: Full Weekly Summary (12 cols) */}
          <div className="col-span-1 lg:col-span-12">
            <WeeklySummaryCompactCard onOpenWeeklyReport={() => setReportOpen(true)} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {editorOpen && (
        <PlanEditorModal
          plan={weeklyPlan}
          onSave={updateWeeklyPlan}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {calendarOpen && <GoogleCalendarModal isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} />}
      {toolsOpen && <ToolsHubModal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} />}
      {stravaPanelOpen && <StravaPanel onClose={() => setStravaPanelOpen(false)} />}
      {garminHubOpen && <GarminHubModal isOpen={garminHubOpen} onClose={() => setGarminHubOpen(false)} />}
      {reportOpen && <WeeklyReportModal onClose={() => setReportOpen(false)} />}
    </div>
  );
}