"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Minus,
  Droplets,
  Dumbbell,
  Percent,
  Plus,
  ChevronRight,
  Flame,
  Zap,
  Clock,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn, getLocalDateString } from "@/lib/utils";

const BodyCompositionModal = dynamic(() => import("@/components/body/BodyCompositionModal"), { ssr: false });

interface BodyCompositionCompactCardProps {
  className?: string;
}

function formatEntryDate(dateStr: string) {
  try {
    const d = new Date(dateStr.split("T")[0] + "T00:00:00");
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  } catch {
    return dateStr;
  }
}

function formatEntryTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

function computeWeightTrend(entries: Array<{ weight: number }>, days: number): number | null {
  if (entries.length < 2) return null;
  const recent = entries.slice(0, days);
  if (recent.length < 2) return null;
  const oldest = recent[recent.length - 1].weight;
  const newest = recent[0].weight;
  const weeks = days / 7;
  return Math.round((newest - oldest) / weeks * 10) / 10;
}

export default function BodyCompositionCompactCard({ className }: BodyCompositionCompactCardProps) {
  const { bodyWeightLog, addBodyWeight } = useApp();
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

  // Weight trend (14 days)
  const weightTrend14 = computeWeightTrend(bodyWeightLog, 14);
  const weightTrend30 = computeWeightTrend(bodyWeightLog, 30);

  // BMR calculation
  const bmr = latest?.bmrKcal || (latest ? Math.round(latest.weight * 24.2) : 0);

  // Reverse list for chart rendering (oldest to newest)
  const chartEntries = [...bodyWeightLog].reverse().slice(-14);
  const weights = chartEntries.map((e) => e.weight);
  const minWeight = weights.length > 0 ? Math.min(...weights) - 0.5 : 70;
  const maxWeight = weights.length > 0 ? Math.max(...weights) + 0.5 : 85;
  const weightRange = maxWeight - minWeight || 1;

  if (!latest) {
    return (
      <div className={cn("p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4", className)}>
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
            <Plus size={14} />
            <span>Messung hinzufügen</span>
          </button>
        </div>
        <BodyCompositionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      </div>
    );
  }

  return (
    <>
      <div className={cn("p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-xl space-y-4 cursor-pointer hover:border-zinc-700/50 transition-colors", className)} onClick={() => setModalOpen(true)}>
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
                {latest
                  ? `Letzte Messung: ${formatEntryDate(latest.date)}${formatEntryTime(latest.date) ? ` um ${formatEntryTime(latest.date)} Uhr` : ""} (${latest.source || "Waage"})`
                  : "Noch keine Messung vorhanden"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 inline-flex items-center gap-1">
              <Clock size={10} />
              {formatEntryDate(latest.date)} {formatEntryTime(latest.date) ? `• ${formatEntryTime(latest.date)} Uhr` : ""}
            </span>
            <ChevronRight size={16} className="text-zinc-500" />
          </div>
        </div>

        {/* Primary Metrics Grid - 2x2 */}
        <div className="grid grid-cols-2 gap-3">
          {/* Weight */}
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[10px] uppercase font-bold tracking-wider">Gewicht</span>
              {weightDelta !== null && (
                <span
                  className={cn(
                    "text-[10px] font-bold flex items-center gap-0.5",
                    weightDelta < 0 ? "text-emerald-400" : weightDelta > 0 ? "text-amber-400" : "text-zinc-500"
                  )}
                >
                  {weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-zinc-100">{latest.weight}</span>
              <span className="text-xs text-zinc-500 font-bold">kg</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-500">BMI: {latest.bmi || (latest.weight / Math.pow(latest.weight > 100 ? latest.weight / 100 : 1.8, 2)).toFixed(1)}</span>
              {weightTrend14 !== null && (
                <span className={cn("font-bold flex items-center gap-0.5", weightTrend14 < 0 ? "text-emerald-400" : "text-amber-400")}>
                  {weightTrend14 > 0 ? "+" : ""}{weightTrend14} kg/Wo (14T)
                </span>
              )}
            </div>
          </div>

          {/* Body Fat % */}
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[10px] uppercase font-bold tracking-wider">Körperfett</span>
              {fatDelta !== null && (
                <span
                  className={cn(
                    "text-[10px] font-bold flex items-center gap-0.5",
                    fatDelta < 0 ? "text-emerald-400" : "text-rose-400"
                  )}
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
                  className={cn(
                    "text-[10px] font-bold flex items-center gap-0.5",
                    muscleDelta > 0 ? "text-emerald-400" : "text-zinc-500"
                  )}
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

          {/* BMR / Calories */}
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[10px] uppercase font-bold tracking-wider">BMR / Kalorien</span>
              <span className="text-[10px] font-bold text-zinc-400">Viszeral {latest.visceralFat || 4}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {latest.bmrKcal || bmr}
              </span>
              <span className="text-xs text-emerald-500/80 font-bold">kcal</span>
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              Wasser: {latest.waterPct || "--"}% • Protein: {latest.proteinPct || "--"}%
            </span>
          </div>
        </div>

        {/* Mini SVG Trend Line */}
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

        {/* Quick Action Hint */}
        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          <span>Klicken für Details, Verlauf & Bluetooth/Import</span>
          <ChevronRight size={14} className="text-zinc-500" />
        </div>
      </div>

      <BodyCompositionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}