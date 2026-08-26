"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  Minus,
  Plus,
  Droplet,
  Dumbbell,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NutrientStatus } from "@/lib/nutrition/micro-calculator";
import {
  averageMicronutrientScore,
  calculateDailyMicroStatus,
  evaluateBiomarkers,
  estimateSweatLossFromBurn,
} from "@/lib/nutrition/micro-calculator";
import { useApp } from "@/context/AppContext";
import { useBiomarkers, useMicronutrientProfile } from "./useMicronutrientModule";
import MicronutrientRadar from "./MicronutrientRadar";

const BiomarkerModal = dynamic(() => import("./BiomarkerModal"), { ssr: false });

interface MicronutrientPanelProps {
  selectedDate: string;
}

const LEVEL_TEXT = {
  optimal: "text-emerald-400",
  warning: "text-amber-400",
  critical: "text-rose-400",
} as const;

const LEVEL_BADGE = {
  optimal: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  warning: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  critical: "bg-rose-500/15 border-rose-500/30 text-rose-300",
} as const;

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export default function MicronutrientPanel({ selectedDate }: MicronutrientPanelProps) {
  const { nutritionLogs, garminHealthLogs } = useApp();
  const { profile, updateProfile } = useMicronutrientProfile();
  const { latestBiomarker } = useBiomarkers();
  const [isBiomarkerModalOpen, setIsBiomarkerModalOpen] = useState(false);

  const dayLog = nutritionLogs.find((l) => l.date === selectedDate);
  const entries = useMemo(() => dayLog?.entries ?? [], [dayLog]);

  const statuses: NutrientStatus[] = useMemo(
    () => calculateDailyMicroStatus(entries, profile),
    [entries, profile]
  );

  const avgScore = averageMicronutrientScore(statuses);
  const hasEntries = entries.length > 0;

  const biomarkerFlags = useMemo(() => evaluateBiomarkers(latestBiomarker), [latestBiomarker]);

  const applyGarminSweatEstimate = () => {
    const burn = garminHealthLogs[selectedDate]?.activeCaloriesBurned || 0;
    updateProfile({ sweatLossLPerDay: estimateSweatLossFromBurn(burn) });
  };

  const setSweat = (delta: number) =>
    updateProfile({
      sweatLossLPerDay: Math.min(4, Math.max(0.3, Math.round((profile.sweatLossLPerDay + delta) * 10) / 10)),
    });
  const setHours = (delta: number) =>
    updateProfile({
      trainingHoursPerWeek: Math.min(25, Math.max(0, profile.trainingHoursPerWeek + delta)),
    });

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-4 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
              <span>Mikronährstoff-Radar</span>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-bold font-mono border",
                  LEVEL_BADGE[avgScore >= 75 ? "optimal" : avgScore >= 40 ? "warning" : "critical"]
                )}
              >
                Ø {avgScore}%
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Athleten-RDA vs. Tages-Log · {formatDateShort(selectedDate)}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsBiomarkerModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
        >
          <Droplet size={13} />
          <span>Blutwerte loggen</span>
        </button>
      </div>

      {/* Athletic profile steppers */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/70">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold w-full sm:w-auto">
          Athleten-Profil
        </span>

        <div className="flex items-center gap-1.5 ml-auto">
          <Droplet size={12} className="text-cyan-400 shrink-0" />
          <button
            onClick={() => setSweat(-0.1)}
            className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer active:scale-90"
            aria-label="Schweißverlust verringern"
          >
            <Minus size={11} />
          </button>
          <span className="text-[11px] font-mono font-bold text-zinc-200 min-w-[72px] text-center tabular-nums">
            {profile.sweatLossLPerDay.toFixed(1)} L/Tag
          </span>
          <button
            onClick={() => setSweat(0.1)}
            className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer active:scale-90"
            aria-label="Schweißverlust erhöhen"
          >
            <Plus size={11} />
          </button>
          <button
            onClick={applyGarminSweatEstimate}
            title="Aus Garmin Aktiv-Verbrauch schätzen"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-cyan-300 hover:bg-cyan-500/10 cursor-pointer active:scale-90"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:ml-3">
          <Dumbbell size={12} className="text-orange-400 shrink-0" />
          <button
            onClick={() => setHours(-1)}
            className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer active:scale-90"
            aria-label="Trainingsvolumen verringern"
          >
            <Minus size={11} />
          </button>
          <span className="text-[11px] font-mono font-bold text-zinc-200 min-w-[68px] text-center tabular-nums">
            {profile.trainingHoursPerWeek} h/Woche
          </span>
          <button
            onClick={() => setHours(1)}
            className="p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer active:scale-90"
            aria-label="Trainingsvolumen erhöhen"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {/* Radar + Health Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <div className="pt-1">
          {hasEntries ? (
            <MicronutrientRadar statuses={statuses} />
          ) : (
            <div className="py-8 text-center space-y-1">
              <Activity size={28} className="mx-auto text-zinc-700" />
              <p className="text-[11px] text-zinc-500">
                Noch keine Einträge an diesem Tag –
                <br />
                logge Lebensmittel, um dein Radar zu füllen.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          {statuses.map((s) => (
            <div
              key={s.key}
              className={cn(
                "p-2.5 rounded-xl border transition-colors",
                s.level === "optimal"
                  ? "bg-emerald-500/5 border-emerald-500/15"
                  : s.level === "warning"
                    ? "bg-amber-500/5 border-amber-500/20"
                    : "bg-rose-500/5 border-rose-500/20"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <span aria-hidden>{s.emoji}</span>
                  <span>{s.label}</span>
                </span>
                <span className={cn("text-xs font-black font-mono", LEVEL_TEXT[s.level])}>
                  {s.percent}%
                  <span className="ml-1.5 text-[9px] font-medium text-zinc-500">
                    {s.amount}/{s.target} {s.unit}
                  </span>
                </span>
              </div>
              {s.recommendation && (
                <p className="mt-1 pl-6 text-[10px] leading-snug text-zinc-400">
                  {s.recommendation}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Latest blood markers */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/60">
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
            Letzte Blutwerte
            {latestBiomarker ? ` · ${formatDateShort(latestBiomarker.date)}` : ""}
          </span>
          {latestBiomarker && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {latestBiomarker.ferritinNgMl !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-zinc-950 border border-zinc-800 text-zinc-300">
                  Ferritin {latestBiomarker.ferritinNgMl}
                </span>
              )}
              {latestBiomarker.vitaminDNgMl !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-zinc-950 border border-zinc-800 text-zinc-300">
                  Vit-D {latestBiomarker.vitaminDNgMl}
                </span>
              )}
              {latestBiomarker.testosteroneNgDl !== undefined && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-zinc-950 border border-zinc-800 text-zinc-300">
                  Testo {latestBiomarker.testosteroneNgDl}
                </span>
              )}
            </div>
          )}
          {!latestBiomarker && (
            <button
              onClick={() => setIsBiomarkerModalOpen(true)}
              className="text-[10px] text-zinc-500 hover:text-rose-300 underline underline-offset-2 decoration-dotted cursor-pointer"
            >
              Noch keine Werte – jetzt eintragen
            </button>
          )}
        </div>

        {biomarkerFlags.map((flag, i) => (
          <div
            key={i}
            className={cn(
              "p-3 rounded-2xl border flex items-start gap-2.5",
              flag.level === "critical" && "bg-rose-500/10 border-rose-500/30",
              flag.level === "warning" && "bg-amber-500/10 border-amber-500/30",
              flag.level === "info" && "bg-cyan-500/10 border-cyan-500/30"
            )}
          >
            {flag.level === "info" ? (
              <Info size={15} className="shrink-0 mt-0.5 text-cyan-300" />
            ) : (
              <AlertTriangle
                size={15}
                className={cn("shrink-0 mt-0.5", flag.level === "critical" ? "text-rose-400" : "text-amber-400")}
              />
            )}
            <div className="space-y-0.5 min-w-0">
              <span
                className={cn(
                  "text-[11px] font-bold block",
                  flag.level === "critical" ? "text-rose-300" : flag.level === "warning" ? "text-amber-300" : "text-cyan-300"
                )}
              >
                {flag.title}
              </span>
              <span className="text-[10px] leading-relaxed text-zinc-400 block">{flag.message}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] leading-relaxed text-zinc-600">
        Mikronährstoffe werden aus einer eingebauten Lebensmittel-Heuristik geschätzt (OFF/AI-Logs
        enthalten keine Micro-Daten). RDAs sind für Hybrid-Athleten erhöht (Schweißverlust &
        Trainingsvolumen). Keine medizinische Beratung.
      </p>

      {isBiomarkerModalOpen && (
        <BiomarkerModal
          isOpen={isBiomarkerModalOpen}
          onClose={() => setIsBiomarkerModalOpen(false)}
        />
      )}
    </div>
  );
}
