"use client";

import { useEffect, useState } from "react";
import {
  X,
  Zap,
  Flame,
  Dumbbell,
  Heart,
  AlertTriangle,
  Sparkles,
  Calculator,
  Droplet,
  Bike,
  Footprints,
  Activity,
  ShieldAlert,
  Award,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  calculateFuelingPlan,
  FuelingSportType,
  FuelingPlan,
} from "@/lib/calculator/fuelingCalculator";
import {
  calculateOneRepMax,
  calculateHybridScore,
  OneRepMaxResult,
  HybridScoreResult,
} from "@/lib/calculator/strengthCalculator";
import {
  calculateKarvonenHrZones,
  calculateCogganPowerZones,
} from "@/lib/calculator/zonesCalculator";
import { computeAcwrSentinel } from "@/lib/calculator/acwrCalculator";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import {
  getFitnessProfile,
  saveFitnessProfile,
} from "@/lib/workout/targetEngine";
import { getLocalDateString } from "@/lib/utils";

interface ToolsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "fueling" | "strength" | "zones" | "acwr";
}

export default function ToolsHubModal({
  isOpen,
  onClose,
  initialTab = "fueling",
}: ToolsHubModalProps) {
  const { garminHealthLogs, garminActivities, bodyWeightLog } = useApp();

  const [activeTab, setActiveTab] = useState<"fueling" | "strength" | "zones" | "acwr">(initialTab);

  // Body weight from logs or default
  const latestWeight = bodyWeightLog.length > 0 ? bodyWeightLog[0].weight : 75;

  // ── Fueling State ──
  const [sportType, setSportType] = useState<FuelingSportType>("cycling_intervals");
  const [durationMins, setDurationMins] = useState(90);
  const [temperature, setTemperature] = useState(22);

  // ── Strength / 1RM State ──
  const initialProfile = getFitnessProfile();
  const [strengthWeight, setStrengthWeight] = useState(100);
  const [strengthReps, setStrengthReps] = useState(5);
  const [squat1Rm, setSquat1Rm] = useState(140);
  const [bench1Rm, setBench1Rm] = useState(110);
  const [deadlift1Rm, setDeadlift1Rm] = useState(180);
  const [ftpWatts, setFtpWatts] = useState(initialProfile.ftpWatts);
  const [run5kMins, setRun5kMins] = useState(22);

  // ── Zones State ──
  const [restingHr, setRestingHr] = useState(initialProfile.restingHr);
  const [maxHr, setMaxHr] = useState(initialProfile.maxHr);

  useEffect(() => {
    saveFitnessProfile({ ftpWatts, restingHr, maxHr });
  }, [ftpWatts, restingHr, maxHr]);

  if (!isOpen) return null;

  const todayStr = getLocalDateString();
  const garmin = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);

  // Computed results
  const fuelingPlan = calculateFuelingPlan({
    sportType,
    durationMinutes: durationMins,
    bodyWeightKg: latestWeight,
    temperatureCelsius: temperature,
  });

  const oneRmResult = calculateOneRepMax(strengthWeight, strengthReps);
  const hybridScoreResult = calculateHybridScore(
    latestWeight,
    squat1Rm,
    bench1Rm,
    deadlift1Rm,
    ftpWatts,
    run5kMins
  );

  const hrZones = calculateKarvonenHrZones(restingHr, maxHr);
  const powerZones = calculateCogganPowerZones(ftpWatts);
  const acwrReport = computeAcwrSentinel(garmin, garminActivities);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Calculator size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Pro Performance Hub & Rechner</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Hybrid OS
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Wissenschaftliche Rechner für Fueling, 1RM, Leistungs-Zonen & ACWR
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 px-3 sm:px-4 pt-2 gap-1.5 sm:gap-2 overflow-x-auto shrink-0 bg-zinc-950/60 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("fueling")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "fueling"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Zap size={14} />
            <span>Fueling & Carbs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("strength")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "strength"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Dumbbell size={14} />
            <span>1RM & Hybrid Index</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("zones")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "zones"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Heart size={14} />
            <span>HF & Power Zonen</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("acwr")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
              activeTab === "acwr"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShieldAlert size={14} />
            <span>ACWR & Verletzungsrisiko</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* ── TAB 1: Fueling & Carbs Calculator ──────────────────────────── */}
          {activeTab === "fueling" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Sportart & Intensität</label>
                  <select
                    value={sportType}
                    onChange={(e) => setSportType(e.target.value as FuelingSportType)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="cycling_intervals">🚴‍♂️ Rad: Intervalle / Schwellentraining</option>
                    <option value="cycling_z2">🚴‍♂️ Rad: Zone 2 Grundlagenausdauer</option>
                    <option value="running_tempo">🏃 Laufen: Schwellen- & Intervalllauf</option>
                    <option value="running_z2">🏃 Laufen: Zone 2 Long Run</option>
                    <option value="gym_hypertrophy">🏋️ Gym: Hypertrophie / Volumen</option>
                    <option value="gym_strength">🏋️ Gym: Schwere Kraft / Maxkraft</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">
                    Dauer: <span className="text-amber-400 font-mono">{durationMins} Min</span>
                  </label>
                  <input
                    type="range"
                    min="30"
                    max="240"
                    step="15"
                    value={durationMins}
                    onChange={(e) => setDurationMins(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">
                    Temperatur: <span className="text-cyan-400 font-mono">{temperature}°C</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="35"
                    step="1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Fueling Results Dashboard */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400/90 block">
                    Carbs / Stunde
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                    {fuelingPlan.carbsPerHourGrams}g
                  </span>
                  <span className="text-[10px] text-zinc-400 block mt-0.5">
                    Gesamt: {fuelingPlan.totalCarbsGrams}g
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400/90 block">
                    Flüssigkeit / h
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-cyan-300">
                    {fuelingPlan.fluidPerHourMl}ml
                  </span>
                  <span className="text-[10px] text-zinc-400 block mt-0.5">
                    Gesamt: {(fuelingPlan.totalFluidMl / 1000).toFixed(1)}L
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400/90 block">
                    Natrium / h
                  </span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300">
                    {fuelingPlan.sodiumPerHourMg}mg
                  </span>
                  <span className="text-[10px] text-zinc-400 block mt-0.5">
                    Gesamt: {fuelingPlan.totalSodiumMg}mg
                  </span>
                </div>
              </div>

              {/* Timing Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                  Pre-, Intra- & Post-Workout Timing
                </h4>

                <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-zinc-800 font-mono font-bold text-amber-300 text-[10px] shrink-0">
                      3h vorher
                    </span>
                    <span className="text-zinc-300">{fuelingPlan.preWorkoutFueling.timing3h}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-zinc-800 font-mono font-bold text-amber-300 text-[10px] shrink-0">
                      30m vorher
                    </span>
                    <span className="text-zinc-300">{fuelingPlan.preWorkoutFueling.timing30m}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-1.5 text-xs">
                  <span className="font-bold text-emerald-300 block">Post-Workout Recovery (3:1 Formel):</span>
                  <p className="text-zinc-300">{fuelingPlan.postWorkoutRecovery.summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: 1RM & Hybrid Power-to-Weight ────────────────────────── */}
          {activeTab === "strength" && (
            <div className="space-y-6">
              {/* 1RM Calculator */}
              <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">1RM Maximalgewicht-Rechner</h3>
                    <p className="text-xs text-zinc-400">Präzise Berechnung nach Epley-, Brzycki- & Lander-Formeln</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Geschätztes 1RM</span>
                    <span className="text-2xl font-black font-mono text-cyan-400">{oneRmResult.average} kg</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">
                      Gewicht: <span className="text-cyan-400 font-mono">{strengthWeight} kg</span>
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="250"
                      step="2.5"
                      value={strengthWeight}
                      onChange={(e) => setStrengthWeight(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-400 block mb-1">
                      Wiederholungen: <span className="text-cyan-400 font-mono">{strengthReps} Reps</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="1"
                      value={strengthReps}
                      onChange={(e) => setStrengthReps(parseInt(e.target.value, 10))}
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>

                {/* Percentage Table */}
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 pt-1 text-center">
                  {oneRmResult.percentageTable.map((p) => (
                    <div key={p.percentage} className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 font-bold block">{p.percentage}%</span>
                      <span className="text-xs font-bold font-mono text-zinc-100">{p.weightKg}k</span>
                      <span className="text-[9px] text-zinc-400 block mt-0.5">~{p.typicalReps} Wdh</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hybrid Athlete Overall Score */}
              <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-purple-950/20 via-zinc-900 to-zinc-900 border border-purple-500/30 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 block">
                      {hybridScoreResult.hybridTier}
                    </span>
                    <h3 className="text-sm font-bold text-zinc-100">Hybrid Power-to-Weight Index</h3>
                  </div>
                  <div className="px-3 py-1.5 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-center">
                    <span className="text-lg font-black font-mono text-purple-300">
                      {hybridScoreResult.hybridScore} / 100
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-zinc-500 block">Kniebeuge 1RM</label>
                    <input
                      type="number"
                      value={squat1Rm}
                      onChange={(e) => setSquat1Rm(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 block">Bankdrücken 1RM</label>
                    <input
                      type="number"
                      value={bench1Rm}
                      onChange={(e) => setBench1Rm(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 block">Kreuzheben 1RM</label>
                    <input
                      type="number"
                      value={deadlift1Rm}
                      onChange={(e) => setDeadlift1Rm(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 block">Cycling FTP (Watt)</label>
                    <input
                      type="number"
                      value={ftpWatts}
                      onChange={(e) => setFtpWatts(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 block">5k Laufzeit (Min)</label>
                    <input
                      type="number"
                      value={run5kMins}
                      onChange={(e) => setRun5kMins(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/80">
                  {hybridScoreResult.summary}
                </p>
              </div>
            </div>
          )}

          {/* ── TAB 3: HF & Power Zones ────────────────────────────────────── */}
          {activeTab === "zones" && (
            <div className="space-y-6">
              {/* Inputs */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Ruhepuls (BPM)</label>
                  <input
                    type="number"
                    value={restingHr}
                    onChange={(e) => setRestingHr(parseInt(e.target.value, 10) || 42)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Maximalpuls (BPM)</label>
                  <input
                    type="number"
                    value={maxHr}
                    onChange={(e) => setMaxHr(parseInt(e.target.value, 10) || 190)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 block mb-1">Cycling FTP (Watt)</label>
                  <input
                    type="number"
                    value={ftpWatts}
                    onChange={(e) => setFtpWatts(parseInt(e.target.value, 10) || 260)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Karvonen HR Zones */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Herzfrequenz-Zonen (Karvonen HRR Formel)
                </span>
                <div className="space-y-1.5">
                  {hrZones.map((z) => (
                    <div
                      key={z.zone}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${z.color}`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold block">{z.name}</span>
                        <span className="text-[11px] text-zinc-400 truncate block">{z.purpose}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black font-mono block">
                          {z.minBpm} – {z.maxBpm} bpm
                        </span>
                        <span className="text-[10px] text-zinc-400 block">{z.pctRange}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coggan Power Zones */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Radsport Power-Zonen (Coggan FTP: {ftpWatts}W)
                </span>
                <div className="space-y-1.5">
                  {powerZones.map((z) => (
                    <div
                      key={z.zone}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${z.color}`}
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold block">{z.name}</span>
                        <span className="text-[11px] text-zinc-400 truncate block">{z.purpose}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black font-mono block">
                          {z.minWatts} – {z.maxWatts} W
                        </span>
                        <span className="text-[10px] text-zinc-400 block">{z.pctRange}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 4: ACWR & Injury Risk Sentinel ─────────────────────────── */}
          {activeTab === "acwr" && (
            <div className="space-y-5">
              <div className={`p-4 sm:p-5 rounded-3xl border ${acwrReport.riskColor} space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert size={20} />
                    <span className="font-bold text-sm">{acwrReport.riskBadge}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">ACWR Score</span>
                    <span className="text-2xl font-black font-mono">{acwrReport.acwrRatio}</span>
                  </div>
                </div>

                <p className="text-xs text-zinc-200 leading-relaxed">
                  {acwrReport.riskExplanation}
                </p>
              </div>

              {/* Acute vs Chronic Load Bars */}
              <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Belastungsverhältnis (Akut vs. Chronisch)
                </span>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Akute Belastung (7 Tage)</span>
                    <span className="text-xl font-mono font-black text-amber-400">{acwrReport.acuteLoad}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Chronische Basis (28 Tage)</span>
                    <span className="text-xl font-mono font-black text-cyan-400">{acwrReport.chronicLoad}</span>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 block">
                  Empfohlene Trainings- & Schutzmaßnahmen:
                </span>
                <div className="space-y-1.5">
                  {acwrReport.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-300">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
