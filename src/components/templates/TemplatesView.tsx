"use client";

import { useState } from "react";
import { Plus, Layers } from "lucide-react";
import { useApp } from "@/context/AppContext";
import TemplateCard from "./TemplateCard";
import TemplateEditorModal from "./TemplateEditorModal";
import type { GymTemplate } from "@/types";

export default function TemplatesView() {
  const { gymTemplates: templates, saveGymTemplate: saveTemplate, deleteGymTemplate: deleteTemplate, setActiveView } = useApp();
  const [editorTarget, setEditorTarget] = useState<GymTemplate | undefined | null>(null);
  // null = closed, undefined = new, GymTemplate = edit existing

  function openNew() { setEditorTarget(undefined); }
  function openEdit(t: GymTemplate) { setEditorTarget(t); }
  function closeEditor() { setEditorTarget(null); }

  function handleLog(template: GymTemplate) {
    sessionStorage.setItem("pending-template-id", template.id);
    // Navigate to training view
    setActiveView("training");
  }

  return (
    <div className="flex flex-col h-full pb-16 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Trainingspläne</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Feste Routinen verwalten</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Neuer Plan</span>
          <span className="sm:hidden">Neu</span>
        </button>
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
              <Layers size={24} className="text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">Noch keine Pläne</p>
            <p className="text-zinc-600 text-sm mt-1">Erstelle deinen ersten Trainingsplan.</p>
            <button
              onClick={openNew}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Plan erstellen
            </button>
          </div>
        ) : (
          templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => openEdit(t)}
              onDelete={() => deleteTemplate(t.id)}
              onLog={() => handleLog(t)}
            />
          ))
        )}
      </div>

      {/* Editor modal */}
      {editorTarget !== null && (
        <TemplateEditorModal
          template={editorTarget}
          onSave={saveTemplate}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
