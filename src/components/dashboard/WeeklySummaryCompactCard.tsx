"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  Dumbbell,
  Activity,
  Clock,
  Flame,
  Target,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getTodayIndex } from "@/lib/utils";
import type { LoggedSession, DayPlan } from "@/types";
import { cn } from "@/lib/utils";

interface WeeklySummaryCompactCardProps {
  className?: string;
}

function getWorkoutTypeColor(type: string) {
  const colors: Record<string, string> = {
    gym: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    running: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    cycling: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    swimming: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    mobility: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    stretching: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    warmup: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    rest: "text-zinc-400 bg-zinc-700/10 border-zinc-800/20",
  };
  return colors[type] || colors.rest;
}

function getWorkoutIcon(type: string) {
  switch (type) {
    case "gym": return Dumbbell;
    case "running": return Activity;
    case "cycling": return Target;
    case "swimming": return Activity;
    case "mobility": return Activity;
    case "stretching": return Activity;
    case "warmup": return Activity;
    case "rest": return CheckCircle2;
    default: return Activity;
  }
}

export default function WeeklySummaryCompactCard({ className }: WeeklySummaryCompactCardProps) {
  const { loggedSessions, weeklyPlan, personalRecords } = useApp();
  const todayIndex = getTodayIndex();

  const weeklyStats = useMemo(() => {
    const cutoff7 = new Date();
    cutoff7.setDate(cutoff7.getDate() - 7);
    const recentSessions = loggedSessions.filter((s) => new Date(s.date) >= cutoff7);

    const gymSessions = recentSessions.filter((s) => s.kind === "gym" || s.kind === "stretching" || s.kind === "warmup" || s.kind === "mobility");
    const enduranceSessions = recentSessions.filter((s) => s.kind === "endurance");

    let totalSets = 0;
    let totalVolume = 0;
    let totalEnduranceMins = 0;
    let totalEnduranceKcal = 0;

    gymSessions.forEach((s) => {
      if (s.kind === "gym" || s.kind === "stretching" || s.kind === "warmup" || s.kind === "mobility") {
        s.entries.forEach((ex) => {
          ex.sets.forEach((set) => {
            if (set.isCompleted && typeof set.weight === "number" && typeof set.reps === "number") {
              totalSets++;
              totalVolume += set.weight * set.reps;
            }
          });
        });
      }
    });

    enduranceSessions.forEach((s) => {
      const dur = parseFloat(s.duration) || 0;
      totalEnduranceMins += dur;
      totalEnduranceKcal += s.kind === "endurance" ? 0 : 0; // calories not stored directly
    });

    const completedDays = weeklyPlan.filter((d) => d.isCompleted).length;
    const plannedSessions = weeklyPlan.reduce((acc, d) => acc + (d.sessions?.length || 1), 0);
    const completedSessions = weeklyPlan.reduce((acc, d) => {
      if (d.sessions?.length) {
        return acc + d.sessions.filter((s) => s.isCompleted).length;
      }
      return acc + (d.isCompleted ? 1 : 0);
    }, 0);

    return {
      gymSessions: gymSessions.length,
      enduranceSessions: enduranceSessions.length,
      totalSets,
      totalVolume,
      totalEnduranceMins,
      completedDays,
      plannedSessions,
      completedSessions,
      adherence: plannedSessions > 0 ? Math.round((completedSessions / plannedSessions) * 100) : 0,
    };
  }, [loggedSessions, weeklyPlan]);

  const recentPRs = useMemo(() => {
    return personalRecords.slice(0, 3);
  }, [personalRecords]);

  const workoutTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const cutoff7 = new Date();
    cutoff7.setDate(cutoff7.getDate() - 7);
    const recentSessions = loggedSessions.filter((s) => new Date(s.date) >= cutoff7);

    recentSessions.forEach((s) => {
      const type = s.kind === "endurance" ? s.activityType : s.kind;
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [loggedSessions]);

  return (
    <div className={cn("p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-4 shadow-xl shadow-black/30", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-zinc-900 border border-white/10 text-cyan-400 flex items-center justify-center">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <span>Wochenbilanz (7 Tage)</span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Adhärenz: {weeklyStats.adherence}% • {weeklyStats.completedSessions}/{weeklyStats.plannedSessions} Sessions
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[10px] uppercase font-bold tracking-wider">Gym Sessions</span>
            <span className="text-[10px] font-bold text-blue-400">{weeklyStats.gymSessions}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-zinc-100">{weeklyStats.totalSets}</span>
            <span className="text-xs text-zinc-500 font-bold">Sätze</span>
          </div>
          <span className="text-[10px] text-zinc-500 block">Volumen: {weeklyStats.totalVolume.toLocaleString()} kg</span>
        </div>

        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[10px] uppercase font-bold tracking-wider">Ausdauer</span>
            <span className="text-[10px] font-bold text-teal-400">{weeklyStats.enduranceSessions}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-zinc-100">{weeklyStats.totalEnduranceMins}</span>
            <span className="text-xs text-zinc-500 font-bold">Min</span>
          </div>
          <span className="text-[10px] text-zinc-500 block">Ø {weeklyStats.enduranceSessions > 0 ? Math.round(weeklyStats.totalEnduranceMins / weeklyStats.enduranceSessions) : 0} Min/Session</span>
        </div>

        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[10px] uppercase font-bold tracking-wider">Tage trainiert</span>
            <span className="text-[10px] font-bold text-emerald-400">{weeklyStats.completedDays}/7</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-zinc-100">{weeklyStats.adherence}%</span>
            <span className="text-xs text-zinc-500 font-bold">Adhärenz</span>
          </div>
          <span className="text-[10px] text-zinc-500 block">Plan-Erfüllung</span>
        </div>

        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[10px] uppercase font-bold tracking-wider">Neue PRs</span>
            <span className="text-[10px] font-bold text-amber-400">{recentPRs.length}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-zinc-100">{recentPRs.length}</span>
            <span className="text-xs text-zinc-500 font-bold">Records</span>
          </div>
          <span className="text-[10px] text-zinc-500 block">
            {recentPRs[0] ? `${recentPRs[0].exerciseName}: ${recentPRs[0].estimated1RM}kg e1RM` : "Keine neuen Rekorde"}
          </span>
        </div>
      </div>

      {/* Workout Type Distribution */}
      <div className="pt-2 border-t border-white/[0.05] space-y-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
          Trainingsverteilung
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(workoutTypeCounts).map(([type, count]) => {
            const color = getWorkoutTypeColor(type);
            const Icon = getWorkoutIcon(type);
            return (
              <span
                key={type}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5",
                  color
                )}
              >
                <Icon size={12} />
                <span>{type}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white font-mono">{count}</span>
              </span>
            );
          })}
          {Object.keys(workoutTypeCounts).length === 0 && (
            <span className="px-2.5 py-1 rounded-xl text-xs text-zinc-500 border border-zinc-800">
              Keine Sessions diese Woche
            </span>
          )}
        </div>
      </div>

      {/* Top PRs */}
      {recentPRs.length > 0 && (
        <div className="pt-2 border-t border-white/[0.05] space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
            Top Rekorde
          </span>
          <div className="space-y-1.5">
            {recentPRs.slice(0, 2).map((pr, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-zinc-100 truncate">{pr.exerciseName}</h4>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {pr.bestWeight}kg × {pr.bestReps} • {pr.date.split("T")[0]}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  {pr.estimated1RM}kg e1RM
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}