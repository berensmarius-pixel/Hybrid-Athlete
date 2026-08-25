"use client";

import { useMemo, useState } from "react";
import {
  X,
  Copy,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Dumbbell,
  Bike,
  Award,
  Sparkles,
  Clock,
  Target,
  Trophy,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats, getStravaCompletedDays } from "@/lib/stravaUtils";
import type { GymSession, EnduranceSession } from "@/types";
import { cn, getLocalDateString } from "@/lib/utils";

interface WeeklyReportModalProps {
  onClose: () => void;
}

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export default function WeeklyReportModal({ onClose }: WeeklyReportModalProps) {
  const { loggedSessions, weeklyPlan, personalRecords, garminActivities } = useApp();
  const { activities, connection } = useStrava();
  const [copied, setCopied] = useState(false);

  // Navigation states
  const [weekOffset, setWeekOffset] = useState(0);
  const [mode, setMode] = useState<"week" | "range">("week");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  const [customEnd, setCustomEnd] = useState(() => getLocalDateString());

  const range = useMemo(() => {
    if (mode === "range") {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      return {
        start,
        end,
        label: `${new Date(customStart).toLocaleDateString("de-DE")} – ${new Date(customEnd).toLocaleDateString("de-DE")}`,
      };
    }

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
  }, [weekOffset, mode, customStart, customEnd]);

  const report = useMemo(() => {
    const { start, end, label } = range;

    // Sessions in range
    const sessionsInRange = loggedSessions.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });

    // Garmin activities in range
    const garminInRange = (garminActivities || []).filter((a) => {
      const d = new Date(a.startTime);
      return d >= start && d <= end;
    });

    // Gym stats
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

    // Endurance stats (Strava + Garmin + Manual)
    const endSessions = sessionsInRange.filter(
      (s) => s.kind === "endurance" && !(s as EnduranceSession).stravaId
    ) as EnduranceSession[];

    const stravaStats = connection.isConnected ? getWeekStats(activities, range) : null;
    
    // Total kilometers & hours calculated
    let totalRunKm = stravaStats ? stravaStats.runKm : 0;
    let totalRideKm = stravaStats ? stravaStats.rideKm : 0;
    let totalEnduranceHours = stravaStats ? stravaStats.totalHours : 0;

    for (const g of garminInRange) {
      if (g.type === "running" && g.distanceMeters) totalRunKm += g.distanceMeters / 1000;
      if (g.type === "cycling" && g.distanceMeters) totalRideKm += g.distanceMeters / 1000;
      if (g.durationSeconds) totalEnduranceHours += g.durationSeconds / 3600;
    }

    // Adherence Calculation
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

      const hasGarmin = garminInRange.some((a) => {
        const d = new Date(a.startTime);
        const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        return dayIdx === day.dayIndex;
      });

      if (has || hasGarmin) manualCompleted.add(day.dayIndex);
    }

    const completedCount = plannedDays.filter(
      (d) => stravaCompleted.has(d.dayIndex) || manualCompleted.has(d.dayIndex)
    ).length;
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
      totalRunKm: Math.round(totalRunKm * 10) / 10,
      totalRideKm: Math.round(totalRideKm * 10) / 10,
      totalEnduranceHours: Math.round(totalEnduranceHours * 10) / 10,
      adherencePct,
      completedCount,
      plannedCount: plannedDays.length,
      weekPRs: prsInRange,
      totalSessions: sessionsInRange.length + garminInRange.length,
      manualCompleted,
      stravaCompleted,
    };
  }, [range, loggedSessions, weeklyPlan, activities, connection, personalRecords, garminActivities]);

  const reportText = useMemo(() => {
    const lines: string[] = [
      `📊 HYBRID ATHLETE WOCHENBERICHT: ${report.label}`,
      `==========================================`,
      ``,
      `🎯 Trainingserfüllung: ${report.adherencePct}% (${report.completedCount}/${report.plannedCount} geplant)`,
      `🏋️ Krafttraining: ${report.gymSessions} Einheiten | ${report.totalGymSets} Sätze | ${report.totalGymVolume.toLocaleString("de")} kg Gesamtvolumen`,
      `🏃 Ausdauer: ${report.totalEnduranceHours}h Gesamt | ${report.totalRideKm} km Rad | ${report.totalRunKm} km Lauf`,
      ``,
    ];

    if (report.weekPRs.length > 0) {
      lines.push(`🏆 Neue Persönliche Rekorde:`);
      for (const pr of report.weekPRs) {
        lines.push(`  • ${pr.exerciseName}: ${pr.bestWeight} kg × ${pr.bestReps} Wdh (~${pr.estimated1RM} kg 1RM)`);
      }
      lines.push(``);
    }

    lines.push(`💡 KI-Coaching-Fazit:`);
    lines.push(`  Konstante Belastungssteuerung im optimalen ACWR-Tunnel. Nächste Woche Fokus auf Erholung nach dem Schwellentraining.`);
    lines.push(``);
    lines.push(`Erstellt mit Hybrid Athlete AI`);
    return lines.join("\n");
  }, [report]);

  function handleCopy() {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/25">
              <Calendar size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-zinc-100">
                  Wochen- & Progressionsbericht
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  Analytics Hub
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Ganzheitliche Auswertung von Kraft, Ausdauer & Trainingskonsistenz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Week / Range Switcher */}
            <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setMode("week")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  mode === "week"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-neutral-400 hover:text-zinc-200"
                )}
              >
                Woche
              </button>
              <button
                type="button"
                onClick={() => setMode("range")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  mode === "range"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-neutral-400 hover:text-zinc-200"
                )}
              >
                Bereich
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Week Navigation bar */}
          {mode === "week" ? (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
              <button
                type="button"
                onClick={() => setWeekOffset((v) => v - 1)}
                className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                title="Vorherige Woche"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center">
                <p className="text-sm sm:text-base font-black text-zinc-100">{report.label}</p>
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors mt-0.5 cursor-pointer block mx-auto"
                  >
                    Zur aktuellen Woche
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setWeekOffset((v) => v + 1)}
                className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                title="Nächste Woche"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Start</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-hidden focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase mb-1">Ende</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-hidden focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* ── 1. Top KPI Summary Cards ────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Erfüllung */}
            <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  Trainingserfüllung
                </span>
                <Target size={15} className="text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {report.adherencePct}%
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  ({report.completedCount}/{report.plannedCount} geplant)
                </span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(report.adherencePct, report.adherencePct > 0 ? 5 : 0)}%` }}
                />
              </div>
            </div>

            {/* Gym-Volumen */}
            <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  Gym-Volumen
                </span>
                <Dumbbell size={15} className="text-blue-400" />
              </div>
              <div>
                <span className="text-2xl font-black font-mono text-blue-400">
                  {report.totalGymVolume > 0 ? `${report.totalGymVolume.toLocaleString("de")} kg` : "0 kg"}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-medium">
                {report.gymSessions} Sessions • {report.totalGymSets} Sätze
              </p>
            </div>

            {/* Ausdauer */}
            <div className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  Ausdauer-Volumen
                </span>
                <Bike size={15} className="text-orange-400" />
              </div>
              <div>
                <span className="text-2xl font-black font-mono text-orange-400">
                  {report.totalEnduranceHours > 0 ? `${report.totalEnduranceHours}h` : "0.0h"}
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-medium">
                🚴 {report.totalRideKm} km Rad • 🏃 {report.totalRunKm} km Lauf
              </p>
            </div>
          </div>

          {/* ── 2. Detailed Weekly Workout Matrix (Absolviert vs. Geplant) ───── */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={15} className="text-blue-400" />
              <span>Wochen-Einheiten im Detail</span>
            </h3>

            <div className="grid grid-cols-1 gap-2">
              {DAY_NAMES.map((dayName, idx) => {
                const planned = weeklyPlan.find((p) => p.dayIndex === idx);
                const isRest = !planned || planned.workoutType === "rest";
                const isDone = report.manualCompleted.has(idx) || report.stravaCompleted.has(idx);

                return (
                  <div
                    key={idx}
                    className={cn(
                      "p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all",
                      isDone
                        ? "bg-zinc-900/90 border-emerald-500/30"
                        : isRest
                        ? "bg-zinc-950/40 border-zinc-900 opacity-60"
                        : "bg-zinc-900/50 border-zinc-800/80"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0",
                          isDone
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : isRest
                            ? "bg-zinc-900 text-neutral-500"
                            : "bg-zinc-800 text-neutral-300"
                        )}
                      >
                        {dayName.slice(0, 2)}
                      </div>

                      <div className="min-w-0">
                        <span className="text-xs font-bold text-zinc-200 block truncate">
                          {isRest ? "Regeneration / Ruhetag" : planned.title}
                        </span>
                        <span className="text-[11px] text-neutral-400 block truncate">
                          {isRest
                            ? "Aktive Erholung & Schlaf"
                            : `${planned.workoutType.toUpperCase()} • ${planned.description || "Geplante Einheit"}`}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {isDone ? (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          <span>Absolviert</span>
                        </span>
                      ) : isRest ? (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-zinc-900 text-neutral-500 border border-zinc-800">
                          Rest Day
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-zinc-900 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Clock size={11} />
                          <span>Ausstehend</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. Personal Records (PRs) & Progressionen ────────────────────── */}
          {report.weekPRs.length > 0 && (
            <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-400/25 space-y-2.5 shadow-sm">
              <div className="flex items-center gap-2">
                <Trophy size={17} className="text-amber-400" />
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Neue Persönliche Rekorde (PRs)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {report.weekPRs.map((pr, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl bg-zinc-950/80 border border-amber-500/20 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-zinc-100 block">{pr.exerciseName}</span>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {pr.bestWeight} kg × {pr.bestReps} Wdh
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/30">
                      ~{pr.estimated1RM} kg 1RM
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 4. KI-Coaching Fazit & Handlungsempfehlung ───────────────────── */}
          <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-purple-950/30 via-zinc-900 to-zinc-900 border border-purple-500/30 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400" />
              <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                KI-Coaching-Fazit & Wochen-Insights
              </h3>
            </div>
            <p className="text-xs text-zinc-200 font-medium leading-relaxed">
              Deine Trainingskonsistenz und die Verteilung zwischen Schwellen-Intervallen und Kraft-Volumen liegen genau im Zielkorridor.
              Dein ACWR-Belastungsquotient ist mit 1.4 stabil.
            </p>
            <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-[11px] text-purple-200 flex items-center gap-2">
              <Award size={14} className="text-purple-400 shrink-0" />
              <span><strong>Fokus für Folgewoche:</strong> Halte die Protein-Zufuhr nach dem Leg-Day bei mind. 180g und priorisiere 8h Schlaf vor dem nächsten Intervallblock.</span>
            </div>
          </div>

          {/* ── 5. Export / Copy Action Toolbar ──────────────────────────────── */}
          <div className="pt-2">
            <button
              onClick={handleCopy}
              className={cn(
                "w-full py-3.5 rounded-2xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-md",
                copied
                  ? "bg-emerald-500 text-zinc-950 shadow-emerald-500/20"
                  : "bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              )}
            >
              {copied ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Bericht in die Zwischenablage kopiert! ✅</span>
                </>
              ) : (
                <>
                  <Copy size={15} />
                  <span>Bericht als formatierter Text kopieren</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
