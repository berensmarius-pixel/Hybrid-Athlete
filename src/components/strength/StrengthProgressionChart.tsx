"use client";

import { useMemo, useState } from "react";
import { Award, Dumbbell, TrendingUp, Zap } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import {
  buildE1rmSeries,
  buildPrBook,
  findLastExerciseSession,
  getExerciseSets,
  listTrackedExercises,
  PR_KINDS,
  PR_LABELS,
  recommendProgression,
  type PrKind,
  type PrSlot,
} from "@/lib/strength/progression";
import AreaChart, { Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";



function fmtKg(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function fmtDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

export default function StrengthProgressionChart() {
  const { loggedSessions } = useApp();
  const [selectedName, setSelectedName] = useState<string>("");

  const exercises = useMemo(() => listTrackedExercises(loggedSessions), [loggedSessions]);

  const activeExercise =
    exercises.find((e) => e.name === selectedName)?.name ?? exercises[0]?.name ?? "";

  const series = useMemo(
    () => (activeExercise ? buildE1rmSeries(loggedSessions, activeExercise) : []),
    [loggedSessions, activeExercise]
  );

  const prSlot = useMemo(() => {
    if (!activeExercise) return null;
    return buildPrBook(loggedSessions).get(activeExercise.trim().toLowerCase()) ?? null;
  }, [loggedSessions, activeExercise]);

  const recommendation = useMemo(() => {
    if (!activeExercise) return null;
    const lastSession = findLastExerciseSession(loggedSessions, activeExercise);
    if (!lastSession) return null;
    return recommendProgression(getExerciseSets(lastSession, activeExercise));
  }, [loggedSessions, activeExercise]);

  const chartData = useMemo(() => {
    return series.map((s) => ({
      ...s,
      date: parseLocalDate(s.date),
      e1rm: Math.round(s.e1rm * 10) / 10,
    }));
  }, [series]);

  const latest = series[series.length - 1];
  const previous = series[series.length - 2];
  const delta = latest && previous ? latest.e1rm - previous.e1rm : null;

  if (exercises.length === 0) {
    return (
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-4 shadow-sm">
        <Header />
        <div className="rounded-2xl bg-zinc-950/60 border border-dashed border-zinc-800/80 flex flex-col items-center justify-center text-center p-6">
          <Dumbbell size={22} className="text-zinc-600 mb-2" />
          <span className="text-[11px] text-neutral-400 font-medium">
            Noch keine Kraftwerte geloggt
          </span>
          <span className="text-[9px] text-neutral-500 mt-0.5">
            Sobald du Gewichte &amp; Wdh. im Logger erfasst, erscheinen hier e1RM-Kurve, Rekorde &amp; Progressions-Empfehlung
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Header />
        {latest && delta !== null && (
          <span
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black font-mono border",
              delta >= 0
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                : "bg-red-500/10 text-red-300 border-red-500/30"
            )}
          >
            <TrendingUp size={12} className={delta >= 0 ? "" : "rotate-180"} />
            {delta >= 0 ? "+" : ""}
            {fmtKg(delta)} kg e1RM
          </span>
        )}
      </div>

      {/* Exercise picker */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
        {exercises.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => setSelectedName(e.name)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border",
              e.name === activeExercise
                ? "bg-cyan-500/15 text-cyan-200 border-cyan-500/40"
                : "bg-zinc-950/60 text-neutral-400 border-zinc-800/80 hover:text-zinc-200"
            )}
          >
            {e.name}
            <span className="ml-1.5 text-[9px] opacity-60">{e.sessionCount}×</span>
          </button>
        ))}
      </div>

      {/* e1RM chart */}
      <div className="relative">
        {series.length >= 2 && (
          <div className="w-full h-[180px] overflow-hidden">
            <AreaChart
              data={chartData as unknown as Record<string, unknown>[]}
              xDataKey="date"
              aspectRatio="2.5 / 1"
              margin={{ top: 12, right: 12, bottom: 20, left: 12 }}
              className="w-full h-full"
            >
              <Grid horizontal stroke="#27272a" strokeDasharray="3 4" numTicksRows={4} />
              <XAxis numTicks={4} />
              <Area
                dataKey="e1rm"
                stroke="#22d3ee"
                fill="#22d3ee"
                fillOpacity={0.3}
                strokeWidth={2}
              />
              <ChartTooltip
                rows={(p) => [
                  {
                    color: "#22d3ee",
                    label: "e1RM",
                    value: `${fmtKg(Number(p.e1rm))} kg (${fmtKg(Number(p.topWeight))} × ${Number(p.topReps)})`,
                  },
                ]}
              />
            </AreaChart>
          </div>
        )}

        {series.length === 1 && (
          <div className="h-[170px] flex flex-col items-center justify-center gap-1">
            <span className="text-3xl font-black font-mono text-cyan-300">
              {fmtKg(series[0].e1rm)}<span className="text-sm text-neutral-500 ml-1">kg</span>
            </span>
            <span className="text-[10px] text-neutral-500">
              Erster Datenpunkt vom {fmtDate(series[0].date)} – nächstes Training erzeugt die Kurve
            </span>
          </div>
        )}

        {/* X labels */}
        {series.length >= 2 && latest && (
          <div className="flex justify-between mt-1 pt-1.5 border-t border-zinc-800/60">
            <span className="text-[10px] font-mono text-neutral-500">
              {fmtDate(series[0].date)}
            </span>
            <span className="text-[10px] font-mono text-neutral-400">
              Ø e1RM · Top: {fmtKg(latest.topWeight)} kg × {latest.topReps}
            </span>
            <span className="text-[10px] font-mono text-zinc-100 font-bold">
              {fmtDate(latest.date)}
            </span>
          </div>
        )}
      </div>

      {/* PR cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PR_KINDS.map((kind) => (
          <PrCard key={kind} kind={kind} slot={prSlot} />
        ))}
      </div>

      {/* Progression recommendation */}
      {recommendation && (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-linear-to-r from-cyan-500/10 to-blue-500/5 border border-cyan-500/25">
          <div className="p-1.5 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0 mt-0.5">
            <Zap size={14} />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-black text-cyan-100 font-mono tracking-tight">
              {recommendation.headline}
            </p>
            <p className="text-[11px] text-zinc-400 leading-snug">{recommendation.reason}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-xl bg-zinc-800 text-cyan-300">
        <TrendingUp size={16} />
      </div>
      <div>
        <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider block leading-tight">
          Stärke-Analytics
        </span>
        <span className="text-[10px] text-neutral-500">Historische e1RM-Kurve &amp; Progression</span>
      </div>
    </div>
  );
}

function PrCard({ kind, slot }: { kind: PrKind; slot: PrSlot | null }) {
  const record = slot?.[kind] ?? null;
  return (
    <div
      className={cn(
        "p-2.5 rounded-2xl border space-y-1",
        record ? "bg-zinc-950/70 border-zinc-800" : "bg-zinc-950/40 border-zinc-800/50 border-dashed"
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-neutral-500">
        <Award size={10} className={record ? "text-amber-400" : "text-zinc-600"} />
        <span className="truncate">{PR_LABELS[kind]}</span>
      </div>
      {record ? (
        <>
          <p className="text-sm font-black font-mono text-zinc-100 leading-none">
            {fmtKg(record.value)}
            <span className="text-[10px] text-neutral-500 ml-0.5">kg</span>
          </p>
          <p className="text-[9px] text-neutral-500 font-mono truncate">
            {fmtKg(record.weight)}×{record.reps} · {fmtDate(record.date)}
          </p>
        </>
      ) : (
        <p className="text-sm font-mono text-zinc-600 leading-none">–</p>
      )}
    </div>
  );
}
