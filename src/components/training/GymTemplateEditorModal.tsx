"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus } from "lucide-react";
import TemplateExerciseRow from "@/components/templates/TemplateExerciseRow";
import { generateId } from "@/lib/utils";
import type { GymTemplate, TemplateExercise } from "@/types";

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

export default function GymTemplateEditorModal({ template, onSave, onClose }: GymTemplateEditorModalProps) {
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<GymTemplate["type"]>(template?.type ?? "gym");
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    template?.exercises.map((e) => ({ ...e })) ?? [emptyExercise()]
  );
  const [nameError, setNameError] = useState(false);

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

  function handleSave() {
    if (!name.trim()) { setNameError(true); return; }
    onSave({
      id: template?.id ?? generateId(),
      name: name.trim(),
      type,
      exercises: exercises.filter((ex) => ex.name.trim() !== ""),
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
