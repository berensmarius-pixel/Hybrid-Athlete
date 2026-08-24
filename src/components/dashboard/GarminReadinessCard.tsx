"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Zap,
  Watch,
  Bike,
  Activity,
  Heart,
  Moon,
  Flame,
  ChevronRight,
  ShieldCheck,
  Battery,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { cn } from "@/lib/utils";

const GarminAnalyticsModal = dynamic(() => import("@/components/garmin/GarminAnalyticsModal"), { ssr: false });

export default function GarminReadinessCard() {
  const { garminHealthLogs } = useApp();
  const [hubOpen, setHubOpen] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const health = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);

  const readiness = health.trainingReadiness || 64;
  const battery = health.bodyBattery || 69;
  const hrvStatus = health.hrvStatus || "balanced";
  const activeCalories = health.activeCaloriesBurned || 97;

  const getHrvLabel = (status: string) => {
    if (status === "balanced") return { label: "Ausgeglichen", color: "text-emerald-400" };
    if (status === "unbalanced") return { label: "Unbalanciert", color: "text-amber-400" };
    if (status === "low") return { label: "Niedrig", color: "text-rose-400" };
    return { label: "Ermüdet", color: "text-rose-400" };
  };

  const hrvInfo = getHrvLabel(hrvStatus);

  return (
    <>
      <div
        onClick={() => setHubOpen(true)}
        className="p-4 rounded-3xl bg-linear-to-b from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-sm space-y-3.5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-105 transition-transform">
              <Zap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-cyan-300 transition-colors">
                  Garmin Analytics & Vitalwerte
                </h3>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-zinc-400">
                Live Grafana Telemetrie • Klick für Detailansicht
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-cyan-300 transition-colors">
            <span className="font-semibold text-cyan-400/90">Analytics</span>
            <ChevronRight size={15} />
          </div>
        </div>

        {/* Big Readiness & Body Battery Strip */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Training Readiness */}
          <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1">
                <Activity size={13} className="text-cyan-400" />
                Readiness
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-300">
                {readiness >= 75 ? "Optimal" : readiness >= 50 ? "Moderat" : "Erholung"}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-zinc-100">{readiness}</span>
                <span className="text-xs text-zinc-500">/ 100</span>
              </div>
              {health.recoveryTimeHours !== undefined && (
                <span className="text-[10px] text-zinc-400">
                  {health.recoveryTimeHours}h Erholung
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, readiness)}%` }}
              />
            </div>
          </div>

          {/* Body Battery */}
          <div className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1">
                <Battery size={13} className="text-emerald-400" />
                Body Battery
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                +{health.bodyBatteryCharged || 65} geladen
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-zinc-100">{battery}</span>
                <span className="text-xs text-zinc-500">%</span>
              </div>
              {health.bodyBatteryDrained !== undefined && (
                <span className="text-[10px] text-zinc-400">
                  -{health.bodyBatteryDrained} verbraucht
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, battery)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Extended 4-Metric Grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/60">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">HRV Nacht</span>
            <span className="text-xs font-mono font-bold text-cyan-400 block">
              {health.hrvLastNightMs ? `${health.hrvLastNightMs} ms` : hrvInfo.label}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/60">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Schlaf</span>
            <span className="text-xs font-bold text-violet-400 block">
              {health.sleepDurationHours}h {health.sleepScore ? `(${health.sleepScore})` : ""}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/60">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Akut-Last</span>
            <span className="text-xs font-mono font-bold text-purple-400 block">
              {health.acuteTrainingLoad || 343}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/60">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Ruhepuls</span>
            <span className="text-xs font-mono font-bold text-rose-400 block">
              {health.restingHeartRate} bpm
            </span>
          </div>
        </div>
      </div>

      {hubOpen && <GarminAnalyticsModal isOpen={hubOpen} onClose={() => setHubOpen(false)} />}
    </>
  );
}
