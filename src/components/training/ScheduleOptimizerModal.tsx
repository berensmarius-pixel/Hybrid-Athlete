"use client";

import { useMemo, useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  Check,
  Dumbbell,
  Bike,
  Footprints,
  Activity,
  AlertTriangle,
  Download,
  Wand2,
  ListChecks,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { DayPlan, WorkoutType } from "@/types";
import { geminiGenerateText, extractJson, checkGeminiConfigured } from "@/lib/gemini/client";
import { buildContentPrompt, normalizeBlueprints } from "@/lib/scheduling/contentGenerator";
import { solveSchedule } from "@/lib/scheduling/solver";
import type { BusyBlockInput, ScheduledWorkout, SessionBlueprint, SolveResult } from "@/lib/scheduling/types";
import { CATEGORY_LABELS_DE } from "@/lib/scheduling/types";
import { currentMondayIso, dayFullName, weekdayIndexFromIso } from "@/lib/scheduling/time";
import { buildWeeklyIcs, downloadIcsFile } from "@/lib/scheduling/icsExport";
import { getStoredCalendarEvents, saveCalendarEvents } from "@/lib/calendar/googleCalendarService";
import { cn } from "@/lib/utils";

interface ScheduleOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOALS = [
  "Hybrid Performance (Kraft + Ausdauer)",
  "Marathon / Straßenlauf",
  "Radsport / Grand Fondo",
  "Muskelaufbau mit Grundlagenausdauer",
  "Allgemeine Fitness & Gesundheit",
];

const SPORT_ICONS: Record<string, typeof Dumbbell> = {
  gym: Dumbbell,
  cycling: Bike,
  running: Footprints,
  mobility: Activity,
};

function collectBusyBlocks(): BusyBlockInput[] {
  return getStoredCalendarEvents()
    .map((event) => {
      const dayIndex = weekdayIndexFromIso(event.date);
      if (dayIndex === null) return null;
      if (!event.startTime || !event.endTime) return null;
      const block: BusyBlockInput = {
        id: event.id,
        title: event.title,
        day_index: dayIndex,
        start_time: event.startTime,
        end_time: event.endTime,
      };
      return block;
    })
    .filter((b): b is BusyBlockInput => b !== null);
}

export default function ScheduleOptimizerModal({ isOpen, onClose }: ScheduleOptimizerModalProps) {
  const { weeklyPlan, updateWeeklyPlan } = useApp();

  const [goal, setGoal] = useState(GOALS[0]);
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [maxDailyMin, setMaxDailyMin] = useState(240);
  const [focus, setFocus] = useState("");

  const [phase, setPhase] = useState<"setup" | "generating" | "ready" | "solving" | "solved">("setup");
  const [sessions, setSessions] = useState<SessionBlueprint[]>([]);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const weekStartIso = useMemo(() => currentMondayIso(), []);

  if (!isOpen) return null;

  async function handleGenerate() {
    setError(null);
    setPhase("generating");
    try {
      const configured = await checkGeminiConfigured();
      if (!configured) {
        throw new Error("Kein Gemini API-Key konfiguriert (Einstellungen → AI).");
      }
      const prompt = buildContentPrompt({
        goal,
        weekly_hours: weeklyHours,
        focus,
        existing_plan_titles: weeklyPlan.map((d) => d.title),
      });
      const raw = await geminiGenerateText(prompt);
      const blueprints = normalizeBlueprints(extractJson(raw));
      if (blueprints.length === 0) {
        throw new Error("Die KI-Antwort enthielt keine gültigen Einheiten.");
      }
      setSessions(blueprints);
      setResult(null);
      setApplied(false);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generierung fehlgeschlagen.");
      setPhase("setup");
    }
  }

  function handleSolve() {
    setError(null);
    setPhase("solving");
    try {
      const solved = solveSchedule({
        sessions,
        busy_events: collectBusyBlocks(),
        preferences: { max_daily_training_min: maxDailyMin },
        week_start_date: weekStartIso,
      });
      setResult(solved);
      setApplied(false);
      setPhase("solved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Solver fehlgeschlagen.");
      setPhase("ready");
    }
  }

  function handleApply() {
    if (!result) return;
    const byDay = new Map<number, ScheduledWorkout>();
    for (const p of result.placements) byDay.set(p.day_index, p);

    const nextPlan: DayPlan[] = weeklyPlan.map((day) => {
      const p = byDay.get(day.dayIndex);
      if (!p) return { ...day };
      const workoutType = p.sport as WorkoutType;
      return {
        ...day,
        workoutType,
        title: p.title,
        description: `${p.start_time}–${p.end_time} Uhr · ${p.explanations[0] ?? CATEGORY_LABELS_DE[p.category]}${
          p.explanations.length > 1 ? ` · ${p.explanations[p.explanations.length - 1]}` : ""
        }`,
        isCompleted: false,
        templateId: undefined,
      };
    });
    updateWeeklyPlan(nextPlan);

    const existing = getStoredCalendarEvents();
    const newEvents = result.placements.map((p) => ({
      id: `sched_${p.date}_${p.session_id}`,
      title: p.title,
      date: p.date,
      startTime: p.start_time,
      endTime: p.end_time,
      category: "workout" as const,
      description: `Solver-Platzierung: ${p.explanations.join(" | ")}`,
      source: "local" as const,
    }));
    const mergedIds = new Set(existing.map((e) => e.id));
    saveCalendarEvents([...existing, ...newEvents.filter((e) => !mergedIds.has(e.id))]);

    setApplied(true);
  }

  function handleDownloadIcs() {
    if (!result) return;
    downloadIcsFile(
      buildWeeklyIcs(result.placements, weekStartIso),
      `hybrid-athlete-week-${weekStartIso}.ics`
    );
  }

  const busy = phase === "generating" || phase === "solving";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-cyan-950/30 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Wand2 size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                KI Wochenplanung
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                  CSP SOLVER
                </span>
              </h2>
              <p className="text-xs text-zinc-400">LLM-Inhalte + deterministische Constraint-Platzierung</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              { step: 1, label: "Inhalte (KI)", active: true },
              { step: 2, label: "Solver", active: sessions.length > 0 },
              { step: 3, label: "Übernehmen", active: !!result },
            ].map(({ step, label, active }) => (
              <div
                key={step}
                className={cn(
                  "rounded-xl border px-3 py-2 text-[11px] font-bold flex items-center gap-2",
                  active
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500"
                )}
              >
                <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-black">
                  {step}
                </span>
                {label}
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Trainingsziel
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Wochenbudget (h)
                </label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                  disabled={busy}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Tageslimit (Min)
                </label>
                <input
                  type="number"
                  min={30}
                  max={720}
                  step={15}
                  value={maxDailyMin}
                  onChange={(e) => setMaxDailyMin(Number(e.target.value))}
                  disabled={busy}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Fokus / Einschränkungen (optional)
              </label>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="z. B. Rennvorbereitung Gran Fondo, kein Training vor 8 Uhr"
                disabled={busy}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-zinc-950 text-xs font-black shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {phase === "generating" ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Generiere Microcycle...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Schritt 1: Inhalte generieren
                </>
              )}
            </button>
          </div>

          {sessions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-cyan-400" />
                  Generierte Einheiten ({sessions.length})
                </h3>
                <button
                  onClick={handleSolve}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[11px] font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-60"
                >
                  {phase === "solving" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ListChecks size={12} />
                  )}
                  Schritt 2: Slots lösen
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sessions.map((s) => {
                  const Icon = SPORT_ICONS[s.sport] ?? Activity;
                  return (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-2.5"
                    >
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-100 truncate">{s.title}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {s.duration_min} Min · {CATEGORY_LABELS_DE[s.category]} · Prio {s.priority}
                        </p>
                        {s.target_muscle_groups.length > 0 && (
                          <p className="text-[10px] text-zinc-600 truncate">{s.target_muscle_groups.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <ListChecks size={13} className="text-emerald-400" />
                  Optimierte Platzierung (Woche ab {weekStartIso})
                </h3>
                <span className="text-[10px] font-mono text-zinc-500">
                  Kosten: {result.diagnostics.total_cost} · Knoten: {result.diagnostics.nodes_explored}
                </span>
              </div>

              {result.diagnostics.warnings.map((w, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 flex items-center gap-2"
                >
                  <AlertTriangle size={13} className="shrink-0" />
                  {w}
                </div>
              ))}

              <div className="space-y-2">
                {result.placements.map((p) => {
                  const Icon = SPORT_ICONS[p.sport] ?? Activity;
                  return (
                    <div key={p.session_id} className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-100 truncate">{p.title}</p>
                            <p className="text-[10px] text-zinc-500">
                              {dayFullName(p.day_index)}, {p.date}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-bold text-cyan-300">
                            {p.start_time}–{p.end_time}
                          </p>
                          <p className="text-[10px] text-zinc-500">{p.duration_min} Min</p>
                        </div>
                      </div>
                      <ul className="space-y-0.5 pl-1">
                        {p.explanations.map((ex, i) => (
                          <li key={i} className="text-[10.5px] text-zinc-500 leading-relaxed flex gap-1.5">
                            <Check size={11} className="text-emerald-500 mt-0.5 shrink-0" />
                            {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {result.unplaced.length > 0 && (
                <div className="space-y-2">
                  {result.unplaced.map((u) => (
                    <div
                      key={u.session.id}
                      className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 space-y-1"
                    >
                      <p className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                        <AlertTriangle size={13} />
                        Nicht platziert: {u.session.title}
                      </p>
                      <p className="text-[11px] text-red-200/80">{u.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold cursor-pointer"
          >
            Schließen
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadIcs}
              disabled={!result || result.placements.length === 0}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-xs font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} />
              .ics Export
            </button>
            <button
              onClick={handleApply}
              disabled={!result || result.placements.length === 0 || applied}
              className={cn(
                "px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed",
                applied
                  ? "bg-emerald-500 text-zinc-950 shadow-emerald-500/20"
                  : "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/25"
              )}
            >
              {applied ? (
                <>
                  <Check size={15} />
                  Übernommen!
                </>
              ) : (
                <>
                  <ListChecks size={15} />
                  In Wochenplan übernehmen
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
