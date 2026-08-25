"use client";

import { useState, useMemo } from "react";
import { Plus, MoreHorizontal, Check } from "lucide-react";
import { generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import type { ExerciseEntry, ExerciseSet, LoggedSession, GymSession } from "@/types";

interface ExerciseRowProps {
  entry: ExerciseEntry;
  onChange: (patch: Partial<ExerciseEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
  loggedSessions?: LoggedSession[];
}

interface PreviousData {
  weight: number;
  reps: number;
  rir: number | null;
  /** Suggested weight for next session based on RIR */
  suggestion: number;
}

function getPreviousData(
  exercise: string,
  sessions: LoggedSession[]
): PreviousData | null {
  if (!exercise.trim()) return null;
  const lc = exercise.toLowerCase();
  // Sessions are stored newest-first in reducer, so iterate from front
  for (const s of sessions) {
    if (s.kind === "endurance") continue;
    const gymSession = s as GymSession;
    const entry = gymSession.entries?.find(
      (e) => e.exercise.toLowerCase() === lc
    );
    if (entry) {
      const ws = entry.sets.find(
        (s) => s.type === "working" && s.weight !== "" && s.reps !== ""
      );
      if (ws) {
        const weight = Number(ws.weight);
        const reps = Number(ws.reps);
        const rir = ws.rir !== undefined && ws.rir !== "" ? Number(ws.rir) : null;
        // Weight suggestion: if RIR ≤ 2 → +2.5 kg; else hold
        const suggestion = rir !== null && rir <= 2 ? weight + 2.5 : weight;
        return { weight, reps, rir, suggestion };
      }
    }
  }
  return null;
}

export default function ExerciseRow({
  entry,
  onChange,
  onRemove,
  canRemove,
  loggedSessions = [],
}: ExerciseRowProps) {
  const { gymTemplates } = useApp();
  const sets = entry.sets || [];
  const [showMenu, setShowMenu] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [note, setNote] = useState("");
  const previous = getPreviousData(entry.exercise, loggedSessions);

  const allExerciseNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of gymTemplates) {
      for (const ex of t.exercises) { if (ex.name) names.add(ex.name); }
    }
    for (const s of loggedSessions) {
      if (s.kind === "endurance") continue;
      for (const e of (s as GymSession).entries) { if (e.exercise) names.add(e.exercise); }
    }
    return [...names].sort();
  }, [gymTemplates, loggedSessions]);

  const suggestions = useMemo(() => {
    const q = entry.exercise.toLowerCase();
    if (!q) return [];
    return allExerciseNames
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, 6);
  }, [entry.exercise, allExerciseNames]);

  function addSet() {
    const last = sets[sets.length - 1];
    onChange({
      sets: [
        ...sets,
        {
          id: generateId(),
          type: "working",
          weight: last?.weight ?? "",
          reps: last?.reps ?? "",
          isCompleted: false,
        },
      ],
    });
  }

  function addWarmupSet() {
    onChange({
      sets: [{ id: generateId(), type: "warmup", weight: "", reps: "", isCompleted: false }, ...sets],
    });
    setShowMenu(false);
  }

  function updateSet(id: string, patch: Partial<ExerciseSet>) {
    onChange({ sets: sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function toggleComplete(id: string) {
    const target = sets.find((s) => s.id === id);
    if (!target) return;
    if (!target.isCompleted && (target.weight === "" || target.reps === "")) return;
    updateSet(id, { isCompleted: !target.isCompleted });
  }

  let workingIndex = 0;

  return (
    <div className="mb-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1 px-1">
        <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 text-sm">
          💪
        </div>
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={entry.exercise}
            onChange={(e) => onChange({ exercise: e.target.value })}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setTimeout(() => setInputFocused(false), 150)}
            placeholder="Übungsname"
            className="w-full bg-transparent text-sm font-bold text-blue-400 placeholder-blue-400/40 focus:outline-none"
          />
          {inputFocused && suggestions.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[200px]">
              {suggestions.map((name) => (
                <button
                  key={name}
                  onMouseDown={() => onChange({ exercise: name })}
                  className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Übungsoptionen"
            className="p-2 -m-1 text-zinc-500 hover:text-zinc-300 rounded"
          >
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-7 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[160px]">
              <button
                onClick={addWarmupSet}
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                + Aufwärmsatz
              </button>
              <button
                onClick={() => { if (canRemove) { onRemove(); } setShowMenu(false); }}
                disabled={!canRemove}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-700 disabled:opacity-30 disabled:pointer-events-none"
              >
                Übung entfernen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progression hint */}
      {previous && (
        <div className="flex items-center gap-1.5 px-1 mb-1 flex-wrap">
          <span className="text-[10px] text-zinc-600">Letztes Mal:</span>
          <span className="text-[10px] text-zinc-400 font-medium">
            {previous.weight} kg × {previous.reps} Wdh
            {previous.rir !== null ? ` · RIR ${previous.rir}` : ""}
          </span>
          {previous.suggestion > previous.weight && (
            <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full">
              ↑ {previous.suggestion} kg empfohlen
            </span>
          )}
        </div>
      )}

      {/* Note */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notizen hier hinzufügen…"
        className="w-full bg-transparent text-xs text-zinc-500 placeholder-zinc-600 focus:outline-none px-1 mb-2"
      />

      {/* Pause timer indicator */}
      <div className="flex items-center gap-1.5 px-1 mb-3">
        <span className="text-blue-400 text-xs">⏱</span>
        <span className="text-xs text-blue-400 font-medium">Pausentimer: AUS</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[26px_minmax(0,1fr)_52px_52px_46px_40px] sm:grid-cols-[28px_1fr_60px_60px_52px_36px] gap-1 px-1 mb-1">
        <div className="text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">SET</div>
        <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">VORHERIGE</div>
        <div className="text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">KG</div>
        <div className="text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">WDH</div>
        <div className="text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">RPE</div>
        <div className="text-center text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">✓</div>
      </div>

      {/* Sets */}
      <div className="space-y-1">
        {sets.map((set) => {
          const isWarmup = set.type === "warmup";
          const isCompleted = !!set.isCompleted;
          if (!isWarmup) workingIndex++;
          const label = isWarmup ? "W" : String(workingIndex);
          const prevLabel = previous
            ? `${previous.weight}kg×${previous.reps}${previous.rir !== null ? ` R${previous.rir}` : ""}`
            : "—";

          return (
            <div
              key={set.id}
              className={`grid grid-cols-[26px_minmax(0,1fr)_52px_52px_46px_40px] sm:grid-cols-[28px_1fr_60px_60px_52px_36px] gap-1 items-center rounded-xl px-1 py-2 transition-colors ${
                isCompleted ? "bg-blue-600/15" : "bg-transparent"
              }`}
            >
              <div className={`text-center text-xs font-bold ${isWarmup ? "text-yellow-400" : "text-zinc-400"}`}>
                {label}
              </div>
              <div className="text-xs text-zinc-500 truncate">{prevLabel}</div>
              <input
                type="number"
                value={set.weight !== "" ? set.weight : ""}
                onChange={(e) =>
                  updateSet(set.id, { weight: e.target.value !== "" ? Number(e.target.value) : "", isCompleted: false })
                }
                placeholder="—"
                className="w-full bg-zinc-800 rounded-md px-1 py-1.5 text-xs text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-600"
              />
              <input
                type="number"
                value={set.reps !== "" ? set.reps : ""}
                onChange={(e) =>
                  updateSet(set.id, { reps: e.target.value !== "" ? Number(e.target.value) : "", isCompleted: false })
                }
                placeholder="—"
                className="w-full bg-zinc-800 rounded-md px-1 py-1.5 text-xs text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-600"
              />
              <input
                type="number"
                min="1"
                max="10"
                value={set.rpe !== undefined && set.rpe !== "" ? set.rpe : ""}
                onChange={(e) =>
                  updateSet(set.id, { rpe: e.target.value !== "" ? Number(e.target.value) : "" })
                }
                placeholder="RPE"
                className="w-full bg-zinc-800 rounded-md px-1 py-1.5 text-xs text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-zinc-600"
              />
              <button
                onClick={() => toggleComplete(set.id)}
                aria-label={isCompleted ? "Satz abgeschlossen" : "Satz abschließen"}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all mx-auto ${
                  isCompleted ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-600 hover:text-zinc-300"
                }`}
              >
                <Check size={15} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add set */}
      <button
        onClick={addSet}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 rounded-lg text-xs font-semibold text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
      >
        <Plus size={14} />
        Satz hinzufügen
      </button>
    </div>
  );
}
