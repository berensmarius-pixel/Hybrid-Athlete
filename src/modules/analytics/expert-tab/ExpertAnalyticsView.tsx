"use client";

/**
 * Expert Analytics & Performance Lab – integriertes Lab-Dashboard.
 *
 * High-Density 2-Spalten-Grid im Dark-Glassmorphism-Stil mit den vier
 * Kern-Visualisierungen (PDC, PMC, Aerobic Efficiency, Zone Distribution).
 * Datenbasis: Garmin-Aktivitäten, Körpergewicht und Fitness-Profil (FTP).
 */

import { useMemo, useState } from "react";
import { Microscope } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getFitnessProfile } from "@/lib/workout/targetEngine";
import { computeTrainingLoadFromActivities } from "@/lib/training/trainingLoad";

import PowerDurationCurve from "./PowerDurationCurve";
import PerformanceManagementChart from "./PerformanceManagementChart";
import AerobicEfficiencyChart from "./AerobicEfficiencyChart";
import ZoneDistributionChart from "./ZoneDistributionChart";

/** Neuestes Gewicht aus der Körper-Messreihe (kg). */
function latestWeightKg(
  log: Array<{ date: string; weight: number }>
): number | null {
  if (!Array.isArray(log) || log.length === 0) return null;
  const sorted = [...log].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const w = sorted[0]?.weight;
  return typeof w === "number" && w > 0 ? w : null;
}

export default function ExpertAnalyticsView() {
  const { garminActivities, bodyWeightLog } = useApp();

  // FTP aus dem lokalen Fitness-Profil (wird in ToolsHub gepflegt).
  // Die View wird ausschließlich client-seitig geladen (dynamic, ssr:false),
  // daher ist der localStorage-Zugriff im Lazy-Initializer sicher.
  const [ftpWatts] = useState(() =>
    typeof window === "undefined" ? 260 : getFitnessProfile().ftpWatts
  );

  const weightKg = useMemo(() => latestWeightKg(bodyWeightLog), [bodyWeightLog]);

  // Snapshot-Chips für den Header
  const snapshot = useMemo(
    () => computeTrainingLoadFromActivities(garminActivities).snapshot,
    [garminActivities]
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 border-b border-white/5 bg-zinc-950/80 backdrop-blur-2xl sticky top-0 z-10 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2 font-mono">
              <span>EXPERT ANALYTICS &amp; PERFORMANCE LAB</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 font-bold">
                LAB
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
              Power Duration Curve · Formkurve · Aerobic Efficiency · Intensitätsverteilung
            </p>
          </div>

          {/* Quick-Metrics */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <MetricChip label="FTP" value={`${ftpWatts} W`} tone="cyan" />
            {weightKg !== null && (
              <MetricChip label="Gewicht" value={`${weightKg.toFixed(1)} kg`} tone="zinc" />
            )}
            {snapshot && (
              <>
                <MetricChip label="CTL" value={snapshot.ctl.toFixed(0)} tone="blue" />
                <MetricChip label="ATL" value={snapshot.atl.toFixed(0)} tone="pink" />
                <MetricChip
                  label="TSB"
                  value={`${snapshot.tsb > 0 ? "+" : ""}${snapshot.tsb.toFixed(0)}`}
                  tone={
                    snapshot.status === "overreaching"
                      ? "red"
                      : snapshot.status === "fatigued"
                        ? "blue"
                        : snapshot.status === "fresh"
                          ? "green"
                          : "zinc"
                  }
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── 2-Spalten-Lab-Grid (high density) ──────────────────────────────── */}
      <div className="flex-1 px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 sm:gap-4 max-w-[1600px] mx-auto">
          <PowerDurationCurve
            activities={garminActivities}
            weightKg={weightKg}
            ftpWatts={ftpWatts}
          />
          <PerformanceManagementChart activities={garminActivities} />
          <AerobicEfficiencyChart
            activities={garminActivities}
            ftpWatts={ftpWatts}
          />
          <ZoneDistributionChart activities={garminActivities} />
        </div>

        <p className="max-w-[1600px] mx-auto mt-4 mb-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Microscope size={11} className="shrink-0" />
          MMP-Kurven werden aus Aktivitäts-Summaries + persistierten Benchmarks per
          Critical-Power-Modell interpoliert; Decoupling-Werte kommen direkt aus der
          Garmin-Telemetrie.
        </p>
      </div>
    </div>
  );
}

const CHIP_TONES = {
  cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
  blue: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  pink: "bg-pink-500/10 text-pink-300 border-pink-500/25",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  red: "bg-red-500/10 text-red-300 border-red-500/25",
  zinc: "bg-white/[0.04] text-zinc-300 border-white/10",
} as const;

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof CHIP_TONES;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-2 py-1 rounded-xl border font-mono ${CHIP_TONES[tone]}`}
    >
      <span className="text-[8px] uppercase tracking-wider font-bold opacity-70">
        {label}
      </span>
      <span className="text-xs font-black">{value}</span>
    </span>
  );
}
