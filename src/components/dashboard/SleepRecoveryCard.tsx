"use client";

import { useMemo } from "react";
import {
  Moon,
  Wind,
  Sun,
  Coffee,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getLocalDateString, cn } from "@/lib/utils";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import {
  buildCircadianPlan,
  detectHighVolumeLegDay,
  estimateDailyTss,
  extractCaffeineIntakes,
} from "@/lib/coaching/circadian-optimizer";
import type { ScheduledWorkout } from "@/lib/coaching/circadian-optimizer";

interface SleepRecoveryCardProps {
  selectedDate?: string;
}

export default function SleepRecoveryCard({ selectedDate }: SleepRecoveryCardProps) {
  const { garminHealthLogs, garminActivities, loggedSessions, nutritionLogs } = useApp();

  const activeDate = selectedDate || getLocalDateString();
  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);

  const report = useMemo(() => {
    const dayTss = estimateDailyTss(garminActivities, activeDate);
    const legDay = detectHighVolumeLegDay(loggedSessions, activeDate);

    const scheduledWorkouts: ScheduledWorkout[] = garminActivities
      .filter((a) => getLocalDateString(new Date(a.startTime)) === activeDate)
      .map((a) => ({
        id: a.id,
        label: a.name,
        startTime: new Date(a.startTime).toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        durationMin: Math.max(15, Math.round(a.durationSeconds / 60)),
      }));

    const caffeineIntakes = extractCaffeineIntakes(
      nutritionLogs.find((l) => l.date === activeDate)
    );

    return buildCircadianPlan({
      date: activeDate,
      garminHealthLogs,
      dayTss,
      highVolumeLegDay: legDay,
      scheduledWorkouts,
      caffeineIntakes,
    });
  }, [activeDate, garminHealthLogs, garminActivities, loggedSessions, nutritionLogs]);

  const consistencyColor =
    report.gate.consistencyLevel === "hoch"
      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
      : report.gate.consistencyLevel === "mittel"
        ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
        : "text-amber-300 border-amber-500/30 bg-amber-500/10";

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
            <Moon size={15} />
          </div>
          <div>
            <h3 className="text-xs font-black text-zinc-100 font-mono tracking-tight">
              SCHLAF- & REGENERATIONSZIEL
            </h3>
            <p className="text-[10px] text-zinc-500">Circadianes Gate · Konflikt-Sentinel</p>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[9px] uppercase font-black text-zinc-500 font-mono">Bedarf</span>
          <span className="text-sm font-black font-mono text-indigo-300 leading-none">
            {report.sleepNeedLabel}
          </span>
        </div>
      </div>

      {/* Zielzeiten */}
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { icon: Wind, label: "Wind-Down", value: report.targets.windDownStart, tone: "text-sky-300" },
          { icon: Moon, label: "Lights Out", value: report.targets.lightsOut, tone: "text-indigo-300" },
          { icon: Sun, label: "Wake Up", value: report.targets.wakeUp, tone: "text-amber-300" },
        ].map((t) => (
          <div key={t.label} className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-center">
            <t.icon size={13} className={cn("mx-auto mb-1", t.tone)} />
            <div className="text-[8px] uppercase font-black tracking-wider text-zinc-500">{t.label}</div>
            <div className={cn("text-sm font-black font-mono leading-tight", t.tone)}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* Schlaf-Fenster-Leiste */}
      <div className="space-y-1">
        <div className="relative h-3 w-full rounded-full overflow-hidden flex bg-black/60 border border-white/5">
          <div className="h-full w-[12%] bg-sky-400/40" title={`Wind-Down ab ${report.targets.windDownStart}`} />
          <div
            className="h-full bg-linear-to-r from-indigo-600 to-purple-500"
            style={{ width: `${Math.min(88, (report.sleepNeedMinutes / (14 * 60)) * 100)}%` }}
            title={`${report.sleepNeedLabel} Schlaf`}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>{report.targets.windDownStart}</span>
          <span className={cn("font-bold", report.targets.meetsSleepNeed ? "text-emerald-400" : "text-amber-400")}>
            {report.targets.meetsSleepNeed
              ? `${report.sleepNeedLabel} erreichbar`
              : `nur ${report.targets.achievableSleepLabel} möglich`}
          </span>
          <span>{report.targets.wakeUp}</span>
        </div>
      </div>

      {/* Gate & Load-Chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border font-mono", consistencyColor)}>
          Gate {report.gate.isFallback ? "Fallback 23:00" : `${formatGateLabel(report.gate.windowStartMinutes)}–${formatGateLabel(report.gate.windowEndMinutes)}`}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border font-mono text-zinc-400 border-white/10 bg-white/[0.04]">
          Konsistenz {report.gate.consistencyPct}% · {report.gate.consistencyLevel}
        </span>
        {report.loadModifierMinutes > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border font-mono text-orange-300 border-orange-500/30 bg-orange-500/10 flex items-center gap-1">
            <Zap size={9} /> +{report.loadModifierMinutes} Min ({report.loadReasons.join(" · ")})
          </span>
        )}
      </div>

      {/* Konflikte */}
      {report.conflicts.length > 0 ? (
        <div className="space-y-1.5 pt-1 border-t border-white/5">
          {report.conflicts.map((c, i) => (
            <div
              key={`${c.kind}-${i}`}
              className={cn(
                "p-2.5 rounded-xl border space-y-1",
                c.severity === "kritisch"
                  ? "bg-rose-500/10 border-rose-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
              )}
            >
              <div className="flex items-start gap-1.5">
                {c.kind === "caffeine" ? (
                  <Coffee size={12} className="mt-0.5 shrink-0 text-amber-300" />
                ) : (
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-rose-300" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-zinc-100 truncate">{c.label}</p>
                  <p className="text-[10px] text-zinc-400">{c.detail}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{c.suggestion}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
          <CheckCircle2 size={12} />
          Kein Intensitäts- oder Koffein-Konflikt im 3-h-Fenster vor Lights-Out.
        </div>
      )}

      {/* Top-Tipp */}
      {report.tips.length > 0 && (
        <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/25">
          <Moon size={11} className="mt-0.5 shrink-0 text-indigo-300" />
          <p className="text-[10px] text-zinc-300 leading-snug">{report.tips[0]}</p>
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-zinc-600 text-center flex items-center justify-center gap-1">
        Schlaf letzte Nacht: {health.sleepDurationHours}h ({health.sleepScore}/100)
        {report.gate.sampleCount > 0 && ` · ${report.gate.sampleCount} Nächte analysiert`}
        <ChevronRight size={10} />
      </p>
    </div>
  );
}

function formatGateLabel(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}
