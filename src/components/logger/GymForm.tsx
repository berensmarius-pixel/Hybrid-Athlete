"use client";

import { Plus, ChevronDown } from "lucide-react";
import ExerciseRow from "./ExerciseRow";
import { generateId } from "@/lib/utils";
import type { ExerciseEntry, GymTemplate } from "@/types";

interface GymFormProps {
  entries: ExerciseEntry[];
  onChange: (entries: ExerciseEntry[]) => void;
  templates: GymTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
}

function emptyEntry(): ExerciseEntry {
  return { 
    id: generateId(), 
    exercise: "", 
    sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] 
  };
}

export default function GymForm({
  entries,
  onChange,
  templates,
  selectedTemplateId,
  onSelectTemplate,
}: GymFormProps) {
  const isTemplateMode = entries.some((e) => e.targetReps !== undefined);

  function updateEntry(id: string, patch: Partial<ExerciseEntry>) {
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    onChange(entries.filter((e) => e.id !== id));
  }

  function addEntry() {
    onChange([...entries, emptyEntry()]);
  }

  return (
    <div className="space-y-3">
      {/* Template selector */}
      <div className="relative">
        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
          Plan auswählen (optional)
        </label>
        <div className="relative">
          <select
            value={selectedTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 pr-10 text-sm text-zinc-100 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/25 cursor-pointer"
          >
            <option value="">— Freies Training —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
        </div>
        {selectedTemplateId && (
          <p className="text-xs text-blue-400 mt-1 ml-1">
            Vorlage geladen – gib Gewicht und Wiederholungen ein.
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800/60" />

      {/* Exercise rows */}
      {entries.map((entry) => (
        <ExerciseRow
          key={entry.id}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
          canRemove={entries.length > 1}
        />
      ))}

      {/* Add exercise — always visible so user can extend a template */}
      <button
        onClick={addEntry}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        <Plus size={16} />
        Übung hinzufügen
      </button>
    </div>
  );
}
