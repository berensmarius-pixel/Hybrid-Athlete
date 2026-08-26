"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { Settings2, Calendar, Calculator, Watch } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getTodayIndex, getLocalDateString } from "@/lib/utils";
import AICoachTopBriefing from "./AICoachTopBriefing";
import WeekStrip from "./WeekStrip";
import WorkoutDetailCard from "./WorkoutDetailCard";
import NutritionWidget from "./NutritionWidget";
import GarminReadinessCard from "./GarminReadinessCard";
import GarminDeepMetrics from "./GarminDeepMetrics";
import SleepRecoveryCard from "./SleepRecoveryCard";
import DailyGuidanceCard from "./DailyGuidanceCard";
import DailyTimelineCard from "./DailyTimelineCard";
import AdaptiveSuggestionCard from "./AdaptiveSuggestionCard";
import DeloadRecommendationCard from "./DeloadRecommendationCard";
import PostWorkoutDebriefCard from "./PostWorkoutDebriefCard";
import WeeklySummaryCard from "@/modules/reports/weekly-summary-card";
import BodyCompositionCard from "@/components/body/BodyCompositionCard";
import WeatherWidget from "@/components/weather/WeatherWidget";

// Dynamic Imports for zero upfront JS payload:
const PlanEditorModal = dynamic(() => import("./PlanEditorModal"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });
const StravaPanel = dynamic(() => import("@/components/strava/StravaPanel"), { ssr: false });
const GarminHubModal = dynamic(() => import("@/components/garmin/GarminHubModal"), { ssr: false });

export default function DashboardView() {
  const { weeklyPlan, updateWeeklyPlan } = useApp();
  const { connection } = useStrava();

  const todayIndex = getTodayIndex();
const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
const [editorOpen, setEditorOpen] = useState(false);
const [calendarOpen, setCalendarOpen] = useState(false);
const [toolsOpen, setToolsOpen] = useState(false);
const [stravaPanelOpen, setStravaPanelOpen] = useState(false);
// Garmin-Hub auch mobil erreichbar machen (Desktop: Sidebar-Eintrag)
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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 flex items-center justify-between border-b border-white/5 bg-zinc-950/90 backdrop-blur-md shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight font-mono uppercase">
              Performance <span className="text-cyan-400">Cockpit</span>
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
              LIVE TELEMETRIE
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">
            Kraft · Ausdauer · Regeneration · Ernährung — ganzheitlich gesteuert
          </p>
        </div>

        {/* Mobile quick actions (on Desktop these are in the Sidebar) */}
        <div className="flex items-center gap-1.5 md:hidden">
          <button
            onClick={() => setToolsOpen(true)}
            className="p-2 min-h-9 min-w-9 flex items-center justify-center rounded-xl text-amber-300 bg-amber-500/10 border border-amber-500/30 active:scale-95"
            aria-label="Pro Tools & Rechner"
            title="Pro Tools & Rechner"
          >
            <Calculator size={16} />
          </button>

          <button
            onClick={() => setCalendarOpen(true)}
            className="p-2 min-h-9 min-w-9 flex items-center justify-center rounded-xl text-blue-300 bg-blue-500/10 border border-blue-500/30 active:scale-95"
            aria-label="Google Kalender & Termine"
            title="Google Kalender"
          >
            <Calendar size={16} />
          </button>

          <button
            onClick={() => setStravaPanelOpen(true)}
            className={cnStrava(connection.isConnected)}
            aria-label={connection.isConnected ? "Strava Status" : "Mit Strava verbinden"}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </button>

          <button
            onClick={() => setGarminHubOpen(true)}
            className="p-2 rounded-xl text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 active:scale-95"
            aria-label="Garmin Connect Hub"
            title="Garmin Connect Hub"
          >
            <Watch size={16} />
          </button>

          <button
            onClick={() => setEditorOpen(true)}
            className="p-2 rounded-xl text-zinc-300 bg-white/[0.06] border border-white/10 active:scale-95 min-h-9 min-w-9 flex items-center justify-center"
            aria-label="Plan bearbeiten"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Scrollable Dashboard Content Area ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 space-y-4 sm:space-y-6 pb-28 md:pb-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full">
        {/* 0. Top AI Coach Live Briefing Box */}
        <AICoachTopBriefing
          selectedDay={selectedDay}
          selectedDate={selectedDate}
        />

        {/* 1. Compact 7-Day Navigation Strip at Top */}
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

        {/* 2. Daily Timeline Ribbon ("Dein Tag") */}
        <DailyTimelineCard
          selectedDay={selectedDay}
          selectedDate={selectedDate}
          onResetToToday={() => setSelectedDay(todayIndex)}
        />

        {/* 3. Main Focus Grid (Selected Day's Workout + Live Vitals Hub) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* ── Left Column (7 Cols): Selected Day's Active Focus & Holistic Guide ──── */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5">
            {/* Adaptive Training Suggestion (Garmin Load Deficit / Readiness) */}
            <AdaptiveSuggestionCard
              selectedDate={selectedDate}
            />

            {/* Selected Workout Card */}
            {selectedPlan && <WorkoutDetailCard day={selectedPlan} />}

            {/* Holistic Coach Daily Guidance */}
            <DailyGuidanceCard
              selectedDay={selectedDay}
              selectedDate={selectedDate}
            />

            {/* Deload & Functional Overreaching Sentinel (2+ Marker > 5 Tage) */}
            <DeloadRecommendationCard />
          </div>

          {/* ── Right Column (5 Cols): Live Garmin Vitals Stack ─── */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-5">
            {/* Garmin Readiness & Vitals Hub */}
            <GarminReadinessCard
              selectedDate={selectedDate}
              selectedDay={selectedDay}
            />

            {/* Post-Workout Debrief aus der Garmin-Webhook-Pipeline */}
            <PostWorkoutDebriefCard />

            {/* Garmin Deep Telemetry: Schlaf, Load-Tunnel, Tagesaktivität */}
            <GarminDeepMetrics selectedDate={selectedDate} />

            {/* Circadianes Schlaf- & Regenerationsziel */}
            <SleepRecoveryCard selectedDate={selectedDate} />
          </div>
        </div>

        {/* 4. Weekly Performance Report (Aggregation + KI-Analyse + Export) */}
        <WeeklySummaryCard />

        {/* 5. Secondary Widget Row: Weather · Nutrition · Body Composition */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 items-start">
          {/* Weather & Outdoor Conditions */}
          <WeatherWidget />

          {/* Daily Nutrition & Calorie Target Status */}
          <NutritionWidget
            selectedDate={selectedDate}
            selectedDay={selectedDay}
          />

          {/* Insmart Scale & Body Composition Card */}
          <BodyCompositionCard />
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

/** Strava-Button-Farbe je Verbindungsstatus */
function cnStrava(connected: boolean): string {
  return connected
    ? "p-2 rounded-xl text-orange-300 bg-orange-500/10 border border-orange-500/30 active:scale-95"
    : "p-2 rounded-xl text-zinc-400 bg-white/[0.06] border border-white/10 active:scale-95";
}
