"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus, Zap, Trash2, ShieldCheck } from "lucide-react";
import TemplateExerciseRow from "@/components/templates/TemplateExerciseRow";
import { generateId } from "@/lib/utils";
import type { GymTemplate, TemplateExercise } from "@/types";
import {
  buildSupersetPlan,
  applySupersetPlan,
  clearSupersets,
} from "@/lib/strength/superset-optimizer";

import { WORKOUT_COLORS } from "@/lib/utils";

const GYM_TYPES: GymTemplate["type"][] = ["gym", "stretching", "warmup", "mobility"];
const GYM_TYPE_LABELS: Record<GymTemplate["type"], string> = {
  gym: "Krafttraining",
  stretching: "Dehnen",
  warmup: "Aufwärmen",
  mobility: "Mobilität",
};

interface GymTemplateEditorModalProps {
  template?: GymTemplate;
  onSave: (template: GymTemplate) => void;
  onClose: () => void;
}

function emptyExercise(): TemplateExercise {
  return {
    id: generateId(),
    name: "",
    sets: [{ id: generateId(), type: "working", targetReps: 8 }],
  };
}

interface SupersetSummary {
  pairLabels: string[];
  savedMinutes: number;
  savedPct: number;
  skippedSpinalNames: string[];
}

function sanitizeSupersets(exercises: TemplateExercise[]): TemplateExercise[] {
  const counts = new Map<string, number>();
  exercises.forEach((ex) => {
    if (ex.supersetId) counts.set(ex.supersetId, (counts.get(ex.supersetId) ?? 0) + 1);
  });
  return exercises.map((ex) =>
    ex.supersetId && counts.get(ex.supersetId) === 2
      ? ex
      : { ...ex, supersetId: undefined, supersetOrder: undefined }
  );
}

export default function GymTemplateEditorModal({ template, onSave, onClose }: GymTemplateEditorModalProps) {
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<GymTemplate["type"]>(template?.type ?? "gym");
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    template?.exercises.map((e) => ({ ...e })) ?? [emptyExercise()]
  );
  const [nameError, setNameError] = useState(false);
  const [supersetSummary, setSupersetSummary] = useState<SupersetSummary | null>(null);

  const hasSupersets = exercises.some((ex) => !!ex.supersetId);
  const namedExercises = exercises.filter((ex) => ex.name.trim() !== "");
  const canOptimize = type === "gym" && namedExercises.length >= 2;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function updateExercise(id: string, patch: Partial<TemplateExercise>) {
    setExercises((prev) => prev.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex)));
  }

  function removeExercise(id: string) {
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  }

  function handleConvertToSupersets() {
    if (!canOptimize || hasSupersets) return;
    const plan = buildSupersetPlan(namedExercises);
    const applied = applySupersetPlan(namedExercises, plan);
    const byId = new Map(applied.map((ex) => [ex.id, ex]));
    setExercises((prev) => prev.map((ex) => byId.get(ex.id) ?? ex));
    setSupersetSummary({
      pairLabels: plan.pairs.map((p) => p.shortLabel),
      savedMinutes: Math.max(1, Math.round(plan.estimatedSecondsSaved / 60)),
      savedPct: plan.estimatedTimeSavedPct,
      skippedSpinalNames: plan.skippedSpinalExercises.map((s) => s.name),
    });
  }

  function handleClearSupersets() {
    setExercises((prev) => clearSupersets(prev.map((ex) => ({ ...ex }))));
    setSupersetSummary(null);
  }

  function handleSave() {
    if (!name.trim()) { setNameError(true); return; }
    onSave({
      id: template?.id ?? generateId(),
      name: name.trim(),
      type,
      exercises: sanitizeSupersets(exercises.filter((ex) => ex.name.trim() !== "")),
    });
    onClose();
  }

  const activeColor = WORKOUT_COLORS[type];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-950"
    >
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {isNew ? "Neue Routine" : "Routine bearbeiten"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Name, Typ & Übungen festlegen</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Typ</label>
            <div className="flex flex-wrap gap-2">
              {GYM_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 min-w-[100px] py-2 rounded-lg text-xs font-semibold border transition-all ${
                    type === t ? `${WORKOUT_COLORS[t].bg} text-white border-transparent` : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {GYM_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(false); }}
              placeholder="z.B. Upper Push, Leg Day, Morning Stretch…"
              className={`w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors ${
                nameError ? "border-red-500" : `border-zinc-700 focus:ring-${activeColor.text.split('-')[1]}-500/40 focus:border-${activeColor.text.split('-')[1]}-500/60`
              }`}
            />
            {nameError && <p className="text-xs text-red-400 mt-1">Bitte einen Namen eingeben Hexadezimal.</p>}
          </div>

          {/* Exercises */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Übungen ({exercises.length})
            </label>
            <div className="space-y-2">
              {exercises.map((ex) => (
                <TemplateExerciseRow
                  key={ex.id}
                  exercise={ex}
                  onChange={(patch) => updateExercise(ex.id, patch)}
                  onRemove={() => removeExercise(ex.id)}
                  canRemove={exercises.length > 1}
                />
              ))}
            </div>
            <button
              onClick={() => setExercises((prev) => [...prev, emptyExercise()])}
              className="w-full flex items-center justify-center gap-2 py-3 mt-2 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              <Plus size={15} />
              Übung hinzufügen
            </button>

            {/* Superset Optimizer */}
            {canOptimize && (
              <div className="mt-3 space-y-2">
                {!hasSupersets ? (
                  <button
                    onClick={handleConvertToSupersets}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/60 transition-all active:scale-[0.99]"
                  >
                    <Zap size={15} />
                    In Supersätze umwandeln (spart ~25% Zeit)
                  </button>
                ) : (
                  <button
                    onClick={handleClearSupersets}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-semibold text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-all active:scale-[0.99]"
                  >
                    <Trash2 size={14} />
                    Supersätze entfernen
                  </button>
                )}

                {supersetSummary && supersetSummary.pairLabels.length > 0 && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-1.5">
                    <p className="text-xs font-bold text-cyan-200 flex items-center gap-1.5">
                      <Zap size={12} />
                      {supersetSummary.pairLabels.length} Supersatz-Paare · spart ~{supersetSummary.savedMinutes} Min ({supersetSummary.savedPct}%)
                    </p>
                    <p className="text-[11px] text-cyan-300/80">{supersetSummary.pairLabels.join(" · ")}</p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Pausen zwischen alternierenden Bewegungen auf 60 s gekürzt – nach jedem Satz die andere Übung des Paares ausführen.
                    </p>
                  </div>
                )}
                {supersetSummary && supersetSummary.pairLabels.length === 0 && (
                  <p className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-500">
                    Keine kompatiblen Paare gefunden (Antagonisten oder Upper/Lower-Kombination).
                  </p>
                )}
                {supersetSummary && supersetSummary.skippedSpinalNames.length > 0 && (
                  <p className="flex items-start gap-1.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200/90">
                    <ShieldCheck size={13} className="shrink-0 mt-0.5" />
                    <span>
                      {supersetSummary.skippedSpinalNames.join(", ")} bleibt solo – spinal belastende Übungen werden nie gepaart.
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleSave}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-colors ${activeColor.bg} hover:opacity-90 active:opacity-100`}
          >
            <Save size={15} />
            {isNew ? "Routine erstellen" : "Änderungen speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
