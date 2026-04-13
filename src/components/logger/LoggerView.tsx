"use client";

import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId } from "@/lib/utils";
import TabSwitcher from "./TabSwitcher";
import GymForm from "./GymForm";
import EnduranceForm from "./EnduranceForm";
import type { ExerciseEntry, EnduranceSession, GymTemplate } from "@/types";

type LogTab = "gym" | "endurance";

function initialGymEntries(): ExerciseEntry[] {
  return [
    { 
      id: generateId(), 
      exercise: "", 
      sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] 
    }
  ];
}

function initialEndurance(): Pick<
  EnduranceSession,
  "activityType" | "duration" | "heartRate" | "pace" | "rpe"
> {
  return { activityType: "running", duration: "", heartRate: "", pace: "", rpe: 5 };
}

/** Convert a GymTemplate into pre-populated ExerciseEntry rows */
function templateToEntries(template: GymTemplate): ExerciseEntry[] {
  return template.exercises.map((ex) => ({
    id: generateId(),
    exercise: ex.name,
    sets: ex.sets ? ex.sets.map(s => ({
      id: generateId(),
      type: s.type,
      weight: "",
      reps: "", // user fills
      duration: s.targetDuration ?? "", // pre-fill duration if stretch template
      rir: s.targetRir ?? "" // pre-fill target RIR if planned
    })) : [],
  }));
}

export default function LoggerView() {
  const { addSession, gymTemplates: templates } = useApp();
  const [activeTab, setActiveTab] = useState<LogTab>("gym");
  const [gymEntries, setGymEntries] = useState<ExerciseEntry[]>(initialGymEntries);
  const [endurance, setEndurance] = useState(initialEndurance);
  const [saved, setSaved] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Handle navigation from TemplatesView ("Einheit starten" button)
  useEffect(() => {
    const pendingId = sessionStorage.getItem("pending-template-id");
    if (pendingId) {
      sessionStorage.removeItem("pending-template-id");
      const found = templates.find((t) => t.id === pendingId);
      if (found) {
        setActiveTab("gym");
        setSelectedTemplateId(found.id);
        setGymEntries(templateToEntries(found));
      }
    }
  // Run once on mount — templates is stable after first load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectTemplate(id: string) {
    setSelectedTemplateId(id);
    if (id === "") {
      setGymEntries(initialGymEntries());
    } else {
      const found = templates.find((t) => t.id === id);
      if (found) setGymEntries(templateToEntries(found));
    }
  }

  function handleSave() {
    if (activeTab === "gym") {
      const filled = gymEntries.filter((e) => e.exercise.trim() !== "");
      if (filled.length === 0) return;
      const tpl = templates.find((t) => t.id === selectedTemplateId);
      addSession({
        kind: "gym",
        id: generateId(),
        date: new Date().toISOString(),
        templateId: tpl?.id,
        templateName: tpl?.name,
        entries: filled,
      });
      setGymEntries(initialGymEntries());
      setSelectedTemplateId("");
    } else {
      if (!endurance.duration.trim()) return;
      addSession({
        kind: "endurance",
        id: generateId(),
        date: new Date().toISOString(),
        ...endurance,
      });
      setEndurance(initialEndurance());
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="flex flex-col h-full pb-16 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-2xl font-bold text-zinc-100">Logbuch</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Training erfassen</p>
      </div>

      {/* Tab switcher */}
      <TabSwitcher activeTab={activeTab} onChange={setActiveTab} />

      {/* Form area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {activeTab === "gym" ? (
          <GymForm
            entries={gymEntries}
            onChange={setGymEntries}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
          />
        ) : (
          <EnduranceForm
            values={endurance}
            onChange={(patch) => setEndurance((prev) => ({ ...prev, ...patch }))}
          />
        )}
      </div>

      {/* Save button */}
      <div className="px-4 pb-4 pt-2 border-t border-zinc-800/60 shrink-0">
        {saved ? (
          <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600/20 border border-green-600/40">
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-green-400 text-sm font-semibold">Gespeichert!</span>
          </div>
        ) : (
          <button
            onClick={handleSave}
            className={
              activeTab === "gym"
                ? "w-full flex items-center justify-center py-3.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors"
                : "w-full flex items-center justify-center py-3.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-400 active:bg-orange-600 transition-colors"
            }
          >
            Einheit speichern
          </button>
        )}
      </div>
    </div>
  );
}
