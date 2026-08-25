"use client";

import { useMemo, useState } from "react";
import { BarChart2, Dumbbell, Bike } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { GymSession, EnduranceSession } from "@/types";
import { cn } from "@/lib/utils";

type ChartMode = "gym" | "endurance";

interface WeekBucket {
  label: string; // "KW 15"
  gymKg: number;
  runKm: number;
  rideKm: number;
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const jsDay = d.getDay();
  const toMonday = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + toMonday);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function getWeekLabel(key: string): string {
  const [, w] = key.split("-W");
  return `KW ${w}`;
}

function parseDuration(dur: string): number {
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] / 60 + parts[1] / 3600;
  return 0;
}

function parsePaceKm(endSession: EnduranceSession): number {
  return parseDuration(endSession.duration);
}

function SvgBars({ values, color, maxValue }: { values: number[]; color: string; maxValue: number }) {
  const height = 80;
  const barW = 100 / values.length;
  const isAllZero = values.every((v) => v === 0);

  if (isAllZero) {
    return (
      <div className="relative w-full h-20 rounded-xl bg-zinc-950/60 border border-dashed border-zinc-800/80 flex flex-col items-center justify-center text-center p-3">
        <span className="text-[11px] text-neutral-400 font-medium">
          Noch keine Workout-Daten für die letzten 8 Wochen vorhanden
        </span>
        <span className="text-[9px] text-neutral-500 mt-0.5">
          Logge dein nächstes Training im Cockpit oder über die Vorlagen
        </span>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
      {/* Grid lines */}
      <line x1="0" y1="20" x2="100" y2="20" stroke="#27272a" strokeDasharray="2 2" strokeWidth="0.5" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#27272a" strokeDasharray="2 2" strokeWidth="0.5" />

      {values.map((v, i) => {
        const barHeight = maxValue > 0 ? (v / maxValue) * (height - 6) : 0;
        const x = i * barW + barW * 0.15;
        const w = barW * 0.7;
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={Math.max(barHeight, 2)}
            rx={2}
            fill={color}
            opacity={i === values.length - 1 ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

export default function VolumeCharts() {
  const { loggedSessions } = useApp();
  const [mode, setMode] = useState<ChartMode>("gym");

  const buckets = useMemo((): WeekBucket[] => {
    const now = new Date();
    const weeks: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      weeks.push(getWeekKey(d));
    }

    const map = new Map<string, WeekBucket>(
      weeks.map((k) => [k, { label: getWeekLabel(k), gymKg: 0, runKm: 0, rideKm: 0 }])
    );

    for (const s of loggedSessions) {
      const key = getWeekKey(new Date(s.date));
      if (!map.has(key)) continue;
      const bucket = map.get(key)!;

      if (s.kind === "gym") {
        const gym = s as GymSession;
        for (const entry of gym.entries) {
          for (const set of entry.sets) {
            if (!set.isCompleted) continue;
            bucket.gymKg += (Number(set.weight) || 0) * (Number(set.reps) || 0);
          }
        }
      } else if (s.kind === "endurance") {
        const end = s as EnduranceSession;
        const hours = parsePaceKm(end);
        if (end.activityType === "running") {
          const paceMatch = end.pace.match(/^(\d+):(\d+)/);
          if (paceMatch) {
            const paceMin = Number(paceMatch[1]) + Number(paceMatch[2]) / 60;
            const kmPerH = 60 / paceMin;
            bucket.runKm += hours * kmPerH;
          } else {
            bucket.runKm += hours * 11.5;
          }
        } else {
          const speedMatch = end.pace.match(/([\d.]+)\s*km\/h/);
          if (speedMatch) {
            bucket.rideKm += hours * Number(speedMatch[1]);
          } else {
            bucket.rideKm += hours * 28.0;
          }
        }
      }
    }

    return Array.from(map.values());
  }, [loggedSessions]);

  const gymValues = buckets.map((b) => b.gymKg);
  const runValues = buckets.map((b) => Math.round(b.runKm * 10) / 10);
  const rideValues = buckets.map((b) => Math.round(b.rideKm * 10) / 10);

  const maxGym = Math.max(...gymValues, 1);
  const maxRun = Math.max(...runValues, 1);
  const maxRide = Math.max(...rideValues, 1);

  const labels = buckets.map((b) => b.label);
  const thisWeek = buckets[buckets.length - 1];

  return (
    <div className="mx-4 p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-4 shadow-sm">
      {/* Header with Segmented Control */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-zinc-800 text-zinc-300">
            <BarChart2 size={16} />
          </div>
          <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
            Volumen (8 Wochen)
          </span>
        </div>

        {/* Segmented Switcher */}
        <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800 gap-1">
          <button
            type="button"
            onClick={() => setMode("gym")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              mode === "gym"
                ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                : "text-neutral-400 hover:text-zinc-200"
            )}
          >
            <Dumbbell size={13} />
            <span>Kraft</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("endurance")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              mode === "endurance"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25"
                : "text-neutral-400 hover:text-zinc-200"
            )}
          >
            <Bike size={13} />
            <span>Ausdauer</span>
          </button>
        </div>
      </div>

      {mode === "gym" ? (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-[11px] text-neutral-400 font-medium">Volumen (kg × Wdh)</span>
            <span className="text-sm font-black font-mono text-blue-400">
              {thisWeek.gymKg > 0 ? `${thisWeek.gymKg.toLocaleString("de")} kg` : "0 kg (Diese Woche)"}
            </span>
          </div>
          <SvgBars values={gymValues} color="#3b82f6" maxValue={maxGym} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-[11px] text-neutral-400 font-medium flex items-center gap-1">
                🏃 Laufen (km)
              </span>
              <span className="text-sm font-black font-mono text-emerald-400">
                {runValues[runValues.length - 1].toFixed(1)} km
              </span>
            </div>
            <SvgBars values={runValues} color="#10b981" maxValue={maxRun} />
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-[11px] text-neutral-400 font-medium flex items-center gap-1">
                🚴 Radfahren (km)
              </span>
              <span className="text-sm font-black font-mono text-orange-400">
                {rideValues[rideValues.length - 1].toFixed(1)} km
              </span>
            </div>
            <SvgBars values={rideValues} color="#f97316" maxValue={maxRide} />
          </div>
        </div>
      )}

      {/* Week X-Axis Labels */}
      <div className="flex border-t border-zinc-800/60 pt-2">
        {labels.map((l, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 text-center text-[10px] font-mono truncate",
              i === labels.length - 1 ? "text-zinc-100 font-bold" : "text-neutral-500"
            )}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
