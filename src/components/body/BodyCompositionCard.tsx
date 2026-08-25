"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Scale,
  Bluetooth,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  Activity,
  Droplets,
  Dumbbell,
  Percent,
  Plus,
  ChevronRight,
  Flame,
  Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

const BodyCompositionModal = dynamic(() => import("./BodyCompositionModal"), { ssr: false });

export default function BodyCompositionCard() {
  const { bodyWeightLog } = useApp();
  const [modalOpen, setModalOpen] = useState(false);

  // Latest entry
  const latest = bodyWeightLog.length > 0 ? bodyWeightLog[0] : null;
  const previous = bodyWeightLog.length > 1 ? bodyWeightLog[1] : null;

  // Weight delta
  const weightDelta =
    latest && previous
      ? Math.round((latest.weight - previous.weight) * 10) / 10
      : null;

  // Body Fat delta
  const fatDelta =
    latest?.bodyFatPct && previous?.bodyFatPct
      ? Math.round((latest.bodyFatPct - previous.bodyFatPct) * 10) / 10
      : null;

  // Muscle mass delta
  const muscleDelta =
    latest?.muscleMassKg && previous?.muscleMassKg
      ? Math.round((latest.muscleMassKg - previous.muscleMassKg) * 10) / 10
      : null;

  // Format date helper
  function formatEntryDate(dateStr: string) {
    try {
      const d = new Date(dateStr.split("T")[0] + "T00:00:00");
      return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    } catch {
      return dateStr;
    }
  }

  // Reverse list for chart rendering (oldest to newest)
  const chartEntries = [...bodyWeightLog].reverse().slice(-14);

  // Determine min/max for simple SVG trend line
  const weights = chartEntries.map((e) => e.weight);
  const minWeight = weights.length > 0 ? Math.min(...weights) - 0.5 : 70;
  const maxWeight = weights.length > 0 ? Math.max(...weights) + 0.5 : 85;
  const weightRange = maxWeight - minWeight || 1;

  return (
    <>
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Scale size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                <span>Körperanalyse & Gewicht</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Insmart / Fitdays
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                {latest ? `Letzte Messung: ${formatEntryDate(latest.date)} (${latest.source || "Waage"})` : "Noch keine Messung vorhanden"}
              </p>
            </div>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 text-xs font-bold transition-all shadow-xs"
          >
            <Bluetooth size={13} />
            <span>Wiegen / Import</span>
          </button>
        </div>

        {/* Primary Metrics Grid */}
        {latest ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Weight */}
              <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-[10px] uppercase font-bold tracking-wider">Gewicht</span>
                  {weightDelta !== null && (
                    <span
                      className={`text-[10px] font-bold flex items-center gap-0.5 ${
                        weightDelta < 0 ? "text-emerald-400" : weightDelta > 0 ? "text-amber-400" : "text-zinc-500"
                      }`}
                    >
                      {weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono text-zinc-100">{latest.weight}</span>
                  <span className="text-xs text-zinc-500 font-bold">kg</span>
                </div>
                <span className="text-[10px] text-zinc-500 block">BMI: {latest.bmi || (latest.weight / 3.24).toFixed(1)}</span>
              </div>

            {/* Body Fat % */}
            <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-[10px] uppercase font-bold tracking-wider">Körperfett</span>
                {fatDelta !== null && (
                  <span
                    className={`text-[10px] font-bold flex items-center gap-0.5 ${
                      fatDelta < 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {fatDelta > 0 ? `+${fatDelta}` : fatDelta}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-blue-400">
                  {latest.bodyFatPct || "--"}
                </span>
                <span className="text-xs text-blue-500/80 font-bold">%</span>
              </div>
              <span className="text-[10px] text-emerald-400/80 font-semibold block">
                {latest.bodyFatPct ? (latest.bodyFatPct < 15 ? "Athletisch" : "Fitness-Level") : "BIA Messung"}
              </span>
            </div>

            {/* Muscle Mass */}
            <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-[10px] uppercase font-bold tracking-wider">Muskelmasse</span>
                {muscleDelta !== null && (
                  <span
                    className={`text-[10px] font-bold flex items-center gap-0.5 ${
                      muscleDelta > 0 ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  >
                    {muscleDelta > 0 ? `+${muscleDelta}` : muscleDelta} kg
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-purple-400">
                  {latest.muscleMassKg || "--"}
                </span>
                <span className="text-xs text-purple-500/80 font-bold">kg</span>
              </div>
              <span className="text-[10px] text-zinc-500 block">
                {latest.muscleMassPct ? `${latest.muscleMassPct}% Anteil` : "Skelettmuskel"}
              </span>
            </div>

            {/* Body Water & Visceral */}
            <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-[10px] uppercase font-bold tracking-wider">Wasser</span>
                <span className="text-[10px] font-bold text-zinc-400">Viszeral {latest.visceralFat || 4}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {latest.waterPct || "--"}
                </span>
                <span className="text-xs text-emerald-500/80 font-bold">%</span>
              </div>
              <span className="text-[10px] text-zinc-500 block truncate">
                BMR: {latest.bmrKcal || 1980} kcal
              </span>
            </div>
          </div>

          {/* Secondary Metrics Grid (volle BIA-Analyse) */}
          {(latest.skeletalMusclePct || latest.proteinPct || latest.fatMassKg || latest.boneMassKg) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-2xl bg-zinc-950/50 border border-zinc-800/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Skelettmuskulatur</span>
                <span className="text-sm font-bold font-mono text-purple-300">
                  {latest.skeletalMusclePct ?? "--"}<span className="text-[10px] text-purple-500/80 ml-0.5">%</span>
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-zinc-950/50 border border-zinc-800/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Protein</span>
                <span className="text-sm font-bold font-mono text-amber-300">
                  {latest.proteinPct ?? "--"}<span className="text-[10px] text-amber-500/80 ml-0.5">%</span>
                  {latest.proteinKg != null && (
                    <span className="text-[10px] text-zinc-500 ml-1">{latest.proteinKg} kg</span>
                  )}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-zinc-950/50 border border-zinc-800/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Fettmasse</span>
                <span className="text-sm font-bold font-mono text-rose-300">
                  {latest.fatMassKg ?? "--"}<span className="text-[10px] text-rose-500/80 ml-0.5">kg</span>
                  {latest.fatFreeMassKg != null && (
                    <span className="text-[10px] text-zinc-500 ml-1">FFM {latest.fatFreeMassKg}</span>
                  )}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-zinc-950/50 border border-zinc-800/60 space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Knochen</span>
                <span className="text-sm font-bold font-mono text-sky-300">
                  {latest.boneMassKg ?? "--"}<span className="text-[10px] text-sky-500/80 ml-0.5">kg</span>
                  {latest.waterKg != null && (
                    <span className="text-[10px] text-zinc-500 ml-1">{latest.waterKg} L Wasser</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Mess-Metadaten */}
          <div className="flex items-center flex-wrap gap-1.5">
            {latest.athlete && (
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Sportler-Modus
              </span>
            )}
            {latest.impedanceOhm != null && (
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                Impedanz {latest.impedanceOhm} Ω
              </span>
            )}
            {latest.weightSource === "live-fallback" && (
              <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                Live-Fallback
              </span>
            )}
          </div>
          </>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-center space-y-2">
            <Scale size={28} className="mx-auto text-zinc-600" />
            <p className="text-xs font-semibold text-zinc-300">
              Noch keine Körperanalysedaten aufgezeichnet
            </p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
              Verbinde deine Insmart-Waage per Bluetooth oder importiere deinen Fitdays-Export, um Körperfett, Muskelmasse und Gewicht automatisch zu verfolgen.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all"
            >
              <Bluetooth size={14} />
              <span>Insmart Waage verbinden</span>
            </button>
          </div>
        )}

        {/* Mini SVG Trend Line if entries exist */}
        {chartEntries.length >= 2 && (
          <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Gewichtsverlauf (letzte {chartEntries.length} Messungen)</span>
              <span className="font-mono text-zinc-400">
                Min {minWeight.toFixed(1)}kg • Max {maxWeight.toFixed(1)}kg
              </span>
            </div>

            <div className="h-14 w-full relative flex items-end">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 40">
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={chartEntries
                    .map((e, idx) => {
                      const x = (idx / (chartEntries.length - 1)) * 100;
                      const y = 35 - ((e.weight - minWeight) / weightRange) * 30;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      <BodyCompositionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
