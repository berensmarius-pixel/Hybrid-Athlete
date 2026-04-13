"use client";

import { useMemo, useState } from "react";
import { BarChart2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { GymSession, EnduranceSession } from "@/types";

type ChartMode = "gym" | "endurance";

interface WeekBucket {
  label: string;   // "KW 15"
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
  // ISO week number
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function getWeekLabel(key: string): string {
  const [, w] = key.split("-W");
  return `KW ${w}`;
}

function parseDuration(dur: string): number {
  // "hh:mm:ss" or "mm:ss" → hours
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  if (parts.length === 2) return parts[0] / 60 + parts[1] / 3600;
  return 0;
}

function parsePaceKm(endSession: EnduranceSession): number {
  // Try to extract km from pace field "X km/h" for cycling or infer 0
  // For running: duration in hours × assumed we don't have distance stored
  // We'll estimate from duration × (1/pace)
  // Actually, EnduranceSession doesn't have distance — use duration as proxy
  return parseDuration(endSession.duration);
}

function SvgBars({ values, color, maxValue }: { values: number[]; color: string; maxValue: number }) {
  const height = 80;
  const barW = 100 / values.length;

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
      {values.map((v, i) => {
        const barHeight = maxValue > 0 ? (v / maxValue) * (height - 4) : 0;
        const x = i * barW + barW * 0.15;
        const w = barW * 0.7;
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={barHeight}
            rx={2}
            fill={color}
            opacity={i === values.length - 1 ? 1 : 0.5}
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
    // Build last 8 weeks
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
        // Estimate km: pace field may contain "5:30/km" for running or "25.0 km/h" for cycling
        if (end.activityType === "running") {
          // parse pace min:sec/km → km/h
          const paceMatch = end.pace.match(/^(\d+):(\d+)/);
          if (paceMatch) {
            const paceMin = Number(paceMatch[1]) + Number(paceMatch[2]) / 60;
            const kmPerH = 60 / paceMin;
            bucket.runKm += hours * kmPerH;
          }
        } else {
          // cycling: parse "XX km/h"
          const speedMatch = end.pace.match(/([\d.]+)\s*km\/h/);
          if (speedMatch) {
            bucket.rideKm += hours * Number(speedMatch[1]);
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
    <div className="mx-4 p-4 rounded-2xl bg-zinc-900 border border-zinc-800/60 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Volumen (8 Wochen)</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("gym")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === "gym" ? "bg-blue-600/30 text-blue-300" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Kraft
          </button>
          <button
            onClick={() => setMode("endurance")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${mode === "endurance" ? "bg-green-600/30 text-green-300" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Ausdauer
          </button>
        </div>
      </div>

      {mode === "gym" ? (
        <>
          <div>
            <div className="flex items-end justify-between mb-1">
              <span className="text-[10px] text-zinc-600">Volumen (kg × Wdh)</span>
              <span className="text-sm font-bold text-blue-400">{thisWeek.gymKg.toLocaleString("de")} kg</span>
            </div>
            <SvgBars values={gymValues} color="#3b82f6" maxValue={maxGym} />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-end justify-between mb-1">
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">🏃 Laufen</span>
              <span className="text-sm font-bold text-green-400">{runValues[runValues.length - 1].toFixed(1)} km</span>
            </div>
            <SvgBars values={runValues} color="#22c55e" maxValue={maxRun} />
          </div>
          <div>
            <div className="flex items-end justify-between mb-1">
              <span className="text-[10px] text-zinc-600 flex items-center gap-1">🚴 Radfahren</span>
              <span className="text-sm font-bold text-orange-400">{rideValues[rideValues.length - 1].toFixed(1)} km</span>
            </div>
            <SvgBars values={rideValues} color="#f97316" maxValue={maxRide} />
          </div>
        </div>
      )}

      {/* Week labels */}
      <div className="flex">
        {labels.map((l, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[9px] truncate ${i === labels.length - 1 ? "text-zinc-300 font-bold" : "text-zinc-600"}`}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
