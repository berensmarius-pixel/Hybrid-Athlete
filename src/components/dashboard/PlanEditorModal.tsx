"use client";

import { useState, useEffect } from "react";
import { X, Save, RotateCcw, ChevronDown } from "lucide-react";
import { cn, WORKOUT_COLORS, WORKOUT_TYPE_LABELS } from "@/lib/utils";
import { DEFAULT_WEEKLY_PLAN } from "@/data/weeklyPlan";
import { useApp } from "@/context/AppContext";
import type { DayPlan, WorkoutType } from "@/types";

const WORKOUT_TYPES: WorkoutType[] = ["gym", "stretching", "warmup", "cycling", "running", "rest"];
const TEMPLATE_TYPES: WorkoutType[] = ["gym", "stretching", "warmup"];

interface PlanEditorModalProps {
  plan: DayPlan[];
  onSave: (plan: DayPlan[]) => void;
  onClose: () => void;
}

export default function PlanEditorModal({ plan, onSave, onClose }: PlanEditorModalProps) {
  const { gymTemplates } = useApp();
  const [draft, setDraft] = useState<DayPlan[]>(() =>
    plan.map((d) => ({ ...d }))
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function updateDay(index: number, patch: Partial<DayPlan>) {
    setDraft((prev) =>
      prev.map((d) => (d.dayIndex === index ? { ...d, ...patch } : d))
    );
  }

  function handleReset() {
    setDraft(DEFAULT_WEEKLY_PLAN.map((d) => ({ ...d })));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-950"
    >
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Trainingsplan bearbeiten</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Jede Woche anpassbar – Änderungen werden gespeichert</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable day list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {draft.map((day) => {
            const colors = WORKOUT_COLORS[day.workoutType];
            return (
              <div
                key={day.dayIndex}
                className={cn(
                  "bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/50",
                )}
              >
                {/* Day name and Deload Toggle */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {day.dayFull}
                  </p>
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.isDeload ?? false}
                      onChange={(e) => updateDay(day.dayIndex, { isDeload: e.target.checked })}
                      className="rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
                    />
                    Deload
                  </label>
                </div>

                {/* Workout type selector */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {WORKOUT_TYPES.map((type) => {
                    const c = WORKOUT_COLORS[type];
                    const active = day.workoutType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => updateDay(day.dayIndex, { workoutType: type })}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                          active
                            ? cn(c.bg, "text-white border-transparent")
                            : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
                        )}
                      >
                        {WORKOUT_TYPE_LABELS[type]}
                      </button>
                    );
                  })}
                </div>

                {/* Template picker for gym/stretching/warmup days */}
                {TEMPLATE_TYPES.includes(day.workoutType) && (
                  <div className="mb-3">
                    <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                      Routine verknüpfen
                    </label>
                    <div className="relative">
                      <select
                        value={day.templateId ?? ""}
                        onChange={(e) =>
                          updateDay(day.dayIndex, {
                            templateId: e.target.value || undefined,
                          })
                        }
                        className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 pr-8 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      >
                        <option value="">— Keine Routine —</option>
                        {gymTemplates
                          .filter((t) => t.type === day.workoutType)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Title input */}
                <input
                  type="text"
                  value={day.title}
                  onChange={(e) =>
                    updateDay(day.dayIndex, { title: e.target.value })
                  }
                  placeholder="Trainingstitel…"
                  className={cn(
                    "w-full bg-zinc-900 border rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600",
                    "focus:outline-none focus:ring-1 mb-2",
                    colors.border,
                    "focus:ring-blue-500/50"
                  )}
                />

                {/* Description input */}
                <textarea
                  value={day.description}
                  onChange={(e) =>
                    updateDay(day.dayIndex, { description: e.target.value })
                  }
                  placeholder="Beschreibung (optional)…"
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                />
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="px-4 py-4 border-t border-zinc-800 flex gap-3 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw size={15} />
            Zurücksetzen
          </button>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors"
          >
            <Save size={15} />
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
