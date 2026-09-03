"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { Settings2, Calendar, Calculator, Bot, Sparkles, Zap } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getTodayIndex, getLocalDateString, cn } from "@/lib/utils";
import { analyzeAdaptiveTraining, type AdaptiveWorkoutSuggestion } from "@/lib/adaptiveWorkoutEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import type { DayPlan } from "@/types";

// Components
import EnhancedAICoachBriefing from "./EnhancedAICoachBriefing";
import TodayScheduleCard from "./TodayScheduleCard";
import BodyCompositionCompactCard from "./BodyCompositionCompactCard";
import WeeklySummaryCompactCard from "./WeeklySummaryCompactCard";
import AdaptiveSuggestionCard from "./AdaptiveSuggestionCard";
import WeekStrip from "./WeekStrip";
import WorkoutDetailCard from "./WorkoutDetailCard";

// Modals
const PlanEditorModal = dynamic(() => import("./PlanEditorModal"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });
const StravaPanel = dynamic(() => import("@/components/strava/StravaPanel"), { ssr: false });
const GarminHubModal = dynamic(() => import("@/components/garmin/GarminHubModal"), { ssr: false });

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

  const selectedDate = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay();
    const currentDayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const diffDays = selectedDay - currentDayIndex;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diffDays);
    return getLocalDateString(targetDate);
  }, [selectedDay]);

  const selectedPlan = weeklyPlan.find((d) => d.dayIndex === selectedDay);

  // Adaptive suggestion for selected day
  const adaptiveSuggestion = useMemo(() => {
    const activeDate = selectedDate;
    const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);
    const suggestions = analyzeAdaptiveTraining(health, weeklyPlan);
    return suggestions.length > 0 ? suggestions[0] : null;
  }, [selectedDate, weeklyPlan, garminHealthLogs]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 flex items-center justify-between border-b border-white/5 bg-zinc-950/90 backdrop-blur-md shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight font-mono uppercase">
              Command <span className="text-cyan-400">Center</span>
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
              LIVE TELEMETRIE
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
            KI-Steuerung • Körperwerte • Kalender • Training — ganzheitlich vereint
          </p>
        </div>

        {/* Mobile quick actions (on Desktop these are in the Sidebar) */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setToolsOpen(true)}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-amber-300 bg-amber-500/10 border border-amber-500/30 active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
            aria-label="Pro Tools & Rechner"
            title="Pro Tools & Rechner"
          >
            <Calculator size={17} />
          </button>

          <button
            onClick={() => setCalendarOpen(true)}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-blue-300 bg-blue-500/10 border border-blue-500/30 active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            aria-label="Google Kalender & Termine"
            title="Google Kalender"
          >
            <Calendar size={17} />
          </button>

          <button
            onClick={() => setStravaPanelOpen(true)}
            className={cn(
              "p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:outline-none",
              connection.isConnected
                ? "text-orange-300 bg-orange-500/10 border-orange-500/30"
                : "text-zinc-400 bg-white/[0.06] border border-white/10"
            )}
            aria-label={connection.isConnected ? "Strava Status: Verbunden" : "Mit Strava verbinden"}
            title={connection.isConnected ? "Strava Status: Verbunden" : "Mit Strava verbinden"}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </button>

          <button
            onClick={() => setGarminHubOpen(true)}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Garmin Connect Hub"
            title="Garmin Connect Hub"
          >
            <Zap size={17} />
          </button>

          <button
            onClick={() => setEditorOpen(true)}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-300 bg-white/[0.06] border border-white/10 active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            aria-label="Plan bearbeiten"
            title="Plan bearbeiten"
          >
            <Settings2 size={17} />
          </button>

          <button
            onClick={() => (isCoachOpen ? closeCoach() : openCoach())}
            className={cn(
              "p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none",
              isCoachOpen
                ? "text-purple-100 bg-purple-500/30 border-purple-500/50 shadow-sm"
                : "text-purple-300 bg-purple-500/10 border-purple-500/30"
            )}
            aria-label={isCoachOpen ? "Coach Chat schließen" : "Coach Chat öffnen"}
            title={isCoachOpen ? "Coach Chat schließen" : "Coach Chat öffnen"}
          >
            <Bot size={17} />
          </button>
        </div>
      </header>

      {/* ── Scrollable Dashboard Content Area ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 space-y-4 sm:space-y-6 pb-28 md:pb-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full">
        {/* 1. Enhanced AI Coach Briefing (TOP PRIORITY) */}
        <EnhancedAICoachBriefing
          selectedDay={selectedDay}
          selectedDate={selectedDate}
          onOpenCoach={openCoach}
        />

        {/* 2. Body Composition Compact Card */}
        <BodyCompositionCompactCard />

        {/* 3. Today Schedule Card (Training + Calendar) */}
        <TodayScheduleCard
          selectedDay={selectedDay}
          selectedDate={selectedDate}
          onOpenFullCalendar={() => setCalendarOpen(true)}
        />

        {/* 4. Adaptive Suggestion (conditional) */}
        {adaptiveSuggestion && (
          <AdaptiveSuggestionCard
            selectedDate={selectedDate}
          />
        )}

        {/* 5. Selected Day Workout Detail */}
        {selectedPlan && (
          <WorkoutDetailCard day={selectedPlan} />
        )}

        {/* 6. Weekly Summary Compact */}
        <WeeklySummaryCompactCard />

        {/* 7. Week Strip Navigation */}
        <div className="p-3 sm:p-4 rounded-3xl glass-panel border border-white/10 space-y-2.5 shadow-xl shadow-black/30">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 font-mono">
              Wochenübersicht <span className="text-zinc-600">(Mo – So)</span>
            </h3>
            <span className="text-[10px] text-cyan-400/80 font-semibold">Tag antippen für Trainingsvorschau</span>
          </div>
          <WeekStrip
            plan={weeklyPlan}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
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
    </div>
  );
}