"use client";

import { useState } from "react";
import { Settings2, Loader2, HardDrive, FileText, Bell, BellOff, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getTodayIndex } from "@/lib/utils";
import WeekStrip from "./WeekStrip";
import WorkoutDetailCard from "./WorkoutDetailCard";
import PlanEditorModal from "./PlanEditorModal";
import BackupModal from "./BackupModal";
import StravaPanel from "@/components/strava/StravaPanel";
import StravaWeekStats from "@/components/strava/StravaWeekStats";
import AdherenceWidget from "./AdherenceWidget";
import VolumeCharts from "./VolumeCharts";
import WeeklyReportModal from "./WeeklyReportModal";
import BodyWeightWidget from "./BodyWeightWidget";

function useDeloadSuggestion(loggedSessions: ReturnType<typeof useApp>["loggedSessions"], weeklyPlan: ReturnType<typeof useApp>["weeklyPlan"]) {
  const hasDeload = weeklyPlan.some((d) => d.isDeload);
  if (hasDeload) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const recentGym = loggedSessions.filter(
    (s) => s.kind === "gym" && new Date(s.date) > cutoff
  );
  return recentGym.length >= 10;
}

export default function DashboardView() {
  const { weeklyPlan, updateWeeklyPlan, loggedSessions } = useApp();
  const { connection, isSyncing, sync } = useStrava();

  const [selectedDay, setSelectedDay] = useState<number>(getTodayIndex());
  const [editorOpen, setEditorOpen] = useState(false);
  const [stravaPanelOpen, setStravaPanelOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [notifState, setNotifState] = useState<"idle" | "sent" | "denied" | "unsupported">("idle");

  const selectedPlan = weeklyPlan.find((d) => d.dayIndex === selectedDay) ?? weeklyPlan[0];
  const showDeloadBanner = useDeloadSuggestion(loggedSessions, weeklyPlan);

  async function sendWorkoutReminder() {
    if (!("Notification" in window)) { setNotifState("unsupported"); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setNotifState("denied"); return; }
    const today = weeklyPlan[getTodayIndex()];
    new Notification("Heutiges Training: " + today.title, {
      body: today.description?.slice(0, 120) || "Zeit zu trainieren!",
    });
    setNotifState("sent");
    setTimeout(() => setNotifState("idle"), 4000);
  }

  function applyDeloadWeek() {
    const deloaded = weeklyPlan.map((d) => ({ ...d, isDeload: true }));
    updateWeeklyPlan(deloaded);
  }

  return (
    <div className="flex flex-col h-full pb-16 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-12 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Trainingsplan</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Deine Woche auf einen Blick</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Strava button */}
          {connection.isConnected ? (
            <button
              onClick={() => sync()}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         text-orange-400 bg-orange-500/10 border border-orange-500/20
                         hover:bg-orange-500/20 transition-colors
                         disabled:opacity-60 disabled:pointer-events-none"
              aria-label="Strava synchronisieren"
            >
              {isSyncing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
              )}
              <span className="hidden sm:inline">
                {isSyncing ? "Synchronisiert …" : "Sync"}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setStravaPanelOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                         text-zinc-500 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
              aria-label="Mit Strava verbinden"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              <span className="hidden sm:inline">Strava</span>
            </button>
          )}

          {/* Weekly report */}
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                       text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            aria-label="Wochenbericht"
          >
            <FileText size={16} />
          </button>

          {/* Backup */}
          <button
            onClick={() => setBackupOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                       text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            aria-label="Backup"
          >
            <HardDrive size={16} />
          </button>

          {/* Workout reminder */}
          <button
            onClick={sendWorkoutReminder}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              notifState === "sent"
                ? "text-green-400 bg-green-500/10 border border-green-500/20"
                : notifState === "denied" || notifState === "unsupported"
                ? "text-red-400 bg-red-500/10 border border-red-500/20"
                : "text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100"
            }`}
            aria-label="Trainings-Erinnerung"
            title={
              notifState === "sent" ? "Erinnerung gesendet!" :
              notifState === "denied" ? "Benachrichtigungen blockiert" :
              notifState === "unsupported" ? "Nicht unterstützt" :
              "Trainings-Erinnerung"
            }
          >
            {notifState === "sent" ? <Bell size={16} /> : notifState === "denied" ? <BellOff size={16} /> : <Bell size={16} />}
          </button>

          {/* Plan editor */}
          <button
            onClick={() => setEditorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                       text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            aria-label="Plan bearbeiten"
          >
            <Settings2 size={16} />
            <span className="hidden sm:inline">Bearbeiten</span>
          </button>
        </div>
      </div>

      {/* ── Strava connected pill ───────────────────────────────────────────── */}
      {connection.isConnected && (
        <button
          onClick={() => setStravaPanelOpen(true)}
          className="mx-4 mb-1 flex items-center gap-2 px-3 py-1.5 rounded-xl
                     bg-zinc-800/60 border border-zinc-700/40 hover:border-zinc-600/60 transition-colors w-fit"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          <span className="text-xs text-zinc-400">
            {connection.athlete
              ? `${connection.athlete.firstname} ${connection.athlete.lastname}`
              : "Strava verbunden"}
          </span>
          {connection.lastSynced && (
            <span className="text-xs text-zinc-600">
              · {new Intl.DateTimeFormat("de-DE", {
                day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit",
              }).format(new Date(connection.lastSynced))}
            </span>
          )}
        </button>
      )}

      {/* ── Week strip ──────────────────────────────────────────────────────── */}
      <WeekStrip
        plan={weeklyPlan}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <div className="mx-4 border-t border-zinc-800/60 mb-4" />

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-5 pb-4">
        {/* Workout detail for selected day */}
        {selectedPlan && <WorkoutDetailCard day={selectedPlan} />}

        {/* Deload suggestion banner */}
        {showDeloadBanner && (
          <div className="mx-4 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div>
              <p className="text-sm font-semibold text-amber-300">Deload-Woche empfohlen</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Du hast in den letzten 4 Wochen ≥ 10 Gym-Sessions — Zeit für Erholung.</p>
            </div>
            <button
              onClick={applyDeloadWeek}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
            >
              <RefreshCw size={13} />
              Aktivieren
            </button>
          </div>
        )}

        {/* Plan adherence score */}
        <AdherenceWidget />

        {/* Body weight tracking */}
        <BodyWeightWidget />

        {/* 8-week volume charts */}
        <VolumeCharts />

        {/* Weekly Strava stats — only shown when there are activities this week */}
        <StravaWeekStats />

        {/* Empty state: connected but no sync yet */}
        {connection.isConnected && !connection.lastSynced && (
          <div className="mx-4 flex flex-col items-center gap-3 p-6 rounded-2xl bg-zinc-900 border border-zinc-800/60">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-orange-500/50 fill-current" aria-hidden="true">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            <p className="text-sm text-zinc-500 text-center">
              Strava verbunden — tippe auf{" "}
              <span className="text-orange-400 font-medium">Sync</span>, um deine Aktivitäten zu laden.
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {editorOpen && (
        <PlanEditorModal
          plan={weeklyPlan}
          onSave={updateWeeklyPlan}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {stravaPanelOpen && (
        <StravaPanel onClose={() => setStravaPanelOpen(false)} />
      )}

      {backupOpen && (
        <BackupModal onClose={() => setBackupOpen(false)} />
      )}

      {reportOpen && (
        <WeeklyReportModal onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}
