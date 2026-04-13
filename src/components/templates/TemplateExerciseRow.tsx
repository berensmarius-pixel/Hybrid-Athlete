"use client";

import { useState } from "react";
import { Trash2, Plus, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { generateId } from "@/lib/utils";
import { CATEGORY_COLORS, WGER_BASE } from "@/lib/wgerApi";
import type { TemplateExercise, TemplateSet } from "@/types";
import type { WgerExerciseInfo } from "@/lib/wgerApi";
import ExerciseSearchInput from "./ExerciseSearchInput";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the English category key from a German muscle group name. */
function deToEn(de: string): string {
  const map: Record<string, string> = {
    Arme: "Arms", Beine: "Legs", Bauch: "Abs", Brust: "Chest",
    Rücken: "Back", Schultern: "Shoulders", Waden: "Calves",
    Cardio: "Cardio", Nacken: "Neck", Gesäß: "Glutes",
  };
  return map[de] ?? de;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateExerciseRowProps {
  exercise: TemplateExercise;
  onChange: (patch: Partial<TemplateExercise>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateExerciseRow({
  exercise,
  onChange,
  onRemove,
  canRemove,
}: TemplateExerciseRowProps) {
  const sets = exercise.sets || [];
  const [showDesc, setShowDesc] = useState(false);

  // ── Set helpers ──────────────────────────────────────────────────────────────

  function addSet() {
    onChange({
      sets: [...sets, { id: generateId(), type: "working", targetReps: 8 }],
    });
  }

  function updateSet(id: string, patch: Partial<TemplateSet>) {
    onChange({ sets: sets.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function removeSet(id: string) {
    onChange({ sets: sets.filter((s) => s.id !== id) });
  }

  // ── Wger handler ─────────────────────────────────────────────────────────────

  function handleWgerSelect(info: WgerExerciseInfo) {
    onChange({
      name:        info.name,
      wgerId:      info.wgerId,
      description: info.description || undefined,
      muscleGroup: info.muscleGroup || undefined,
      muscles:     info.muscles.length > 0 ? info.muscles : undefined,
      imageUrl:    info.imageUrl ?? undefined,
    });
  }

  // ── Derived display values ───────────────────────────────────────────────────

  const catKey   = exercise.muscleGroup ? deToEn(exercise.muscleGroup) : null;
  const catColor = catKey ? (CATEGORY_COLORS[catKey] ?? "text-zinc-400 bg-zinc-700/40 border-zinc-600/40") : null;
  const hasDesc  = !!exercise.description;
  const descPreview = exercise.description
    ? exercise.description.slice(0, 110) + (exercise.description.length > 110 ? "…" : "")
    : "";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700/50 overflow-hidden mb-3">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 items-start px-3 py-2.5 bg-zinc-800/40 border-b border-zinc-700/50">

        {/* Thumbnail (only when enriched) */}
        {exercise.imageUrl && (
          <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-zinc-700 border border-zinc-600/40 mt-0.5">
            <img
              src={exercise.imageUrl}
              alt={exercise.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Search input */}
          <div className="flex gap-2 items-center">
            <ExerciseSearchInput
              name={exercise.name}
              onChangeName={(name) => onChange({ name })}
              onSelectWger={handleWgerSelect}
            />

            <button
              onClick={onRemove}
              disabled={!canRemove}
              className="p-1.5 shrink-0 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-700/60 transition-colors disabled:opacity-25 disabled:pointer-events-none"
              aria-label="Übung entfernen"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Meta row: muscle group badge + description toggle */}
          {(exercise.muscleGroup || hasDesc) && (
            <div className="flex items-center gap-2 flex-wrap">
              {exercise.muscleGroup && catColor && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor}`}>
                  {exercise.muscleGroup}
                </span>
              )}

              {exercise.muscles && exercise.muscles.length > 0 && (
                <span className="text-[10px] text-zinc-500 truncate max-w-[200px]">
                  {exercise.muscles.slice(0, 2).join(" · ")}
                </span>
              )}

              {hasDesc && (
                <button
                  onClick={() => setShowDesc((v) => !v)}
                  className="flex items-center gap-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
                >
                  {showDesc ? (
                    <><ChevronUp size={11} /> Weniger</>
                  ) : (
                    <><ChevronDown size={11} /> Info</>
                  )}
                </button>
              )}

              {exercise.wgerId && (
                <a
                  href={`${WGER_BASE}/en/exercise/${exercise.wgerId}/view/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-blue-400 transition-colors ml-1"
                  title="Auf Wger ansehen"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}

          {/* Description (expandable) */}
          {showDesc && exercise.description && (
            <p className="text-xs text-zinc-400 leading-relaxed border-t border-zinc-700/40 pt-1.5 mt-1">
              {exercise.description}
            </p>
          )}

          {/* Description preview (collapsed) */}
          {!showDesc && hasDesc && (
            <p className="text-[11px] text-zinc-600 leading-snug">
              {descPreview}
            </p>
          )}
        </div>
      </div>

      {/* ── Sets ────────────────────────────────────────────────────────────── */}
      <div className="p-2 space-y-1">
        {sets.length > 0 && (
          <div className="flex gap-2 px-2 pb-1 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
            <div className="w-6 text-center">Set</div>
            <div className="w-[85px]">Typ</div>
            <div className="flex-1 text-center">Wdh / Dauer</div>
            <div className="w-[60px] text-center">RIR</div>
            <div className="w-8" />
          </div>
        )}

        {sets.map((set, index) => (
          <div
            key={set.id}
            className="flex items-center gap-2 bg-zinc-800/60 rounded-lg p-1.5 border border-zinc-700/40"
          >
            <div className="w-6 text-center text-xs font-mono text-zinc-500">
              {index + 1}
            </div>

            <select
              value={set.type}
              onChange={(e) =>
                updateSet(set.id, { type: e.target.value as TemplateSet["type"] })
              }
              className="w-[85px] bg-zinc-900 border border-zinc-700 rounded-md px-1 py-1 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/60"
            >
              <option value="warmup">Aufwärmen</option>
              <option value="working">Arbeitssatz</option>
              <option value="drop">Dropsatz</option>
            </select>

            <div className="flex-1 flex gap-1">
              <input
                type="number"
                value={set.targetReps ?? ""}
                onChange={(e) =>
                  updateSet(set.id, {
                    targetReps: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Wdh"
                className="w-1/2 bg-zinc-900 border border-zinc-700 rounded-md px-1 py-1 text-xs text-zinc-100 text-center focus:outline-none focus:border-blue-500/60 placeholder-zinc-700"
              />
              <input
                type="number"
                value={set.targetDuration ?? ""}
                onChange={(e) =>
                  updateSet(set.id, {
                    targetDuration: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="Sek"
                className="w-1/2 bg-zinc-900 border border-zinc-700 rounded-md px-1 py-1 text-xs text-zinc-100 text-center focus:outline-none focus:border-blue-500/60 placeholder-zinc-700"
              />
            </div>

            <input
              type="number"
              value={set.targetRir ?? ""}
              onChange={(e) =>
                updateSet(set.id, {
                  targetRir: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="RIR"
              className="w-[60px] bg-zinc-900 border border-zinc-700 rounded-md px-1 py-1 text-xs text-zinc-100 text-center focus:outline-none focus:border-blue-500/60 placeholder-zinc-700"
            />

            <button
              onClick={() => removeSet(set.id)}
              disabled={sets.length <= 1}
              className="w-8 flex items-center justify-center p-1 text-zinc-600 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        <button
          onClick={addSet}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1 rounded-lg text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
        >
          <Plus size={12} />
          Satz hinzufügen
        </button>
      </div>
    </div>
  );
}
