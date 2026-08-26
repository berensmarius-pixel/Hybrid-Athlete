"use client";

import { useState, useEffect } from "react";
import { X, Save, Bike, Footprints, Waves } from "lucide-react";
import { generateId, cn } from "@/lib/utils";
import type { EnduranceTemplate } from "@/types";

interface EnduranceTemplateEditorModalProps {
  template?: EnduranceTemplate;
  onSave: (template: EnduranceTemplate) => void;
  onClose: () => void;
}

export default function EnduranceTemplateEditorModal({ template, onSave, onClose }: EnduranceTemplateEditorModalProps) {
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<"cycling" | "running" | "swimming">(template?.type ?? "running");
  const [description, setDescription] = useState(template?.description ?? "");
  const [estimatedDuration, setEstimatedDuration] = useState(template?.estimatedDuration ?? "");
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleSave() {
    if (!name.trim()) { setNameError(true); return; }
    onSave({
      id: template?.id ?? generateId(),
      name: name.trim(),
      type,
      description: description.trim(),
      estimatedDuration: estimatedDuration.trim() || undefined,
    });
    onClose();
  }

  const isRunning = type === "running";
  const isSwimming = type === "swimming";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-950"
    >
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">
              {isNew ? "Neue Ausdauer-Routine" : "Routine bearbeiten"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Aktivitätstyp, Name & Beschreibung</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Activity type */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Aktivität</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType("running")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer",
                  type === "running"
                    ? "bg-green-600 text-white border-transparent"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                )}
              >
                <Footprints size={16} /> Laufen
              </button>
              <button
                onClick={() => setType("cycling")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer",
                  type === "cycling"
                    ? "bg-orange-500 text-white border-transparent"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                )}
              >
                <Bike size={16} /> Radfahren
              </button>
              <button
                onClick={() => setType("swimming")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer",
                  type === "swimming"
                    ? "bg-sky-500 text-white border-transparent"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                )}
              >
                <Waves size={16} /> Schwimmen
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(false); }}
              placeholder="z.B. 5×1km Intervalle, Schwimmen 2.300m Technik, Zone 2 Lauf…"
              className={cn(
                "w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors",
                nameError
                  ? "border-red-500"
                  : isSwimming
                    ? "border-zinc-700 focus:border-sky-500/60 focus:ring-sky-500/30"
                    : isRunning
                      ? "border-zinc-700 focus:border-green-500/60 focus:ring-green-500/30"
                      : "border-zinc-700 focus:border-orange-500/60 focus:ring-orange-500/30"
              )}
            />
            {nameError && <p className="text-xs text-red-400 mt-1">Bitte einen Namen eingeben.</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Beschreibung / Workout-Struktur
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isRunning
                ? "z.B. 5×1km @ 4:30/km mit 2 Min Trabpause, 10 Min Einlaufen vorher…"
                : "z.B. 4×8 Min @ 95% FTP, 4 Min Pause, Gesamtdauer 75 Min…"
              }
              rows={4}
              className={cn(
                "w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors resize-none",
                isRunning
                  ? "border-zinc-700 focus:border-green-500/60 focus:ring-green-500/30"
                  : "border-zinc-700 focus:border-orange-500/60 focus:ring-orange-500/30"
              )}
            />
          </div>

          {/* Estimated duration */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Geschätzte Dauer (optional)
            </label>
            <input
              type="text"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
              placeholder="z.B. 60 Min, 1:30 h"
              className={cn(
                "w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 transition-colors",
                isRunning
                  ? "border-zinc-700 focus:border-green-500/60 focus:ring-green-500/30"
                  : "border-zinc-700 focus:border-orange-500/60 focus:ring-orange-500/30"
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleSave}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-colors",
              isRunning ? "bg-green-600 hover:bg-green-500 active:bg-green-700" : "bg-orange-500 hover:bg-orange-400 active:bg-orange-600"
            )}
          >
            <Save size={15} />
            {isNew ? "Routine erstellen" : "Änderungen speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
