"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Zap,
  Activity,
  ChevronRight,
  Battery,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { motion } from "motion/react";
import { getLocalDateString } from "@/lib/utils";

const GarminAnalyticsModal = dynamic(() => import("@/components/garmin/GarminAnalyticsModal"), { ssr: false });

interface GarminReadinessCardProps {
  selectedDate?: string;
  selectedDay?: number;
}

export default function GarminReadinessCard({ selectedDate }: GarminReadinessCardProps) {
  const { garminHealthLogs } = useApp();
  const [hubOpen, setHubOpen] = useState(false);

  const activeDate = selectedDate || getLocalDateString();
  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);

  const readiness = health.trainingReadiness || 64;
  const battery = health.bodyBattery || 69;
  const hrvStatus = health.hrvStatus || "balanced";

  const getHrvLabel = (status: string) => {
    if (status === "balanced") return { label: "Ausgeglichen", color: "text-emerald-400" };
    if (status === "unbalanced") return { label: "Unbalanciert", color: "text-amber-400" };
    if (status === "low") return { label: "Niedrig", color: "text-rose-400" };
    return { label: "Ermüdet", color: "text-rose-400" };
  };

  const hrvInfo = getHrvLabel(hrvStatus);

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.01 }}
        onClick={() => setHubOpen(true)}
        className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-2xl shadow-black/40 space-y-4 relative overflow-hidden"
      >
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/20 transition-all" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <Zap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-zinc-100 group-hover:text-cyan-300 transition-colors font-mono tracking-tight">
                  GARMIN TELEMETRIE
                </h3>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
              </div>
              <p className="text-[11px] text-zinc-400">
                Live Vitalwerte • Klick für Detailanalyse
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-cyan-300 transition-colors font-mono">
            <span className="font-bold text-cyan-400/90 text-[11px]">DETAILS</span>
            <ChevronRight size={14} />
          </div>
        </div>

        {/* Big Readiness & Body Battery Strip */}
        <div className="grid grid-cols-2 gap-3">
          {/* Training Readiness */}
          <div className="p-3.5 rounded-2xl glass-card space-y-2 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5 font-medium text-[11px]">
                <Activity size={13} className="text-cyan-400" />
                Readiness
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                {readiness >= 75 ? "Optimal" : readiness >= 50 ? "Moderat" : "Erholung"}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black font-mono text-zinc-100">{readiness}</span>
                <span className="text-xs text-zinc-500 font-mono">/100</span>
              </div>
              {health.recoveryTimeHours !== undefined && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {health.recoveryTimeHours}h Rest
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, readiness)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              />
            </div>
          </div>

          {/* Body Battery */}
          <div className="p-3.5 rounded-2xl glass-card space-y-2 border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5 font-medium text-[11px]">
                <Battery size={13} className="text-emerald-400" />
                Body Battery
              </span>
              <span className="text-[9px] font-bold text-emerald-400 font-mono">
                +{health.bodyBatteryCharged || 65}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl sm:text-3xl font-black font-mono text-zinc-100">{battery}</span>
                <span className="text-xs text-zinc-500 font-mono">%</span>
              </div>
              {health.bodyBatteryDrained !== undefined && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  -{health.bodyBatteryDrained} used
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, battery)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"
              />
            </div>
          </div>
        </div>

        {/* Extended 4-Metric Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block font-mono">HRV Nacht</span>
            <span className="text-xs font-mono font-bold text-cyan-300 block mt-0.5">
              {health.hrvLastNightMs ? `${health.hrvLastNightMs} ms` : hrvInfo.label}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block font-mono">Schlaf</span>
            <span className="text-xs font-mono font-bold text-violet-300 block mt-0.5">
              {health.sleepDurationHours}h {health.sleepScore ? `(${health.sleepScore})` : ""}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block font-mono">Akut-Last</span>
            <span className="text-xs font-mono font-bold text-purple-300 block mt-0.5">
              {health.acuteTrainingLoad || 343}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-wider block font-mono">Ruhepuls</span>
            <span className="text-xs font-mono font-bold text-rose-300 block mt-0.5">
              {health.restingHeartRate} bpm
            </span>
          </div>
        </div>
      </motion.div>

      {hubOpen && <GarminAnalyticsModal isOpen={hubOpen} onClose={() => setHubOpen(false)} />}
    </>
  );
}
