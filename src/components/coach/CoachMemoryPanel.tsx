"use client";

import { Trash2 } from "lucide-react";
import type { CoachMemory } from "@/types";

interface CoachMemoryPanelProps {
  memories: CoachMemory[];
  onDeleteMemory: (id: string) => void;
}

export default function CoachMemoryPanel({
  memories,
  onDeleteMemory,
}: CoachMemoryPanelProps) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wide">Coach-Gedächtnis</p>
      {memories.length === 0 ? (
        <p className="text-xs text-zinc-500">Noch keine Fakten gespeichert. Der Coach merkt sich wichtige Dinge automatisch.</p>
      ) : (
        <ul className="space-y-1.5 max-h-32 overflow-y-auto">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start gap-2 group">
              <span className="text-xs text-zinc-300 flex-1 leading-snug">{m.content}</span>
              <button
                onClick={() => onDeleteMemory(m.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0 mt-0.5 cursor-pointer"
                title="Fakt löschen"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
