"use client";

import { useState } from "react";
import { Pencil, Trash2, ChevronDown, ChevronUp, Dumbbell } from "lucide-react";
import type { GymTemplate } from "@/types";

interface TemplateCardProps {
  template: GymTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onLog: () => void;
}

export default function TemplateCard({ template, onEdit, onDelete, onLog }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      // Auto-reset confirm state after 3 seconds
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Icon + title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center shrink-0">
              <Dumbbell size={16} className="text-blue-400" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-100 text-base truncate">{template.name}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {template.exercises.length} Übung{template.exercises.length !== 1 ? "en" : ""}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              aria-label="Bearbeiten"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={handleDeleteClick}
              className={`p-2 rounded-lg transition-colors ${
                confirmDelete
                  ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  : "text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
              }`}
              aria-label={confirmDelete ? "Wirklich löschen?" : "Löschen"}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Confirm delete hint */}
        {confirmDelete && (
          <p className="text-xs text-red-400 mt-2 ml-12">
            Nochmals tippen zum Bestätigen…
          </p>
        )}
      </div>

      {/* Exercise list (collapsible) */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2 border-t border-zinc-800/60 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 transition-colors"
      >
        <span>{expanded ? "Übungen ausblenden" : "Übungen anzeigen"}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1">
          {template.exercises.map((ex, i) => (
            <div
              key={ex.id}
              className="flex items-center justify-between py-2 border-b border-zinc-800/40 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600 w-4 text-right">{i + 1}.</span>
                <span className="text-sm text-zinc-300">{ex.name}</span>
              </div>
              <span className="text-xs font-mono text-blue-400 bg-blue-600/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                {ex.targetSets} × {ex.targetReps}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Log session CTA */}
      <div className="px-4 pb-4">
        <button
          onClick={onLog}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors mt-1"
        >
          Einheit starten
        </button>
      </div>
    </div>
  );
}
