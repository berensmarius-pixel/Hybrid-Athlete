"use client";

import { useMemo, useState } from "react";
import {
  Bike,
  Zap,
  Mountain,
  Dumbbell,
  HeartPulse,
  Moon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Trophy,
  Target,
  Activity,
  Copy,
  CheckCircle2,
  FileDown,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import {
  aggregateWeeklyMetrics,
  formatWeeklyReportText,
  generateWeeklyAnalysis,
  exportWeeklyReportPdf,
  openWeeklyReportEmail,
  getWeekRange,
} from "@/modules/reports/weekly-summary";
import type { WeeklyAnalysis } from "@/modules/reports/weekly-summary";
import { cn } from "@/lib/utils";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; analysis: WeeklyAnalysis };

const MUSCLE_BAR_COLORS: Record<string, string> = {
  Beine: "bg-blue-500",
  Brust: "bg-orange-500",
  Rücken: "bg-green-500",
  Schultern: "bg-purple-500",
  Arme: "bg-pink-500",
  Core: "bg-cyan-500",
  Sonstige: "bg-zinc-600",
};

export default function WeeklySummaryCard() {
  const { loggedSessions, garminActivities, garminHealthLogs, gymTemplates } = useApp();
  const { activities: stravaActivities } = useStrava();

  const [weekOffset, setWeekOffset] = useState(0);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const metrics = useMemo(
    () =>
      aggregateWeeklyMetrics({
        range: getWeekRange(weekOffset),
        sessions: loggedSessions,
        garminActivities,
        stravaActivities,
        healthLogs: garminHealthLogs,
        gymTemplates,
      }),
    [weekOffset, loggedSessions, garminActivities, stravaActivities, garminHealthLogs, gymTemplates]
  );

  async function handleRunAnalysis() {
    setAnalysisState({ status: "loading" });
    try {
      const analysis = await generateWeeklyAnalysis(metrics);
      setAnalysisState({ status: "done", analysis });
    } catch (err) {
      setAnalysisState({
        status: "error",
        message: err instanceof Error ? err.message : "Unbekannter Fehler bei der KI-Analyse.",
      });
    }
  }

  function handleCopy() {
    const text = formatWeeklyReportText(
      metrics,
      analysisState.status === "done" ? analysisState.analysis : null
    );
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const analysis =
    analysisState.status === "done" ? analysisState.analysis : null;

  const maxMuscleTonnage = Math.max(1, ...metrics.muscleVolumes.map((m) => m.tonnageKg));

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 shadow-xl shadow-black/30 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <Activity size={20} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-zinc-100 font-mono uppercase">
              Wochen-Performance-Report
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Rad · Kraft · Erholung – aggregiert & KI-analysiert
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900 border border-white/10">
          <button
            type="button"
            onClick={() => {
              setWeekOffset((v) => v - 1);
              setAnalysisState({ status: "idle" });
            }}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 text-xs font-bold font-mono text-zinc-200 min-w-[90px] text-center">
            {metrics.label}
          </span>
          <button
            type="button"
            onClick={() => {
              setWeekOffset((v) => v + 1);
              setAnalysisState({ status: "idle" });
            }}
            disabled={weekOffset >= 0}
            className={cn(
              "p-2 rounded-xl transition-colors",
              weekOffset >= 0
                ? "text-zinc-700 cursor-not-allowed"
                : "text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
            )}
            aria-label="Nächste Woche"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <MetricTile icon={<Bike size={14} />} label="Bike-Stunden" value={`${metrics.bikeHours}h`} tone="text-orange-400" />
        <MetricTile
          icon={<Zap size={14} />}
          label="Arbeit (kJ)"
          value={metrics.bikeKilojoules != null ? metrics.bikeKilojoules.toLocaleString("de-DE") : "–"}
          sub={metrics.bikeKilojoules == null ? "keine Leistungsmessung" : undefined}
          tone="text-yellow-400"
        />
        <MetricTile icon={<Mountain size={14} />} label="Höhenmeter" value={`+${metrics.elevationGainMeters}m`} tone="text-emerald-400" />
        <MetricTile
          icon={<Dumbbell size={14} />}
          label="Gym-Tonnage"
          value={`${metrics.gymTonnageKg.toLocaleString("de-DE")}kg`}
          sub={`${metrics.gymSets} Sätze`}
          tone="text-blue-400"
        />
        <MetricTile
          icon={<HeartPulse size={14} />}
          label="Ø HRV"
          value={metrics.avgHrvMs != null ? `${metrics.avgHrvMs}ms` : "–"}
          sub={metrics.avgHrvMs != null ? `${metrics.hrvDays} Nächte` : "keine Daten"}
          tone="text-red-400"
        />
        <MetricTile
          icon={<Moon size={14} />}
          label="Sleep Score Σ"
          value={String(metrics.totalSleepScore)}
          sub={`${metrics.sleepDays} Tage`}
          tone="text-indigo-400"
        />
      </div>

      {metrics.muscleVolumes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 font-mono">
            Volumen je Muskelgruppe (kg)
          </h4>
          <div className="space-y-1.5">
            {metrics.muscleVolumes.map((m) => (
              <div key={m.group} className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 text-[11px] font-semibold text-zinc-300 truncate">{m.group}</span>
                <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", MUSCLE_BAR_COLORS[m.group] ?? "bg-zinc-600")}
                    style={{ width: `${Math.max((m.tonnageKg / maxMuscleTonnage) * 100, 4)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] font-mono text-zinc-400">
                  {m.tonnageKg.toLocaleString("de-DE")} kg · {m.sets}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-1 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-purple-300 font-mono flex items-center gap-1.5">
            <Sparkles size={13} className="text-purple-400" />
            KI-Qualitative Analyse
          </h4>
          {analysisState.status !== "loading" && (
            <button
              type="button"
              onClick={handleRunAnalysis}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-500/15 border border-purple-500/40 text-purple-200 hover:bg-purple-500/25 transition-colors active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>{analysisState.status === "done" ? "Neu analysieren" : "Analyse starten"}</span>
            </button>
          )}
        </div>

        {analysisState.status === "loading" && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
            <Loader2 size={14} className="animate-spin text-purple-400" />
            <span>Coach analysiert deine Woche …</span>
          </div>
        )}

        {analysisState.status === "error" && (
          <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{analysisState.message}</span>
          </div>
        )}

        {analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <AnalysisSection
              title="Key Wins & Highlights"
              icon={<Trophy size={14} />}
              items={analysis.keyWins}
              tone="border-emerald-500/30 bg-emerald-500/[0.06]"
              titleTone="text-emerald-300"
            />
            <AnalysisSection
              title="Fatigue & Recovery Balance"
              icon={<HeartPulse size={14} />}
              items={analysis.fatigueRecoveryBalance}
              tone="border-amber-500/30 bg-amber-500/[0.06]"
              titleTone="text-amber-300"
            />
            <AnalysisSection
              title="Strategic Focus for Next Microcycle"
              icon={<Target size={14} />}
              items={analysis.nextMicrocycleFocus}
              tone="border-purple-500/30 bg-purple-500/[0.06]"
              titleTone="text-purple-300"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "py-2.5 px-3 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 border",
            copied
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
              : "bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]"
          )}
        >
          {copied ? <CheckCircle2 size={14} /> : <Copy size={13} />}
          <span>{copied ? "Kopiert!" : "Als Text kopieren"}</span>
        </button>
        <button
          type="button"
          onClick={() => exportWeeklyReportPdf(metrics, analysis)}
          className="py-2.5 px-3 rounded-2xl text-xs font-bold bg-white/[0.04] border border-white/10 text-zinc-300 hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
        >
          <FileDown size={13} />
          <span>PDF / Drucken</span>
        </button>
        <button
          type="button"
          onClick={() => openWeeklyReportEmail(metrics, analysis)}
          className="py-2.5 px-3 rounded-2xl text-xs font-bold bg-white/[0.04] border border-white/10 text-zinc-300 hover:bg-white/[0.08] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
        >
          <Mail size={13} />
          <span>E-Mail-Zusammenfassung</span>
        </button>
      </div>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
      <div className={cn("flex items-center gap-1.5", tone)}>
        {icon}
        <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500">{label}</span>
      </div>
      <span className={cn("block text-lg font-black font-mono leading-none", tone)}>{value}</span>
      {sub && <span className="block text-[10px] text-zinc-500">{sub}</span>}
    </div>
  );
}

function AnalysisSection({
  title,
  icon,
  items,
  tone,
  titleTone,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tone: string;
  titleTone: string;
}) {
  return (
    <div className={cn("p-3.5 rounded-2xl border space-y-2", tone)}>
      <div className={cn("flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider", titleTone)}>
        {icon}
        <span>{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-[11px] text-zinc-300 leading-relaxed flex gap-1.5">
            <span className={cn("mt-1.5 h-1 w-1 rounded-full shrink-0", titleTone.replace("text-", "bg-"))} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
