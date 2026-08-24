"use client";

import {
  LayoutGrid,
  Dumbbell,
  UtensilsCrossed,
  Bot,
  Zap,
  TrendingUp,
  Settings2,
  HardDrive,
  FileText,
  RefreshCw,
  Activity,
  Battery,
  ShieldCheck,
  Scale,
  Calendar,
  Calculator,
  ShoppingCart,
  Bike,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/types";
import { useState } from "react";
import dynamic from "next/dynamic";
import { syncRealGarminData } from "@/lib/garmin/garminService";

const BackupModal = dynamic(() => import("@/components/dashboard/BackupModal"), { ssr: false });
const WeeklyReportModal = dynamic(() => import("@/components/dashboard/WeeklyReportModal"), { ssr: false });
const PlanEditorModal = dynamic(() => import("@/components/dashboard/PlanEditorModal"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });
const ShoppingListModal = dynamic(() => import("@/components/nutrition/ShoppingListModal"), { ssr: false });
const CyclingRouteModal = dynamic(() => import("@/components/routes/CyclingRouteModal"), { ssr: false });

const NAV_ITEMS: { id: ViewId; label: string; subLabel: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Cockpit", subLabel: "Übersicht & Vitalwerte", Icon: LayoutGrid },
  { id: "training", label: "Training", subLabel: "Workouts & Wochenplan", Icon: Dumbbell },
  { id: "nutrition", label: "Ernährung", subLabel: "Makros, Foto & Barcode", Icon: UtensilsCrossed },
  { id: "coach", label: "KI-Coach", subLabel: "Gemini Interactions", Icon: Bot },
];

export default function DesktopSidebar() {
  const {
    activeView,
    setActiveView,
    activeSession,
    weeklyPlan,
    updateWeeklyPlan,
    garminHealthLogs,
    updateGarminHealth,
    addGarminActivity,
    bodyWeightLog,
  } = useApp();

  const [isSyncing, setIsSyncing] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const health = garminHealthLogs[todayStr];
  const latestBody = bodyWeightLog[bodyWeightLog.length - 1];

  async function handleGarminSync() {
    setIsSyncing(true);
    try {
      const res = await syncRealGarminData(todayStr);
      if (res.success && res.health) {
        updateGarminHealth(todayStr, res.health);
        if (res.activities) {
          res.activities.forEach((a) => addGarminActivity(a));
        }
      }
    } catch (err) {
      console.warn("Garmin sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 lg:w-72 2xl:w-80 h-full bg-zinc-950 border-r border-zinc-800/80 shrink-0 select-none">
        {/* App Branding */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-linear-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
              <Zap size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-wider text-zinc-100 uppercase">
                Hybrid Athlete
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-semibold text-zinc-400">Pro OS Cockpit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 px-3 block mb-2">
            Hauptmenü
          </span>
          {NAV_ITEMS.map(({ id, label, subLabel, Icon }) => {
            const active = activeView === id;
            const isTraining = id === "training";
            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all duration-200 group relative",
                  active
                    ? "bg-zinc-900 text-zinc-100 border border-zinc-700/80 shadow-md shadow-black/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-xl transition-colors",
                      active
                        ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                        : "bg-zinc-900 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-800"
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">{label}</span>
                    <span className="text-[11px] text-zinc-500 block leading-tight">{subLabel}</span>
                  </div>
                </div>

                {/* Training active session badge */}
                {isTraining && activeSession && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                    Live
                  </span>
                )}

                {/* Active Indicator Bar */}
                {active && (
                  <div className="w-1 h-6 bg-cyan-400 rounded-full absolute right-2" />
                )}
              </button>
            );
          })}

          {/* Quick Tools Section */}
          <div className="pt-4 space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 px-3 block mb-2">
              Verwaltung & Berichte
            </span>

            <button
              onClick={() => setToolsOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-amber-300 hover:bg-zinc-900/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Calculator size={16} className="text-amber-400 group-hover:scale-110 transition-transform" />
                <span>Pro Tools & Rechner</span>
              </div>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Neu
              </span>
            </button>

            <button
              onClick={() => setRoutesOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-orange-300 hover:bg-zinc-900/50 transition-colors"
            >
              <Bike size={16} className="text-orange-400" />
              <span>Rennrad-Routen & GPX</span>
            </button>

            <button
              onClick={() => setShoppingOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-emerald-300 hover:bg-zinc-900/50 transition-colors"
            >
              <ShoppingCart size={16} className="text-emerald-400" />
              <span>Einkaufsliste & Rezepte</span>
            </button>

            <button
              onClick={() => setCalendarOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-blue-300 hover:bg-zinc-900/50 transition-colors"
            >
              <Calendar size={16} className="text-blue-400" />
              <span>Google Kalender & Sync</span>
            </button>

            <button
              onClick={() => setEditorOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
            >
              <Settings2 size={16} className="text-zinc-500" />
              <span>Wochenplan bearbeiten</span>
            </button>

            <button
              onClick={() => setReportOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
            >
              <FileText size={16} className="text-zinc-500" />
              <span>Wochenbericht & Review</span>
            </button>

            <button
              onClick={() => setBackupOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
            >
              <HardDrive size={16} className="text-zinc-500" />
              <span>Daten-Backup & Export</span>
            </button>
          </div>
        </div>

        {/* Live Vitals Footer Strip */}
        <div className="p-3.5 m-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] font-bold text-zinc-300">Garmin Live Sync</span>
            </div>
            <button
              onClick={handleGarminSync}
              disabled={isSyncing}
              className="p-1 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Jetzt synchronisieren"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin text-cyan-400" : ""} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 uppercase font-bold block">Readiness</span>
              <span className="text-xs font-mono font-bold text-cyan-400">{health?.trainingReadiness || 64} / 100</span>
            </div>
            <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/60">
              <span className="text-[9px] text-zinc-500 uppercase font-bold block">Body Battery</span>
              <span className="text-xs font-mono font-bold text-emerald-400">{health?.bodyBattery || 69}%</span>
            </div>
          </div>
        </div>
      </aside>

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
      {shoppingOpen && <ShoppingListModal isOpen={shoppingOpen} onClose={() => setShoppingOpen(false)} />}
      {routesOpen && <CyclingRouteModal isOpen={routesOpen} onClose={() => setRoutesOpen(false)} />}
    </>
  );
}
