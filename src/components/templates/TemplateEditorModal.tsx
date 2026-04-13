"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus } from "lucide-react";
import TemplateExerciseRow from "./TemplateExerciseRow";
import { generateId } from "@/lib/utils";
import type { GymTemplate, TemplateExercise } from "@/types";

interface TemplateEditorModalProps {
  /** Pass an existing template to edit, undefined to create new */
  template?: GymTemplate;
  onSave: (template: GymTemplate) => void;
  onClose: () => void;
}

function emptyExercise(): TemplateExercise {
  return { 
    id: generateId(), 
    name: "", 
    sets: [{ id: generateId(), type: "working", targetReps: 8 }] 
  };
}

export default function TemplateEditorModal({
  template,
  onSave,
  onClose,
}: TemplateEditorModalProps) {
  const isNew = !template;

  const [name, setName] = useState(template?.name ?? "");
  const [exercises, setExercises] = useState<TemplateExercise[]>(
    template?.exercises.map((e) => ({ ...e })) ?? [emptyExercise()]
  );
  const [nameError, setNameError] = useState(false);

  // Close on Escape
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

  function addExercise() {
    setExercises((prev) => [...prev, emptyExercise()]);
  }

  function handleSave() {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    onSave({
      id: template?.id ?? generateId(),
      name: name.trim(),
      type: "gym",
      exercises: exercises.filter((ex) => ex.name.trim() !== ""),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full sm:max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-2xl border border-zinc-800 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {isNew ? "Neuer Trainingsplan" : "Plan bearbeiten"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Name vergeben und Übungen definieren
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Plan name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Planname
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(false); }}
              placeholder="z.B. Upper Push, Beine, Fullbody…"
              className={`w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-colors ${
                nameError ? "border-red-500" : "border-zinc-700 focus:border-blue-500/60"
              }`}
            />
            {nameError && (
              <p className="text-xs text-red-400 mt-1">Bitte einen Namen eingeben.</p>
            )}
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
              onClick={addExercise}
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
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors"
          >
            <Save size={15} />
            {isNew ? "Plan erstellen" : "Änderungen speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
