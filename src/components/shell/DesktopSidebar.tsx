"use client";

import {
  LayoutGrid,
  Dumbbell,
  UtensilsCrossed,
  Zap,
  TrendingUp,
  Settings2,
  HardDrive,
  RefreshCw,
  Activity,
  ShieldCheck,
  Calendar,
  Calculator,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn, getLocalDateString } from "@/lib/utils";
import type { ViewId } from "@/types";
import { useState } from "react";
import dynamic from "next/dynamic";
import { syncRealGarminData } from "@/lib/garmin/garminService";
import { motion } from "motion/react";

const BackupModal = dynamic(() => import("@/components/dashboard/BackupModal"), { ssr: false });
const WeeklyReportModal = dynamic(() => import("@/components/dashboard/WeeklyReportModal"), { ssr: false });
const PlanEditorModal = dynamic(() => import("@/components/dashboard/PlanEditorModal"), { ssr: false });
const GoogleCalendarModal = dynamic(() => import("@/components/calendar/GoogleCalendarModal"), { ssr: false });
const ToolsHubModal = dynamic(() => import("@/components/calculator/ToolsHubModal"), { ssr: false });
const ShoppingListModal = dynamic(() => import("@/components/nutrition/ShoppingListModal"), { ssr: false });
const CyclingRouteModal = dynamic(() => import("@/components/routes/CyclingRouteModal"), { ssr: false });
const GarminHubModal = dynamic(() => import("@/components/garmin/GarminHubModal"), { ssr: false });

const NAV_ITEMS: { id: ViewId; label: string; subLabel: string; Icon: React.ElementType }[] = [
  { id: "command-center", label: "Command Center", subLabel: "KI-Steuerung & Übersicht", Icon: LayoutGrid },
  { id: "training", label: "Training", subLabel: "Workouts & Wochenplan", Icon: Dumbbell },
  { id: "nutrition", label: "Ernährung", subLabel: "Makros & Fueling", Icon: UtensilsCrossed },
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
  } = useApp();

  const [isSyncing, setIsSyncing] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const [garminHubOpen, setGarminHubOpen] = useState(false);

  const todayStr = getLocalDateString();
  const health = garminHealthLogs[todayStr];

  async function handleGarminSync() {
    setIsSyncing(true);
    try {
      const res = await syncRealGarminData(todayStr);
      if (res.success && res.health) {
        updateGarminHealth(todayStr, res.health);
        if (res.activities) {
          res.activities.forEach((a) => addGarminActivity(a));
        }
      } else {
        setGarminHubOpen(true);
      }
    } catch (err) {
      console.warn("Garmin sync error:", err);
      setGarminHubOpen(true);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 lg:w-72 2xl:w-80 h-full bg-zinc-950/80 backdrop-blur-2xl border-r border-white/[0.07] shrink-0 select-none z-20">
        {/* App Branding */}
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-zinc-900 border border-white/10 text-cyan-400 flex items-center justify-center">
              <Zap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs font-black tracking-wider text-zinc-100 uppercase font-mono">
                  HYBRID ATHLETE
                </h1>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/10 text-zinc-300 border border-white/10 font-mono">
                  PRO
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-medium text-zinc-400 font-mono">Telemetry Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 px-3 block mb-2 font-mono">
            Navigation
          </span>
          {NAV_ITEMS.map(({ id, label, subLabel, Icon }) => {
            const active = activeView === id;
            const isTraining = id === "training";
            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all duration-200 group relative cursor-pointer",
                  active
                    ? "text-zinc-100 font-bold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
                )}
              >
                {/* Motion Active Highlight */}
                {active && (
                  <motion.div
                    layoutId="sidebarActivePill"
                    className="absolute inset-0 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-lg shadow-black/40"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}

                <div className="flex items-center gap-3 relative z-10">
                  <div
                    className={cn(
                      "p-2.5 rounded-xl transition-all duration-200",
                      active
                        ? "bg-zinc-800 text-cyan-400 border border-white/10"
                        : "bg-zinc-900/60 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-800"
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">{label}</span>
                    <span className="text-[11px] text-zinc-400 block leading-tight font-normal">{subLabel}</span>
                  </div>
                </div>

                {/* Training active session badge */}
                {isTraining && activeSession && (
                  <span className="relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
                    Live
                  </span>
                )}

                {/* Active Glow indicator dot */}
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] relative z-10" />
                )}
              </button>
            );
          })}

          {/* Integrationen & Hubs */}
          <div className="pt-5 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 px-3 block mb-2 font-mono">
              Geräte & Sync
            </span>

            <button
              onClick={() => setGarminHubOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-cyan-300 hover:bg-white/[0.04] transition-all group cursor-pointer border border-transparent hover:border-white/5"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={16} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                <span>Garmin Connect Hub</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Live
              </span>
            </button>

            <button
              onClick={() => setCalendarOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-blue-300 hover:bg-white/[0.04] transition-all cursor-pointer border border-transparent hover:border-white/5"
            >
              <Calendar size={16} className="text-blue-400" />
              <span>Google Kalender</span>
            </button>
          </div>

          {/* Werkzeuge & System */}
          <div className="pt-3 space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 px-3 block mb-2 font-mono">
              Tools & Export
            </span>

            <button
              onClick={() => setToolsOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-amber-300 hover:bg-white/[0.04] transition-all group cursor-pointer border border-transparent hover:border-white/5"
            >
              <div className="flex items-center gap-2.5">
                <Calculator size={16} className="text-amber-400 group-hover:scale-110 transition-transform" />
                <span>Pro Rechner & 1RM</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Tools
              </span>
            </button>

            <button
              onClick={() => setBackupOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.04] transition-all cursor-pointer border border-transparent hover:border-white/5"
            >
              <HardDrive size={16} className="text-zinc-500" />
              <span>Daten-Backup & Export</span>
            </button>
          </div>
        </div>

        {/* Minimal Sync Status Footer */}
        <div className="p-3 m-3 rounded-2xl glass-panel flex items-center justify-between gap-2.5 shrink-0 shadow-lg shadow-black/40">
          <button
            onClick={() => setGarminHubOpen(true)}
            className="flex items-center gap-2.5 text-left hover:opacity-90 transition-opacity cursor-pointer group min-w-0 flex-1"
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <div className="flex flex-col min-w-0 ml-1 overflow-hidden">
              <span className="text-xs font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors truncate block">
                Garmin Connect
              </span>
              <span className="text-[10px] text-zinc-400 font-medium truncate block">
                {health?.lastSyncedAt ? "Live synchronisiert" : "Status: Verbunden"}
              </span>
            </div>
          </button>

          <button
            onClick={handleGarminSync}
            disabled={isSyncing}
            className="p-2 rounded-xl text-zinc-400 hover:text-cyan-400 hover:bg-white/[0.06] transition-all disabled:opacity-50 shrink-0 cursor-pointer"
            title="Jetzt synchronisieren"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin text-cyan-400" : ""} />
          </button>
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
      {garminHubOpen && <GarminHubModal isOpen={garminHubOpen} onClose={() => setGarminHubOpen(false)} />}
    </>
  );
}
