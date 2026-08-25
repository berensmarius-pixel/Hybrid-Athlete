"use client";

import { useMemo, useState } from "react";
import { Copy, CheckCircle2, ChevronLeft, ChevronRight, Calendar, Trophy, Dumbbell, Bike, CheckCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats, getStravaCompletedDays } from "@/lib/stravaUtils";
import type { GymSession, EnduranceSession } from "@/types";

export default function WeeklyReportInline() {
  const { loggedSessions, weeklyPlan, personalRecords } = useApp();
  const { activities, connection } = useStrava();
  const [copied, setCopied] = useState(false);

  // Navigation states
  const [weekOffset, setWeekOffset] = useState(0);

  const range = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay();
    const toMon = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + toMon + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const label =
      weekOffset === 0
        ? "Diese Woche"
        : weekOffset === -1
        ? "Letzte Woche"
        : `${monday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${sunday.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}`;

    return { start: monday, end: sunday, label };
  }, [weekOffset]);

  const report = useMemo(() => {
    const { start, end, label } = range;

    const sessionsInRange = loggedSessions.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    const gymSessions = sessionsInRange.filter((s) => s.kind === "gym") as GymSession[];
    const totalGymVolume = gymSessions.reduce(
      (acc, s) =>
        acc +
        s.entries.reduce(
          (a, e) =>
            a +
            e.sets.reduce(
              (b, set) => (set.isCompleted ? (Number(set.weight) || 0) * (Number(set.reps) || 0) : b),
              0
            ),
          0
        ),
      0
    );
    const totalGymSets = gymSessions.reduce(
      (acc, s) => acc + s.entries.reduce((a, e) => a + e.sets.filter((set) => set.isCompleted).length, 0),
      0
    );

    const endSessions = sessionsInRange.filter(
      (s) => s.kind === "endurance" && !(s as EnduranceSession).stravaId
    ) as EnduranceSession[];

    const stravaStats = connection.isConnected ? getWeekStats(activities, range) : null;

    const plannedDays = weeklyPlan.filter((d) => d.workoutType !== "rest");
    const stravaCompleted = connection.isConnected ? getStravaCompletedDays(activities, weeklyPlan, range) : new Set<number>();
    const manualCompleted = new Set<number>();

    for (const day of plannedDays) {
      const has = sessionsInRange.some((s) => {
        const d = new Date(s.date);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        if (dayIdx !== day.dayIndex) return false;

        if (day.workoutType === "gym" && s.kind === "gym") return true;
        if (day.workoutType === "running" && s.kind === "endurance" && (s as EnduranceSession).activityType === "running")
          return true;
        if (day.workoutType === "cycling" && s.kind === "endurance" && (s as EnduranceSession).activityType === "cycling")
          return true;
        return false;
      });
      if (has) manualCompleted.add(day.dayIndex);
    }
    const completedCount = plannedDays.filter(
      (d) => stravaCompleted.has(d.dayIndex) || manualCompleted.has(d.dayIndex)
    ).length;
    const adherencePct = plannedDays.length > 0 ? Math.round((completedCount / plannedDays.length) * 100) : 0;

    const prsInRange = personalRecords.filter((pr) => {
      const d = new Date(pr.date);
      return d >= start && d <= end;
    });

    return {
      label,
      gymSessions: gymSessions.length,
      totalGymVolume,
      totalGymSets,
      endSessions: endSessions.length,
      stravaStats,
      adherencePct,
      completedCount,
      plannedCount: plannedDays.length,
      weekPRs: prsInRange,
      totalSessions: sessionsInRange.length,
    };
  }, [range, loggedSessions, weeklyPlan, activities, connection, personalRecords]);

  const reportText = useMemo(() => {
    const lines: string[] = [
      `📊 Wochenbericht: ${report.label}`,
      ``,
      `🏋️ Krafttraining:`,
      `  • Einheiten: ${report.gymSessions}`,
      `  • Sätze: ${report.totalGymSets}`,
      `  • Gesamtvolumen: ${report.totalGymVolume.toLocaleString("de")} kg`,
      ``,
    ];

    if (report.stravaStats) {
      lines.push(`🏃 Ausdauer (Strava & Garmin):`);
      if (report.stravaStats.runKm > 0)
        lines.push(`  • Laufen: ${report.stravaStats.runKm} km (${report.stravaStats.runCount} Einheiten)`);
      if (report.stravaStats.rideKm > 0)
        lines.push(`  • Radfahren: ${report.stravaStats.rideKm} km (${report.stravaStats.rideCount} Einheiten)`);
      if (report.stravaStats.totalHours > 0) lines.push(`  • Gesamtzeit: ${report.stravaStats.totalHours}h`);
      lines.push(``);
    }

    lines.push(`🎯 Trainingserfüllung: ${report.adherencePct}% (${report.completedCount}/${report.plannedCount})`);

    if (report.weekPRs.length > 0) {
      lines.push(``, `🏆 Neue Persönliche Rekorde:`);
      for (const pr of report.weekPRs) {
        lines.push(`  • ${pr.exerciseName}: ${pr.bestWeight} kg × ${pr.bestReps} Wdh (~${pr.estimated1RM} kg 1RM)`);
      }
    }

    return lines.join("\n");
  }, [report]);

  function handleCopy() {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      {/* Week Navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-zinc-100 px-2 flex items-center gap-2">
            <Calendar size={15} className="text-cyan-400" />
            {report.label}
          </span>
          <button
            onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}
            disabled={weekOffset >= 0}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer"
        >
          {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
          <span>{copied ? "Bericht kopiert!" : "Bericht als Text kopieren"}</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Adherence */}
        <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Erfüllung</span>
            <CheckCircle size={18} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{report.adherencePct}%</p>
          <p className="text-xs text-zinc-500">
            {report.completedCount} von {report.plannedCount} Einheiten absolviert
          </p>
        </div>

        {/* Gym Volume */}
        <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Gym-Volumen</span>
            <Dumbbell size={18} className="text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-400">{report.totalGymVolume.toLocaleString("de")} kg</p>
          <p className="text-xs text-zinc-500">
            {report.gymSessions} Sessions • {report.totalGymSets} Sätze
          </p>
        </div>

        {/* Endurance Stats */}
        <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Ausdauer</span>
            <Bike size={18} className="text-orange-400" />
          </div>
          <p className="text-2xl font-black text-orange-400">
            {report.stravaStats ? `${report.stravaStats.totalHours}h` : `${report.endSessions} Einheiten`}
          </p>
          <p className="text-xs text-zinc-500">
            {report.stravaStats
              ? `${report.stravaStats.rideKm} km Rad • ${report.stravaStats.runKm} km Lauf`
              : "Manuell erfasst"}
          </p>
        </div>
      </div>

      {/* PR Highlights */}
      {report.weekPRs.length > 0 && (
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-300">
              Neue Persönliche Rekorde (PRs) in diesem Zeitraum
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.weekPRs.map((pr, idx) => (
              <div key={`${pr.exerciseName}-${pr.date || idx}`} className="p-3 rounded-2xl bg-zinc-950/80 border border-amber-500/20">
                <p className="text-xs font-bold text-zinc-100">{pr.exerciseName}</p>
                <p className="text-xs text-amber-400 mt-0.5">
                  {pr.bestWeight} kg × {pr.bestReps} Wdh. (Est. 1RM: {pr.estimated1RM} kg)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
