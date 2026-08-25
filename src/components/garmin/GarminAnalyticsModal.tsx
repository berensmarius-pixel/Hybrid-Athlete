"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  X,
  Zap,
  Activity,
  Heart,
  Moon,
  Flame,
  ShieldCheck,
  TrendingUp,
  BatteryCharging,
  Gauge,
  BarChart3,
  Waves,
  Wind,
  Droplet,
  Compass,
  Bike,
  Sparkles,
  RefreshCw,
  Award,
  Clock,
  ChevronRight,
  Info,
  LogIn,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { syncRealGarminData } from "@/lib/garmin/garminService";
import type { GarminDailyHealth, GarminActivity } from "@/types";
import { getLocalDateString, cn } from "@/lib/utils";
import GarminActivityDetailModal from "./GarminActivityDetailModal";

const GarminHubModal = dynamic(() => import("./GarminHubModal"), { ssr: false });

interface GarminAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GarminAnalyticsModal({ isOpen, onClose }: GarminAnalyticsModalProps) {
  const { garminHealthLogs, updateGarminHealth, garminActivities, addGarminActivity } = useApp();

  const todayStr = getLocalDateString();
  const health: GarminDailyHealth = garminHealthLogs[todayStr] || {
    date: todayStr,
    trainingReadiness: 64,
    bodyBattery: 69,
    bodyBatteryCharged: 65,
    bodyBatteryDrained: 32,
    hrvStatus: "balanced",
    hrvWeeklyAvgMs: 72,
    hrvLastNightMs: 80,
    sleepScore: 95,
    sleepDurationHours: 8.7,
    deepSleepSeconds: 6000,
    lightSleepSeconds: 19260,
    remSleepSeconds: 6180,
    awakeSleepSeconds: 180,
    recoveryTimeHours: 14.5,
    restingHeartRate: 42,
    minHeartRate: 37,
    maxHeartRate: 112,
    activeCaloriesBurned: 97,
    totalCaloriesBurned: 1608,
    bmrCalories: 1511,
    steps: 3839,
    dailyStepGoal: 7170,
    totalDistanceMeters: 3400,
    floorsClimbed: 3,
    avgStressLevel: 15,
    maxStressLevel: 98,
    acuteTrainingLoad: 343,
    minChronicLoad: 175,
    maxChronicLoad: 328,
    chronicLoad: 219,
    acwrRatio: 1.5,
    loadLowAerobic: 298,
    loadLowAerobicTargetMin: 203,
    loadLowAerobicTargetMax: 466,
    loadHighAerobic: 185,
    loadHighAerobicTargetMin: 278,
    loadHighAerobicTargetMax: 541,
    loadAnaerobic: 83,
    loadAnaerobicTargetMin: 0,
    loadAnaerobicTargetMax: 262,
    trainingBalancePhrase: "AEROBIC_HIGH_SHORTAGE",
    vo2MaxRunning: 52.6,
    vo2MaxCycling: 52.6,
    fitnessAge: 20,
    avgWakingRespiration: 13.0,
    avgSleepRespiration: 13.0,
    spO2AvgPct: 95.0,
    trainingStatus: "productive",
  };

  const [activeTab, setActiveTab] = useState<"load" | "sleep" | "battery" | "cardio" | "activities">("load");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [detailActivity, setDetailActivity] = useState<GarminActivity | null>(null);

  if (!isOpen) return null;

  async function handleRefresh() {
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncRealGarminData(todayStr);
      if (res.success && res.health) {
        updateGarminHealth(todayStr, res.health);
        if (res.activities) {
          res.activities.forEach((a) => addGarminActivity(a));
        }
        setSyncMsg({ text: `✅ Vitalwerte & Telemetrie aktualisiert! (${res.activities?.length || 0} Aktivitäten)` });
      } else {
        setSyncMsg({ text: res.error || "Fehler beim Aktualisieren. Bitte in Garmin Connect einloggen.", isError: true });
      }
    } catch (err: any) {
      setSyncMsg({ text: err.message || "Sync fehlgeschlagen.", isError: true });
    } finally {
      setIsSyncing(false);
    }
  }

  // Sleep breakdown helpers
  const totalSleepSec = (health.deepSleepSeconds || 0) + (health.lightSleepSeconds || 0) + (health.remSleepSeconds || 0) + (health.awakeSleepSeconds || 0) || 31440;
  const deepPct = Math.round(((health.deepSleepSeconds || 6000) / totalSleepSec) * 100);
  const remPct = Math.round(((health.remSleepSeconds || 6180) / totalSleepSec) * 100);
  const lightPct = Math.round(((health.lightSleepSeconds || 19260) / totalSleepSec) * 100);
  const awakePct = Math.max(1, 100 - deepPct - remPct - lightPct);

  // Training load tunnel calculation
  const acute = health.acuteTrainingLoad || 343;
  const minTunnel = health.minChronicLoad || 175;
  const maxTunnel = health.maxChronicLoad || 328;
  const isOptimalTunnel = acute >= minTunnel && acute <= maxTunnel;
  const isAboveTunnel = acute > maxTunnel;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-cyan-950/20 to-zinc-950">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                <Zap size={22} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-zinc-100 flex items-center gap-2">
                  <span>Garmin Analytics Hub</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Live Grafana Telemetrie
                  </span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Ganzheitliche Belastungs-, Erholungs- & Vitalwert-Analyse
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setHubOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all"
                title="Garmin Connect Konto verbinden"
              >
                <LogIn size={13} />
                <span className="hidden sm:inline">Konto / Login</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RefreshCw size={13} className={isSyncing ? "animate-spin text-cyan-400" : ""} />
                <span className="hidden sm:inline">Sync</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Sync message alert */}
          {syncMsg && (
            <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
              syncMsg.isError ? "bg-rose-500/15 border-rose-500/30 text-rose-300" : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
            }`}>
              <span>{syncMsg.text}</span>
              {syncMsg.isError && (
                <button
                  onClick={() => setHubOpen(true)}
                  className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 font-bold underline cursor-pointer"
                >
                  Jetzt einloggen →
                </button>
              )}
            </div>
          )}

        {/* Primary Metric Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:px-5 sm:py-3 bg-zinc-900/60 border-b border-zinc-800/80 shrink-0">
          <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Training Readiness</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-black font-mono text-cyan-400">{health.trainingReadiness}</span>
              <span className="text-xs text-zinc-500">/ 100</span>
            </div>
            <span className="text-[10px] text-zinc-400 block">{health.recoveryTimeHours}h Erholungszeit</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Body Battery</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-black font-mono text-emerald-400">{health.bodyBattery}%</span>
            </div>
            <span className="text-[10px] text-zinc-400 block">+{health.bodyBatteryCharged || 65} geladen</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">Ruhepuls & HRV</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black font-mono text-zinc-100">{health.restingHeartRate}</span>
              <span className="text-[10px] text-zinc-500">bpm</span>
              <span className="text-xs font-mono font-bold text-cyan-400 ml-1">{health.hrvLastNightMs}ms</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold block">Ausgeglichen</span>
          </div>

          <div className="p-2.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
            <span className="text-[10px] uppercase font-bold text-zinc-500 block">VO2 Max & Fitness</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-black font-mono text-purple-400">{health.vo2MaxRunning || 52.6}</span>
              <span className="text-[10px] text-zinc-500">ml/kg</span>
            </div>
            <span className="text-[10px] text-purple-300 font-semibold block">Fitness-Alter: {health.fitnessAge || 20} J.</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 px-3 pt-2 gap-1.5 overflow-x-auto shrink-0 bg-zinc-950/80">
          <button
            onClick={() => setActiveTab("load")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === "load"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Gauge size={14} />
            <span>Belastung & Fokus</span>
          </button>

          <button
            onClick={() => setActiveTab("sleep")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === "sleep"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Moon size={14} />
            <span>Schlaf & Erholung</span>
          </button>

          <button
            onClick={() => setActiveTab("battery")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === "battery"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BatteryCharging size={14} />
            <span>Body Battery & Stress</span>
          </button>

          <button
            onClick={() => setActiveTab("cardio")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === "cardio"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Heart size={14} />
            <span>Kardio & Vitalwerte</span>
          </button>

          <button
            onClick={() => setActiveTab("activities")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === "activities"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity size={14} />
            <span>Aktivitäten-Telemetrie</span>
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ── Tab 1: Training Load & Balance (Grafana Inspired) ─────────────── */}
          {activeTab === "load" && (
            <div className="space-y-4">
              {/* Acute vs Chronic Load Tunnel Card */}
              <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Gauge size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Akute Trainingsbelastung (Acute:Chronic Load)</h4>
                      <p className="text-xs text-zinc-400">7-Tage Akutlast vs. Optimaler Belastungstunnel</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {health.trainingStatus === "productive" ? "Aufbauend (Produktiv)" : "Optimal"}
                  </span>
                </div>

                {/* Tunnel Visualizer */}
                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-medium">Akute Last: <strong className="text-cyan-400 font-mono text-sm">{acute}</strong></span>
                    <span className="text-zinc-400">Optimaler Tunnel: <strong className="text-zinc-200 font-mono">{minTunnel} – {maxTunnel}</strong></span>
                    <span className="text-zinc-400">ACWR Ratio: <strong className="text-purple-400 font-mono">{health.acwrRatio || 1.5}</strong></span>
                  </div>

                  {/* Range Bar */}
                  <div className="h-4 w-full bg-zinc-900 rounded-full relative overflow-hidden flex items-center border border-zinc-800">
                    {/* Optimal Zone */}
                    <div
                      className="h-full bg-emerald-500/20 border-x border-emerald-500/40"
                      style={{
                        marginLeft: `${(minTunnel / 500) * 100}%`,
                        width: `${((maxTunnel - minTunnel) / 500) * 100}%`,
                      }}
                    />
                    {/* Acute Marker Pin */}
                    <div
                      className="absolute h-full w-2 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400/50"
                      style={{ left: `${Math.min(96, (acute / 500) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Deine akute 7-Tage Belastung liegt bei <strong>{acute}</strong> (Verhältnis 1.5). Du setzt wirksame Trainingsreize für kontinuierlichen Formaufbau.
                  </p>
                </div>
              </div>

              {/* 3-Bar Training Load Focus (Belastungsfokus) */}
              <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <BarChart3 size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Belastungsfokus & Verteilung</h4>
                      <p className="text-xs text-zinc-400">4-Wochen Verteilung nach Trainingszonen</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                    {health.trainingBalancePhrase === "AEROBIC_HIGH_SHORTAGE" ? "Hohe aerobe Last ausbauen" : "Ausgeglichen"}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Low Aerobic */}
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-400">🟢 Niedrig Aerob (Zone 2 / Grundlage)</span>
                      <span className="font-mono text-zinc-300">
                        {health.loadLowAerobic || 298} / Ziel {health.loadLowAerobicTargetMin || 203}–{health.loadLowAerobicTargetMax || 466}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full"
                        style={{ width: `${Math.min(100, ((health.loadLowAerobic || 298) / 466) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* High Aerobic */}
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-400">🟠 Hoch Aerob (Schwelle / Tempo)</span>
                      <span className="font-mono text-zinc-300">
                        {health.loadHighAerobic || 185} / Ziel {health.loadHighAerobicTargetMin || 278}–{health.loadHighAerobicTargetMax || 541}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${Math.min(100, ((health.loadHighAerobic || 185) / 541) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-amber-400/80">
                      Tipp: Plane diese Woche 1x Schwellenintervalle oder einen zügigen Tempolauf ein.
                    </p>
                  </div>

                  {/* Anaerobic */}
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-purple-400">🟣 Anaerob (Sprints / HIIT / Schwere Sätze)</span>
                      <span className="font-mono text-zinc-300">
                        {health.loadAnaerobic || 83} / Ziel {health.loadAnaerobicTargetMin || 0}–{health.loadAnaerobicTargetMax || 262}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-400 rounded-full"
                        style={{ width: `${Math.min(100, ((health.loadAnaerobic || 83) / 262) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: Sleep Architecture ────────────────────────────────────── */}
          {activeTab === "sleep" && (
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Moon size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Schlaf-Architektur & Qualität</h4>
                      <p className="text-xs text-zinc-400">Schlafdauer: {health.sleepDurationHours || 8.7} Stunden</p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-indigo-400">{health.sleepScore || 95}</span>
                    <span className="text-xs text-zinc-500">/ 100</span>
                  </div>
                </div>

                {/* Multi-color Sleep Bar */}
                <div className="space-y-2">
                  <div className="h-6 w-full rounded-2xl overflow-hidden flex gap-0.5 bg-zinc-950 p-1 border border-zinc-800">
                    <div style={{ width: `${deepPct}%` }} className="h-full bg-blue-600 rounded-l-xl" title={`Tiefschlaf ${deepPct}%`} />
                    <div style={{ width: `${remPct}%` }} className="h-full bg-purple-500" title={`REM-Schlaf ${remPct}%`} />
                    <div style={{ width: `${lightPct}%` }} className="h-full bg-cyan-400" title={`Leichtschlaf ${lightPct}%`} />
                    <div style={{ width: `${awakePct}%` }} className="h-full bg-zinc-700 rounded-r-xl" title={`Wach ${awakePct}%`} />
                  </div>

                  {/* Legend Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-blue-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <span>Tiefschlaf</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-zinc-100 block mt-0.5">
                        {Math.round(((health.deepSleepSeconds || 6000) / 3600) * 10) / 10}h ({deepPct}%)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-purple-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span>REM-Schlaf</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-zinc-100 block mt-0.5">
                        {Math.round(((health.remSleepSeconds || 6180) / 3600) * 10) / 10}h ({remPct}%)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>Leichtschlaf</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-zinc-100 block mt-0.5">
                        {Math.round(((health.lightSleepSeconds || 19260) / 3600) * 10) / 10}h ({lightPct}%)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-zinc-600" />
                        <span>Wachzeit</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-zinc-100 block mt-0.5">
                        {Math.round((health.awakeSleepSeconds || 180) / 60)} Min
                      </span>
                    </div>
                  </div>
                </div>

                {/* Overnight Vitals */}
                <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/80 text-center">
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">Nacht-HRV</span>
                    <span className="text-base font-black font-mono text-cyan-400">{health.hrvLastNightMs || 80} ms</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">Schlaf-Atmung</span>
                    <span className="text-base font-black font-mono text-emerald-400">{health.avgSleepRespiration || 13.0} /min</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold block">SpO2 Sauerstoff</span>
                    <span className="text-base font-black font-mono text-purple-400">{health.spO2AvgPct || 95.0}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 3: Body Battery & Stress ─────────────────────────────────── */}
          {activeTab === "battery" && (
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <BatteryCharging size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">Body Battery & Tages-Stress</h4>
                      <p className="text-xs text-zinc-400">Aktueller Energiestand: {health.bodyBattery}%</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
                    +{health.bodyBatteryCharged || 65} aufgeladen
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Durchschnittlicher Stress</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-mono text-cyan-400">{health.avgStressLevel || 15}</span>
                      <span className="text-xs text-zinc-500">/ 100</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold block">Sehr entspannt & erholt</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold">Maximaler Stress</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-mono text-amber-400">{health.maxStressLevel || 98}</span>
                      <span className="text-xs text-zinc-500">/ 100</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 block">Kurzer Trainingspeak</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 4: Cardio & Vitals ───────────────────────────────────────── */}
          {activeTab === "cardio" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Ruhepuls (RHR)</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-zinc-100">{health.restingHeartRate}</span>
                    <span className="text-xs text-zinc-500 font-bold">bpm</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 block">Min: {health.minHeartRate || 37} • Max: {health.maxHeartRate || 112}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Tages-Schritte</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-cyan-400">{health.steps || 3839}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 block">Ziel: {health.dailyStepGoal || 7170} Schritte</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Atemfrequenz Tag</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-purple-400">{health.avgWakingRespiration || 13.0}</span>
                    <span className="text-xs text-zinc-500 font-bold">/min</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 block">Nacht: {health.avgSleepRespiration || 13.0} /min</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 5: Real Activities Telemetry ─────────────────────────────── */}
          {activeTab === "activities" && (
            <div className="space-y-3">
              <p className="text-[11px] text-zinc-500 px-1">
                Aktivität antippen für volle Telemetrie: Messreihen-Grafe, GPS-Track, Runden, Zonen &amp; Kraft-Protokoll.
              </p>
              {garminActivities && garminActivities.length > 0 ? (
                garminActivities.slice(0, 8).map((act) => (
                  <button
                    key={act.id}
                    onClick={() => setDetailActivity(act)}
                    disabled={!act.garminId && !act.id.startsWith("garmin-")}
                    className={cn(
                      "w-full text-left p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 transition-all",
                      act.garminId || act.id.startsWith("garmin-")
                        ? "hover:border-cyan-500/40 cursor-pointer"
                        : "opacity-60 cursor-default"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          {act.type === "cycling" ? <Bike size={16} /> : <Activity size={16} />}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-zinc-100">{act.name}</h4>
                          <span className="text-[10px] text-zinc-400">{act.startTime?.split(" ")[0] || "Heute"}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {act.distanceMeters > 0 ? `${(act.distanceMeters / 1000).toFixed(1)} km` : `${Math.round(act.durationSeconds / 60)} Min`}
                      </span>
                    </div>

                    {/* Telemetry Metrics */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1 text-center">
                      {act.avgPowerWatts && (
                        <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          <span className="text-[9px] text-zinc-500 uppercase block">Power</span>
                          <span className="text-xs font-bold text-amber-400">{act.avgPowerWatts} W</span>
                        </div>
                      )}
                      {act.avgHeartRate && (
                        <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          <span className="text-[9px] text-zinc-500 uppercase block">Puls</span>
                          <span className="text-xs font-bold text-rose-400">{act.avgHeartRate} bpm</span>
                        </div>
                      )}
                      {act.elevationGainMeters && (
                        <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          <span className="text-[9px] text-zinc-500 uppercase block">Höhenmeter</span>
                          <span className="text-xs font-bold text-zinc-200">+{act.elevationGainMeters} m</span>
                        </div>
                      )}
                      {act.trainingEffectAerobic !== undefined && (
                        <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          <span className="text-[9px] text-zinc-500 uppercase block">Aerob TE</span>
                          <span className="text-xs font-bold text-emerald-400">{act.trainingEffectAerobic.toFixed(1)}</span>
                        </div>
                      )}
                      {act.caloriesBurned > 0 && (
                        <div className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                          <span className="text-[9px] text-zinc-500 uppercase block">Kalorien</span>
                          <span className="text-xs font-bold text-cyan-400">{act.caloriesBurned} kcal</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-xs text-zinc-500 text-center py-6">Keine Aktivitäten aufgezeichnet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    {hubOpen && <GarminHubModal isOpen={hubOpen} onClose={() => setHubOpen(false)} />}
    <GarminActivityDetailModal
      isOpen={detailActivity !== null}
      onClose={() => setDetailActivity(null)}
      activity={detailActivity}
    />
  </>
  );
}
