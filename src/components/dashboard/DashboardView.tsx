"use client";

import dynamic from "next/dynamic";
import { useState, useMemo } from "react";
import { Settings2, HardDrive, FileText, Bell, BellOff, RefreshCw, Zap, Calendar, Calculator } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getTodayIndex } from "@/lib/utils";
import AICoachTopBriefing from "./AICoachTopBriefing";
import WeekStrip from "./WeekStrip";
import WorkoutDetailCard from "./WorkoutDetailCard";
import StravaWeekStats from "@/components/strava/StravaWeekStats";
import AdherenceWidget from "./AdherenceWidget";
import NutritionWidget from "./NutritionWidget";
import GarminReadinessCard from "./GarminReadinessCard";
import DailyGuidanceCard from "./DailyGuidanceCard";
import DailyTimelineCard from "./DailyTimelineCard";
import AdaptiveSuggestionCard from "./AdaptiveSuggestionCard";
import VolumeCharts from "./VolumeCharts";
import BodyCompositionCard from "@/components/body/BodyCompositionCard";
import PerformanceAnalyticsCard from "@/components/analytics/PerformanceAnalyticsCard";
import WeatherWidget from "@/components/weather/WeatherWidget";

// Dynamic Imports for zero upfront JS payload:
const PlanEditorModal = dynamic(() => import("./PlanEditorModal"), { ssr: false });
const BackupModal = dynamic(() => import("./BackupModal"), { ssr: false });
const WeeklyReportModal = dynamic(() => import("./WeeklyReportModal"), { ssr: false });
const StravaPanel = dynamic(() => import("@/components/strava/StravaPanel"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });

function useDeloadSuggestion(
  loggedSessions: ReturnType<typeof useApp>["loggedSessions"],
  weeklyPlan: ReturnType<typeof useApp>["weeklyPlan"]
) {
  const hasDeload = weeklyPlan.some((d) => d.isDeload);
  if (hasDeload) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const recentGym = loggedSessions.filter(
    (s) => s.kind === "gym" && new Date(s.date) > cutoff
  );
  return recentGym.length >= 16;
}

export default function DashboardView() {
  const { weeklyPlan, updateWeeklyPlan, loggedSessions } = useApp();
  const { connection } = useStrava();

  const todayIndex = getTodayIndex();
  const [selectedDay, setSelectedDay] = useState<number>(todayIndex);
  const [editorOpen, setEditorOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [stravaPanelOpen, setStravaPanelOpen] = useState(false);
  const [notifState, setNotifState] = useState<"idle" | "sent" | "denied" | "unsupported">("idle");

  const selectedDate = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay();
    const currentDayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const diffDays = selectedDay - currentDayIndex;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diffDays);
    return targetDate.toISOString().split("T")[0];
  }, [selectedDay]);

  const showDeloadBanner = useDeloadSuggestion(loggedSessions, weeklyPlan);
  const selectedPlan = weeklyPlan.find((d) => d.dayIndex === selectedDay);

  async function sendWorkoutReminder() {
    if (!("Notification" in window)) {
      setNotifState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setNotifState("denied");
      return;
    }
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNotifState("denied");
        return;
      }
    }
    const todayP = weeklyPlan.find((d) => d.dayIndex === getTodayIndex());
    const title = todayP?.title || "Heutiges Training";
    const body = todayP?.description || "Zeit für dein Workout!";
    new Notification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      tag: "workout-reminder",
    });
    setNotifState("sent");
    setTimeout(() => setNotifState("idle"), 3000);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md shrink-0 z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight">
              Hybrid Performance Cockpit
            </h1>
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Live Vitalwerte & Belastung
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
            Ganzheitliche Steuerung von Kraft, Ausdauer, Regeneration & Ernährung
          </p>
        </div>

        {/* Mobile quick actions (on Desktop these are in the Sidebar) */}
        <div className="flex items-center gap-1.5 md:hidden">
          <button
            onClick={() => setToolsOpen(true)}
            className="p-2 rounded-xl text-amber-400 bg-amber-500/10 border border-amber-500/20 active:scale-95"
            aria-label="Pro Tools & Rechner"
            title="Pro Tools & Rechner"
          >
            <Calculator size={16} />
          </button>

          <button
            onClick={() => setCalendarOpen(true)}
            className="p-2 rounded-xl text-blue-400 bg-blue-500/10 border border-blue-500/20 active:scale-95"
            aria-label="Google Kalender & Termine"
            title="Google Kalender"
          >
            <Calendar size={16} />
          </button>

          {connection.isConnected ? (
            <button
              onClick={() => setStravaPanelOpen(true)}
              className="p-2 rounded-xl text-orange-400 bg-orange-500/10 border border-orange-500/20 active:scale-95"
              aria-label="Strava Status"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setStravaPanelOpen(true)}
              className="p-2 rounded-xl text-zinc-500 bg-zinc-900 border border-zinc-800 active:scale-95"
              aria-label="Mit Strava verbinden"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
            </button>
          )}

          <button
            onClick={() => setEditorOpen(true)}
            className="p-2 rounded-xl text-zinc-400 bg-zinc-900 border border-zinc-800 active:scale-95"
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
        <div className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
              Wochenübersicht (Mo – So)
            </h3>
            <span className="text-[11px] text-cyan-400 font-semibold">Tag antippen für Trainingsvorschau</span>
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
          {/* ── Left Column (6 or 7 Cols): Selected Day's Active Focus & Holistic Guide ──── */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5">
            {/* Adaptive Training Suggestion (Garmin Load Deficit / Readiness) */}
            <AdaptiveSuggestionCard
              selectedDay={selectedDay}
              selectedDate={selectedDate}
            />

            {/* Selected Workout Card */}
            {selectedPlan && <WorkoutDetailCard day={selectedPlan} />}

            {/* Holistic Coach Daily Guidance */}
            <DailyGuidanceCard
              selectedDay={selectedDay}
              selectedDate={selectedDate}
            />

            {/* Deload suggestion banner if applicable */}
            {showDeloadBanner && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-amber-300">Deload-Woche empfohlen</h4>
                  <p className="text-xs text-zinc-400">Du hast 4 intensive Trainingswochen absolviert.</p>
                </div>
                <button
                  onClick={() => updateWeeklyPlan(weeklyPlan.map((d) => ({ ...d, isDeload: true })))}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
                >
                  <RefreshCw size={13} />
                  <span>Aktivieren</span>
                </button>
              </div>
            )}
          </div>

          {/* ── Right Column (5 Cols): Live Vitals, Weather, Scale & Nutrition Status ─── */}
          <div className="lg:col-span-5 space-y-4 sm:space-y-5">
            {/* Garmin Readiness & Vitals Hub */}
            <GarminReadinessCard
              selectedDate={selectedDate}
              selectedDay={selectedDay}
            />

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
      </div>

      {/* Modals */}
      {editorOpen && (
        <PlanEditorModal
          plan={weeklyPlan}
          onSave={updateWeeklyPlan}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {reportOpen && <WeeklyReportModal onClose={() => setReportOpen(false)} />}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
      {calendarOpen && <GoogleCalendarModal isOpen={calendarOpen} onClose={() => setCalendarOpen(false)} />}
      {toolsOpen && <ToolsHubModal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} />}
      {stravaPanelOpen && <StravaPanel onClose={() => setStravaPanelOpen(false)} />}
    </div>
  );
}
