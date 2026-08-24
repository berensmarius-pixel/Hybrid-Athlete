"use client";

import { useState } from "react";
import { Dumbbell, Bike, Footprints, Plus, ChevronRight, Zap, Activity } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId } from "@/lib/utils";
import { WORKOUT_COLORS, WORKOUT_TYPE_LABELS, getTodayIndex } from "@/lib/utils";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { GymTemplate, EnduranceTemplate, ExerciseEntry, ActiveSession, ActiveGymSession, ActiveEnduranceSession } from "@/types";
import ActiveGymLogger from "./ActiveGymLogger";
import ActiveEnduranceLogger from "./ActiveEnduranceLogger";

const GymTemplateEditorModal = dynamic(() => import("./GymTemplateEditorModal"), { ssr: false });
const EnduranceTemplateEditorModal = dynamic(() => import("./EnduranceTemplateEditorModal"), { ssr: false });
const ExerciseAnatomyModal = dynamic(() => import("./ExerciseAnatomyModal"), { ssr: false });
const CyclingRouteModal = dynamic(() => import("@/components/routes/CyclingRouteModal"), { ssr: false });

function templateToEntries(template: GymTemplate): ExerciseEntry[] {
  return template.exercises.map((ex) => ({
    id: generateId(),
    exercise: ex.name,
    sets: ex.sets ? ex.sets.map(s => ({
      id: generateId(),
      type: s.type,
      weight: "",
      reps: "",
      duration: s.targetDuration ?? "",
      rir: s.targetRir ?? "",
    })) : [],
  }));
}

function initialEndurance(activityType: "cycling" | "running" = "running"): Omit<ActiveEnduranceSession, "kind"> {
  return { activityType, duration: "", heartRate: "", pace: "", rpe: 5 };
}

export default function TrainingView() {
  const {
    gymTemplates, saveGymTemplate, deleteGymTemplate,
    enduranceTemplates, saveEnduranceTemplate, deleteEnduranceTemplate,
    activeSession, setActiveSession,
    weeklyPlan,
  } = useApp();

  const [gymEditorTarget, setGymEditorTarget] = useState<GymTemplate | undefined | null>(null);
  const [enduranceEditorTarget, setEnduranceEditorTarget] = useState<EnduranceTemplate | undefined | null>(null);
  const [activeTab, setActiveTab] = useState<"gym" | "endurance" | "mobility">("gym");
  const [anatomyOpen, setAnatomyOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);

  // Determine today's plan item
  const todayIndex = getTodayIndex();
  const todayPlan = weeklyPlan.find(d => d.dayIndex === todayIndex);

  // ── Quick-start handlers ──────────────────────────────────────────────────

  function startEmptyGym() {
    setActiveSession({
      kind: "gym",
      entries: [{ id: generateId(), exercise: "", sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] }],
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startEmptyEndurance(type: "cycling" | "running") {
    setActiveSession({ kind: "endurance", ...initialEndurance(type) } as ActiveEnduranceSession);
  }

  function startEmptyMobility() {
    setActiveSession({
      kind: "mobility",
      entries: [{ id: generateId(), exercise: "", sets: [{ id: generateId(), type: "working", weight: "", reps: "" }] }],
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startGymTemplate(template: GymTemplate) {
    setActiveSession({
      kind: template.type === "warmup" ? "warmup" : template.type === "stretching" ? "stretching" : "gym",
      templateId: template.id,
      templateName: template.name,
      entries: templateToEntries(template),
      startTime: new Date().toISOString(),
    } as ActiveGymSession);
  }

  function startEnduranceTemplate(template: EnduranceTemplate) {
    setActiveSession({
      kind: "endurance",
      activityType: template.type,
      duration: "",
      heartRate: "",
      pace: "",
      rpe: 5,
      templateId: template.id,
      templateName: template.name,
    } as ActiveEnduranceSession);
  }

  function startTodayAgenda() {
    if (!todayPlan) return;
    const type = todayPlan.workoutType;
    // Try to find linked template
    if (todayPlan.templateId) {
      const gymT = gymTemplates.find(t => t.id === todayPlan.templateId);
      if (gymT) { startGymTemplate(gymT); return; }
      const endT = enduranceTemplates.find(t => t.id === todayPlan.templateId);
      if (endT) { startEnduranceTemplate(endT); return; }
    }
    // Fallback by type
    if (type === "gym" || type === "stretching" || type === "warmup" || type === "mobility") {
      if (type === "mobility") startEmptyMobility();
      else startEmptyGym();
    } else if (type === "cycling") {
      startEmptyEndurance("cycling");
    } else if (type === "running") {
      startEmptyEndurance("running");
    }
  }

  // ── Active session ────────────────────────────────────────────────────────

  if (activeSession) {
    if (activeSession.kind === "endurance") {
      return <ActiveEnduranceLogger session={activeSession as ActiveEnduranceSession} onDiscard={() => setActiveSession(null)} />;
    }
    return <ActiveGymLogger session={activeSession as ActiveGymSession} onDiscard={() => setActiveSession(null)} />;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-3 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight">Training & Routinen</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Workout Logger, Vorlagen & Belastungssteuerung</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRoutesOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/10 border border-orange-500/30 text-orange-400 text-xs font-bold hover:bg-orange-600/20 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Bike size={14} />
            <span><span className="hidden sm:inline">Rennrad-</span>Routen</span>
          </button>

          <button
            onClick={() => setAnatomyOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 text-xs font-bold hover:bg-blue-600/20 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Activity size={14} />
            <span><span className="hidden sm:inline">Muskel-</span>Anatomie</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 pb-28 md:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left Column: Today & Quickstart ──────────────────────────── */}
          <div className="lg:col-span-5 space-y-5">
            {/* Today's Agenda */}
            {todayPlan && todayPlan.workoutType !== "rest" && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">Heute auf der Agenda</p>
                <button
                  onClick={startTodayAgenda}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-3xl border text-left transition-all",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    WORKOUT_COLORS[todayPlan.workoutType].border,
                    WORKOUT_COLORS[todayPlan.workoutType].bgLight,
                    "border-opacity-60"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
                    WORKOUT_COLORS[todayPlan.workoutType].bgLight,
                  )}>
                    {todayPlan.workoutType === "gym" || todayPlan.workoutType === "stretching" || todayPlan.workoutType === "warmup" || todayPlan.workoutType === "mobility"
                      ? <Dumbbell size={22} className={WORKOUT_COLORS[todayPlan.workoutType].text} />
                      : todayPlan.workoutType === "cycling"
                      ? <Bike size={22} className={WORKOUT_COLORS[todayPlan.workoutType].text} />
                      : <Footprints size={22} className={WORKOUT_COLORS[todayPlan.workoutType].text} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-bold mb-0.5", WORKOUT_COLORS[todayPlan.workoutType].text)}>
                      {WORKOUT_TYPE_LABELS[todayPlan.workoutType]}
                    </p>
                    <p className="text-sm font-bold text-zinc-100 truncate">{todayPlan.title}</p>
                    {todayPlan.isDeload && (
                      <span className="text-xs text-blue-400">⚡ Deload</span>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl", WORKOUT_COLORS[todayPlan.workoutType].badge)}>
                    <Zap size={13} />
                    <span>Starten</span>
                  </div>
                </button>
              </div>
            )}

            {/* Quick Start */}
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">Schnellstart (Freies Training)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={startEmptyGym}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-blue-600/10 border border-blue-500/25 hover:bg-blue-600/20 transition-all active:scale-95 text-center"
                >
                  <Dumbbell size={24} className="text-blue-400" />
                  <span className="text-xs font-bold text-blue-300">Kraft</span>
                </button>
                <button
                  onClick={() => startEmptyEndurance("running")}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-emerald-600/10 border border-emerald-500/25 hover:bg-emerald-600/20 transition-all active:scale-95 text-center"
                >
                  <Footprints size={24} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">Laufen</span>
                </button>
                <button
                  onClick={() => startEmptyEndurance("cycling")}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 transition-all active:scale-95 text-center"
                >
                  <Bike size={24} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-300">Rad</span>
                </button>
                <button
                  onClick={startEmptyMobility}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-pink-600/10 border border-pink-500/25 hover:bg-pink-600/20 transition-all active:scale-95 text-center"
                >
                  <Activity size={24} className="text-pink-400" />
                  <span className="text-xs font-bold text-pink-300">Mobility</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Column: Routines & Templates Library ───────────────── */}
          <div className="lg:col-span-7 space-y-4">
            {/* Routines Tabs */}
            <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
              {(["gym", "endurance", "mobility"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
                    activeTab === tab
                      ? cn(WORKOUT_COLORS[tab === "mobility" ? "mobility" : tab === "endurance" ? "cycling" : "gym"].bg, "text-white shadow-lg shadow-black/20")
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {tab === "gym" ? "Kraft" : tab === "endurance" ? "Ausdauer" : "Mobilität"}
                </button>
              ))}
            </div>

            <div>
        {/* Kraft Tab */}
        {activeTab === "gym" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kraft-Routinen</p>
              <button onClick={() => setGymEditorTarget(undefined)} className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300">
                <Plus size={14} /> Neu
              </button>
            </div>
            {gymTemplates.filter(t => t.type === "gym").length === 0 ? (
              <EmptyState onClick={() => setGymEditorTarget(undefined)} label="Keine Kraft-Routinen" />
            ) : (
              <div className="space-y-3">
                {gymTemplates.filter(t => t.type === "gym").map((t) => (
                  <GymRoutineCard key={t.id} template={t} onStart={() => startGymTemplate(t)} onEdit={() => setGymEditorTarget(t)} onDelete={() => deleteGymTemplate(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ausdauer Tab */}
        {activeTab === "endurance" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ausdauer-Routinen</p>
              <button onClick={() => setEnduranceEditorTarget(undefined)} className="flex items-center gap-1 text-xs font-semibold text-orange-400 hover:text-orange-300">
                <Plus size={14} /> Neu
              </button>
            </div>
            {enduranceTemplates.length === 0 ? (
              <EmptyState onClick={() => setEnduranceEditorTarget(undefined)} label="Keine Ausdauer-Routinen" color="orange" />
            ) : (
              <div className="space-y-3">
                {enduranceTemplates.map((t) => (
                  <EnduranceRoutineCard key={t.id} template={t} onStart={() => startEnduranceTemplate(t)} onEdit={() => setEnduranceEditorTarget(t)} onDelete={() => deleteEnduranceTemplate(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mobilität Tab */}
        {activeTab === "mobility" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mobilitäts-Routinen</p>
              <button onClick={() => setGymEditorTarget(undefined)} className="flex items-center gap-1 text-xs font-semibold text-pink-400 hover:text-pink-300">
                <Plus size={14} /> Neu
              </button>
            </div>
            {gymTemplates.filter(t => t.type !== "gym").length === 0 ? (
              <EmptyState onClick={() => setGymEditorTarget(undefined)} label="Keine Mobilitäts-Routinen" color="pink" />
            ) : (
              <div className="space-y-3">
                {gymTemplates.filter(t => t.type !== "gym").map((t) => (
                  <GymRoutineCard key={t.id} template={t} onStart={() => startGymTemplate(t)} onEdit={() => setGymEditorTarget(t)} onDelete={() => deleteGymTemplate(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {gymEditorTarget !== null && (
        <GymTemplateEditorModal
          template={gymEditorTarget}
          onSave={saveGymTemplate}
          onClose={() => setGymEditorTarget(null)}
        />
      )}
      {enduranceEditorTarget !== null && (
        <EnduranceTemplateEditorModal
          template={enduranceEditorTarget}
          onSave={saveEnduranceTemplate}
          onClose={() => setEnduranceEditorTarget(null)}
        />
      )}
      {anatomyOpen && (
        <ExerciseAnatomyModal
          isOpen={anatomyOpen}
          onClose={() => setAnatomyOpen(false)}
        />
      )}
      {routesOpen && (
        <CyclingRouteModal
          isOpen={routesOpen}
          onClose={() => setRoutesOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onClick, label, color = "blue" }: { onClick: () => void; label: string; color?: "blue" | "orange" | "pink" }) {
  const colorClass = color === "orange" ? "text-orange-600 border-orange-700/30 hover:text-orange-400" : color === "pink" ? "text-pink-600 border-pink-700/30 hover:text-pink-400" : "text-blue-600 border-blue-700/30 hover:text-blue-400";
  return (
    <button
      onClick={onClick}
      className={cn("w-full py-8 rounded-2xl border border-dashed text-sm transition-colors", colorClass)}
    >
      + {label}
    </button>
  );
}

function GymRoutineCard({
  template, onStart, onEdit, onDelete,
}: { template: GymTemplate; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (confirmDelete) { onDelete(); }
    else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  const exerciseNames = template.exercises.map(e => e.name).join(", ");
  const color = WORKOUT_COLORS[template.type];
  const Icon = template.type === "mobility" ? Activity : Dumbbell;

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", color.bgLight)}>
              <Icon size={15} className={color.text} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-100 text-sm truncate">{template.name}</h3>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">{exerciseNames || "Keine Übungen"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={onEdit} className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors text-xs">Bearbeiten</button>
            <button
              onClick={handleDelete}
              className={cn("p-1.5 text-xs transition-colors", confirmDelete ? "text-red-400" : "text-zinc-600 hover:text-red-400")}
            >
              {confirmDelete ? "Löschen?" : "✕"}
            </button>
          </div>
        </div>
        <button
          onClick={onStart}
          className={cn("w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95", color.bg, "hover:opacity-90")}
        >
          Routine starten
        </button>
      </div>
    </div>
  );
}

function EnduranceRoutineCard({
  template, onStart, onEdit, onDelete,
}: { template: EnduranceTemplate; onStart: () => void; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const color = WORKOUT_COLORS[template.type === "cycling" ? "cycling" : "running"];
  const Icon = template.type === "cycling" ? Bike : Footprints;

  function handleDelete() {
    if (confirmDelete) { onDelete(); }
    else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", color.bgLight)}>
              <Icon size={15} className={color.text} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-100 text-sm truncate">{template.name}</h3>
              {template.description && (
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{template.description}</p>
              )}
              {template.estimatedDuration && (
                <p className="text-xs text-zinc-600">ca. {template.estimatedDuration}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={onEdit} className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors text-xs">Bearbeiten</button>
            <button
              onClick={handleDelete}
              className={cn("p-1.5 text-xs transition-colors", confirmDelete ? "text-red-400" : "text-zinc-600 hover:text-red-400")}
            >
              {confirmDelete ? "Löschen?" : "✕"}
            </button>
          </div>
        </div>
        <button
          onClick={onStart}
          className={cn("w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95", color.bg, "hover:opacity-90")}
        >
          Routine starten
        </button>
      </div>
    </div>
  );
}
