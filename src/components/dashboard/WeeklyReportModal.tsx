"use client";

import { useMemo, useState } from "react";
import { X, Copy, CheckCircle2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats, getDateForDayIndex, getStravaCompletedDays } from "@/lib/stravaUtils";
import type { GymSession, EnduranceSession } from "@/types";

interface WeeklyReportModalProps {
  onClose: () => void;
}

export default function WeeklyReportModal({ onClose }: WeeklyReportModalProps) {
  const { loggedSessions, weeklyPlan, personalRecords } = useApp();
  const { activities, connection } = useStrava();
  const [copied, setCopied] = useState(false);
  
  // Navigation states
  const [weekOffset, setWeekOffset] = useState(0);
  const [mode, setMode] = useState<"week" | "range">("week");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0]);

  const range = useMemo(() => {
    if (mode === "range") {
      const start = new Date(customStart);
      start.setHours(0,0,0,0);
      const end = new Date(customEnd);
      end.setHours(23,59,59,999);
      return { start, end, label: `${new Date(customStart).toLocaleDateString("de-DE")} – ${new Date(customEnd).toLocaleDateString("de-DE")}` };
    }

    const today = new Date();
    const jsDay = today.getDay();
    const toMon = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + toMon + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const label = weekOffset === 0 
      ? "Diese Woche" 
      : weekOffset === -1 
        ? "Letzte Woche" 
        : `${monday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${sunday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

    return { start: monday, end: sunday, label };
  }, [weekOffset, mode, customStart, customEnd]);

  const report = useMemo(() => {
    const { start, end, label } = range;

    // Sessions in range
    const sessionsInRange = loggedSessions.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    // Gym stats
    const gymSessions = sessionsInRange.filter((s) => s.kind === "gym") as GymSession[];
    const totalGymVolume = gymSessions.reduce((acc, s) =>
      acc + s.entries.reduce((a, e) =>
        a + e.sets.reduce((b, set) =>
          b + (set.isCompleted ? (Number(set.weight) || 0) * (Number(set.reps) || 0) : 0), 0), 0), 0);
    const totalGymSets = gymSessions.reduce((acc, s) =>
      acc + s.entries.reduce((a, e) => a + e.sets.filter((set) => set.isCompleted).length, 0), 0);

    // Endurance stats (manual)
    const endSessions = sessionsInRange.filter((s) => s.kind === "endurance" && !(s as EnduranceSession).stravaId) as EnduranceSession[];

    // Strava stats
    const stravaStats = connection.isConnected ? getWeekStats(activities, range) : null;

    // Adherence
    const plannedDays = weeklyPlan.filter((d) => d.workoutType !== "rest");
    const stravaCompleted = connection.isConnected ? getStravaCompletedDays(activities, weeklyPlan, range) : new Set<number>();
    const manualCompleted = new Set<number>();
    
    for (const day of plannedDays) {
      const has = sessionsInRange.some((s) => {
        const d = new Date(s.date);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        if (dayIdx !== day.dayIndex) return false;
        
        if (day.workoutType === "gym" && s.kind === "gym") return true;
        if (day.workoutType === "running" && s.kind === "endurance" && (s as EnduranceSession).activityType === "running") return true;
        if (day.workoutType === "cycling" && s.kind === "endurance" && (s as EnduranceSession).activityType === "cycling") return true;
        return false;
      });
      if (has) manualCompleted.add(day.dayIndex);
    }
    const completedCount = plannedDays.filter((d) => stravaCompleted.has(d.dayIndex) || manualCompleted.has(d.dayIndex)).length;
    const adherencePct = plannedDays.length > 0 ? Math.round((completedCount / plannedDays.length) * 100) : 0;

    // PRs in range
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
      `📊 Bericht: ${report.label}`,
      ``,
      `🏋️ Krafttraining`,
      `  Sessions: ${report.gymSessions}`,
      `  Sätze: ${report.totalGymSets}`,
      `  Volumen: ${report.totalGymVolume.toLocaleString("de")} kg`,
      ``,
    ];

    if (report.stravaStats) {
      lines.push(`🏃 Ausdauer (Strava)`);
      if (report.stravaStats.runKm > 0) lines.push(`  Laufen: ${report.stravaStats.runKm} km (${report.stravaStats.runCount} Einheiten)`);
      if (report.stravaStats.rideKm > 0) lines.push(`  Radfahren: ${report.stravaStats.rideKm} km (${report.stravaStats.rideCount} Einheiten)`);
      if (report.stravaStats.totalHours > 0) lines.push(`  Gesamt: ${report.stravaStats.totalHours}h`);
      lines.push(``);
    } else if (report.endSessions > 0) {
      lines.push(`🏃 Ausdauer: ${report.endSessions} Einheiten`, ``);
    }

    lines.push(
      `🎯 Trainingserfüllung: ${report.adherencePct}% (${report.completedCount}/${report.plannedCount})`,
      ``
    );

    if (report.weekPRs.length > 0) {
      lines.push(`🏆 Neue Persönliche Rekorde:`);
      for (const pr of report.weekPRs) {
        lines.push(`  • ${pr.exerciseName}: ${pr.bestWeight} kg × ${pr.bestReps} Wdh (~${pr.estimated1RM} kg 1RM)`);
      }
      lines.push(``);
    }

    lines.push(`Erstellt mit Hybrid Athlete App`);
    return lines.join("\n");
  }, [report]);

  function handleCopy() {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      <div className="flex-1 flex flex-col h-full p-6 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-100">Bericht</h2>
            <div className="flex bg-zinc-800 rounded-lg p-0.5 ml-1">
              <button 
                onClick={() => setMode("week")}
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${mode === "week" ? "bg-zinc-700 text-blue-400" : "text-zinc-500"}`}
              >
                WOCHE
              </button>
              <button 
                onClick={() => setMode("range")}
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${mode === "range" ? "bg-zinc-700 text-blue-400" : "text-zinc-500"}`}
              >
                BEREICH
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Navigation / Range Picker */}
        <div className="shrink-0 space-y-3">
          {mode === "week" ? (
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2 rounded-xl">
              <button 
                onClick={() => setWeekOffset(v => v - 1)}
                className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                title="Vorherige Woche"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <p className="text-sm font-bold text-zinc-100 leading-none">{report.label}</p>
                {weekOffset !== 0 && (
                  <button 
                    onClick={() => setWeekOffset(0)}
                    className="text-[10px] text-blue-400 font-semibold mt-1"
                  >
                    ZU HEUTE
                  </button>
                )}
              </div>
              <button 
                onClick={() => setWeekOffset(v => v + 1)}
                className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                title="Nächste Woche"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-xl">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Start</label>
                <input 
                  type="date" 
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Ende</label>
                <input 
                  type="date" 
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1">Kraft-Volumen</p>
            <p className="text-lg font-bold text-blue-400">{report.totalGymVolume.toLocaleString("de")} kg</p>
            <p className="text-[10px] text-zinc-600">{report.gymSessions} Sessions · {report.totalGymSets} Sätze</p>
          </div>

          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1">Erfüllung</p>
            <p className="text-lg font-bold text-green-400">{report.adherencePct}%</p>
            <p className="text-[10px] text-zinc-600">{report.completedCount} / {report.plannedCount} geplant</p>
          </div>

          {report.stravaStats && report.stravaStats.runKm > 0 && (
            <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1">Laufen</p>
              <p className="text-lg font-bold text-green-400">{report.stravaStats.runKm} km</p>
              <p className="text-[10px] text-zinc-600">{report.stravaStats.runCount} Einheiten</p>
            </div>
          )}

          {report.stravaStats && report.stravaStats.rideKm > 0 && (
            <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/40">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mb-1">Radfahren</p>
              <p className="text-lg font-bold text-orange-400">{report.stravaStats.rideKm} km</p>
              <p className="text-[10px] text-zinc-600">{report.stravaStats.rideCount} Einheiten</p>
            </div>
          )}
        </div>

        {/* PRs */}
        {report.weekPRs.length > 0 && (
          <div className="shrink-0 p-3 rounded-xl bg-amber-500/10 border border-amber-400/20">
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-2">🏆 Neue Rekorde diese Woche</p>
            <ul className="space-y-1">
              {report.weekPRs.map((pr) => (
                <li key={pr.exerciseName} className="text-xs text-zinc-300">
                  <span className="font-semibold text-amber-300">{pr.exerciseName}</span>
                  {" "}— {pr.bestWeight} kg × {pr.bestReps} Wdh · ~{pr.estimated1RM} kg 1RM
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Raw text preview */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <pre className="text-[11px] text-zinc-500 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-800/40 rounded-xl p-3 border border-zinc-700/30">
            {reportText}
          </pre>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="shrink-0 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold text-sm transition-colors"
        >
          {copied ? <CheckCircle2 size={16} className="text-green-400" /> : <Copy size={16} />}
          {copied ? "Kopiert!" : "In Zwischenablage kopieren"}
        </button>
      </div>
    </div>
  );
}
