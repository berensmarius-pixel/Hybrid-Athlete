"use client";

import { useState } from "react";
import {
  Dumbbell,
  Footprints,
  Bike,
  Waves,
  Activity,
  Plus,
  Trophy,
  History,
  Clock,
  Flame,
  Calendar,
  X,
  Edit2,
  Trash2,
  ChevronRight,
  Eye,
  Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import type { GymTemplate, EnduranceTemplate, WorkoutType, LoggedSession, GymSession } from "@/types";

const WORKOUT_THEMES: Record<WorkoutType, { bg: string; text: string; bgLight: string; border: string; glow: string }> = {
  gym: {
    bg: "bg-blue-600 hover:bg-blue-500",
    text: "text-blue-400",
    bgLight: "bg-blue-500/10",
    border: "border-blue-500/30 hover:border-blue-500/60",
    glow: "shadow-blue-500/5",
  },
  running: {
    bg: "bg-emerald-600 hover:bg-emerald-500",
    text: "text-emerald-400",
    bgLight: "bg-emerald-500/10",
    border: "border-emerald-500/30 hover:border-emerald-500/60",
    glow: "shadow-emerald-500/5",
  },
  cycling: {
    bg: "bg-amber-600 hover:bg-amber-500",
    text: "text-amber-400",
    bgLight: "bg-amber-500/10",
    border: "border-amber-500/30 hover:border-amber-500/60",
    glow: "shadow-amber-500/5",
  },
  swimming: {
    bg: "bg-sky-600 hover:bg-sky-500",
    text: "text-sky-400",
    bgLight: "bg-sky-500/10",
    border: "border-sky-500/30 hover:border-sky-500/60",
    glow: "shadow-sky-500/5",
  },
  mobility: {
    bg: "bg-pink-600 hover:bg-pink-500",
    text: "text-pink-400",
    bgLight: "bg-pink-500/10",
    border: "border-pink-500/30 hover:border-pink-500/60",
    glow: "shadow-pink-500/5",
  },
  stretching: {
    bg: "bg-violet-600 hover:bg-violet-500",
    text: "text-violet-400",
    bgLight: "bg-violet-500/10",
    border: "border-violet-500/30 hover:border-violet-500/60",
    glow: "shadow-violet-500/5",
  },
  warmup: {
    bg: "bg-orange-600 hover:bg-orange-500",
    text: "text-orange-400",
    bgLight: "bg-orange-500/10",
    border: "border-orange-500/30 hover:border-orange-500/60",
    glow: "shadow-orange-500/5",
  },
  rest: {
    bg: "bg-zinc-700",
    text: "text-zinc-400",
    bgLight: "bg-zinc-800",
    border: "border-zinc-800",
    glow: "shadow-none",
  },
};

interface RoutinesTabProps {
  onStartEmptyGym: () => void;
  onStartEmptyEndurance: (type: "running" | "cycling") => void;
  onStartEmptyMobility: () => void;
  onStartGymTemplate: (template: GymTemplate) => void;
  onStartEnduranceTemplate: (template: EnduranceTemplate) => void;
  onEditGymTemplate: (template?: GymTemplate) => void;
  onEditEnduranceTemplate: (template?: EnduranceTemplate) => void;
}

export default function RoutinesTab({
  onStartEmptyGym,
  onStartEmptyEndurance,
  onStartEmptyMobility,
  onStartGymTemplate,
  onStartEnduranceTemplate,
  onEditGymTemplate,
  onEditEnduranceTemplate,
}: RoutinesTabProps) {
  const {
    gymTemplates,
    enduranceTemplates,
    deleteGymTemplate,
    deleteEnduranceTemplate,
    loggedSessions,
    personalRecords,
  } = useApp();

  const [routineTab, setRoutineTab] = useState<"all" | "gym" | "endurance" | "mobility">("all");
  const [previewGymTemplate, setPreviewGymTemplate] = useState<GymTemplate | null>(null);
  const [previewEnduranceTemplate, setPreviewEnduranceTemplate] = useState<EnduranceTemplate | null>(null);

  // Counts for badge counters
  const gymList = gymTemplates.filter((t) => t.type === "gym");
  const mobilityList = gymTemplates.filter((t) => t.type !== "gym");
  const enduranceList = enduranceTemplates;
  const totalCount = gymList.length + enduranceList.length + mobilityList.length;

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-6 sm:space-y-8 pb-28 md:pb-8">
      {/* ── 1. Quick Start Section ────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-zinc-400">
          Schnellstart (Freies Training)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={onStartEmptyGym}
            className="flex items-center gap-3 p-3.5 sm:p-4 rounded-3xl bg-blue-600/10 border border-blue-500/30 hover:bg-blue-600/20 hover:border-blue-500/50 transition-all active:scale-95 text-left cursor-pointer group shadow-sm"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Dumbbell size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-blue-200 block truncate">Kraft</span>
              <span className="text-[10px] text-zinc-400 block truncate">Freies Logging & Sets</span>
            </div>
          </button>

          <button
            onClick={() => onStartEmptyEndurance("running")}
            className="flex items-center gap-3 p-3.5 sm:p-4 rounded-3xl bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600/20 hover:border-emerald-500/50 transition-all active:scale-95 text-left cursor-pointer group shadow-sm"
          >
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Footprints size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-emerald-200 block truncate">Laufen</span>
              <span className="text-[10px] text-zinc-400 block truncate">HF, Pace & Zonen</span>
            </div>
          </button>

          <button
            onClick={() => onStartEmptyEndurance("cycling")}
            className="flex items-center gap-3 p-3.5 sm:p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all active:scale-95 text-left cursor-pointer group shadow-sm"
          >
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Bike size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-amber-200 block truncate">Radfahren</span>
              <span className="text-[10px] text-zinc-400 block truncate">Watt, FTP & Trittfrequenz</span>
            </div>
          </button>

          <button
            onClick={onStartEmptyMobility}
            className="flex items-center gap-3 p-3.5 sm:p-4 rounded-3xl bg-pink-600/10 border border-pink-500/30 hover:bg-pink-600/20 hover:border-pink-500/50 transition-all active:scale-95 text-left cursor-pointer group shadow-sm"
          >
            <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Activity size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-pink-200 block truncate">Mobility</span>
              <span className="text-[10px] text-zinc-400 block truncate">Dehnen & Gelenk-Flow</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── 2. Routine Library Section with Category Badges ───────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Category Filter Tabs with Badge Counters */}
          <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 overflow-x-auto scrollbar-none">
            {[
              { id: "all", label: "Alle", count: totalCount },
              { id: "gym", label: "Kraft", count: gymList.length },
              { id: "endurance", label: "Ausdauer", count: enduranceList.length },
              { id: "mobility", label: "Mobilität", count: mobilityList.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRoutineTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
                  routineTab === tab.id
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
                    routineTab === tab.id
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() =>
              routineTab === "endurance"
                ? onEditEnduranceTemplate(undefined)
                : onEditGymTemplate(undefined)
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold transition-all cursor-pointer active:scale-95 shrink-0 shadow-md shadow-cyan-500/20 self-start sm:self-auto"
          >
            <Plus size={14} />
            <span>Neue Routine erstellen</span>
          </button>
        </div>

        {/* 3- to 4-Column Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
          {/* Kraft Templates */}
          {(routineTab === "all" || routineTab === "gym") &&
            gymList.map((t) => (
              <GymRoutineCard
                key={t.id}
                template={t}
                onStart={() => onStartGymTemplate(t)}
                onEdit={() => onEditGymTemplate(t)}
                onDelete={() => deleteGymTemplate(t.id)}
                onPreview={() => setPreviewGymTemplate(t)}
              />
            ))}

          {/* Ausdauer Templates */}
          {(routineTab === "all" || routineTab === "endurance") &&
            enduranceList.map((t) => (
              <EnduranceRoutineCard
                key={t.id}
                template={t}
                onStart={() => onStartEnduranceTemplate(t)}
                onEdit={() => onEditEnduranceTemplate(t)}
                onDelete={() => deleteEnduranceTemplate(t.id)}
                onPreview={() => setPreviewEnduranceTemplate(t)}
              />
            ))}

          {/* Mobilität Templates */}
          {(routineTab === "all" || routineTab === "mobility") &&
            mobilityList.map((t) => (
              <GymRoutineCard
                key={t.id}
                template={t}
                onStart={() => onStartGymTemplate(t)}
                onEdit={() => onEditGymTemplate(t)}
                onDelete={() => deleteGymTemplate(t.id)}
                onPreview={() => setPreviewGymTemplate(t)}
              />
            ))}
        </div>
      </div>

      {/* ── 3. Bottom Value Section: Letzte Workouts & 1RM Rekorde ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-zinc-800/80">
        {/* Letzte Workouts / Trainings-Historie */}
        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
              <History size={16} className="text-cyan-400" />
              <span>Letzte Workouts & Historie</span>
            </h3>
            <span className="text-[11px] text-zinc-500">Letzte {Math.min(4, loggedSessions.length)} Einheiten</span>
          </div>

          {loggedSessions.length > 0 ? (
            <div className="space-y-2.5">
              {loggedSessions.slice(0, 4).map((session) => {
                const isGym = session.kind === "gym" || session.kind === "mobility" || session.kind === "stretching";
                const iconColor = session.kind === "gym" ? "text-blue-400" : session.kind === "endurance" ? "text-amber-400" : "text-pink-400";
                const title = session.templateName || (isGym ? "Krafttraining" : "Ausdauereinheit");

                return (
                  <div
                    key={session.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between gap-3 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                        {isGym ? <Dumbbell size={15} className={iconColor} /> : <Bike size={15} className={iconColor} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-zinc-200 truncate">{title}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                          <span>{session.date ? new Date(session.date).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }) : "Heute"}</span>
                          {isGym && (session as any).entries && (
                            <>
                              <span>•</span>
                              <span>{(session as any).entries.length} Übungen</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Clock size={12} />
                        {session.kind === "endurance"
                          ? session.duration
                          : `${((session as GymSession).entries || []).reduce((sum: number, e: any) => sum + (e.sets?.length || 0), 0) * 3 || 45} Min`}
                      </span>
                      {session.rpe ? (
                        <span className="text-[10px] text-zinc-500 block">RPE {session.rpe}/10</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
              Noch keine absolvierten Workouts protokolliert. Starte eine Routine oben!
            </div>
          )}
        </div>

        {/* 1RM Kraft-Benchmarks */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Trophy size={16} className="text-amber-400" />
              <span>1RM Rekorde & Benchmarks</span>
            </h3>
            <span className="text-[11px] text-zinc-500 font-mono">Epley 1RM</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Bankdrücken", pr: personalRecords.find((p) => p.exerciseName.toLowerCase().includes("bank"))?.estimated1RM || 110 },
              { name: "Kniebeugen", pr: personalRecords.find((p) => p.exerciseName.toLowerCase().includes("knie"))?.estimated1RM || 145 },
              { name: "Kreuzheben", pr: personalRecords.find((p) => p.exerciseName.toLowerCase().includes("kreuz"))?.estimated1RM || 180 },
              { name: "Schulterdrücken", pr: personalRecords.find((p) => p.exerciseName.toLowerCase().includes("schulter"))?.estimated1RM || 75 },
            ].map((bench) => (
              <div
                key={bench.name}
                className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-1"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block truncate">
                  {bench.name}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black font-mono text-zinc-100">{bench.pr}</span>
                  <span className="text-xs font-bold text-amber-400">kg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Modals / Previews ───────────────────────────────────────────── */}
      {previewGymTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 rounded-2xl", WORKOUT_THEMES[previewGymTemplate.type].bgLight)}>
                  <Dumbbell size={20} className={WORKOUT_THEMES[previewGymTemplate.type].text} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">{previewGymTemplate.name}</h3>
                  <span className="text-xs text-zinc-400 uppercase font-bold">{previewGymTemplate.type} • {previewGymTemplate.exercises.length} Übungen</span>
                </div>
              </div>
              <button
                onClick={() => setPreviewGymTemplate(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {previewGymTemplate.exercises.map((ex, idx) => (
                <div key={ex.id || idx} className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">{idx + 1}. {ex.name}</span>
                  <span className="text-xs font-mono text-cyan-400 font-semibold">{ex.sets.length} Sätze {ex.sets[0]?.targetReps ? `• ~${ex.sets[0].targetReps} Wdh` : ""}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  const t = previewGymTemplate;
                  setPreviewGymTemplate(null);
                  onStartGymTemplate(t);
                }}
                className={cn("flex-1 py-3 rounded-2xl text-xs font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2", WORKOUT_THEMES[previewGymTemplate.type].bg)}
              >
                <Zap size={14} />
                <span>Routine jetzt starten</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {previewEnduranceTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 rounded-2xl", WORKOUT_THEMES[previewEnduranceTemplate.type].bgLight)}>
                  {previewEnduranceTemplate.type === "running" ? (
                    <Footprints size={20} className={WORKOUT_THEMES.running.text} />
                  ) : (
                    <Bike size={20} className={WORKOUT_THEMES.cycling.text} />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">{previewEnduranceTemplate.name}</h3>
                  <span className="text-xs text-zinc-400 font-bold">{previewEnduranceTemplate.estimatedDuration || "60 Min"}</span>
                </div>
              </div>
              <button
                onClick={() => setPreviewEnduranceTemplate(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed">
              {previewEnduranceTemplate.description}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  const t = previewEnduranceTemplate;
                  setPreviewEnduranceTemplate(null);
                  onStartEnduranceTemplate(t);
                }}
                className={cn("flex-1 py-3 rounded-2xl text-xs font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2", WORKOUT_THEMES[previewEnduranceTemplate.type].bg)}
              >
                <Zap size={14} />
                <span>Einheit jetzt starten</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GymRoutineCard({
  template,
  onStart,
  onEdit,
  onDelete,
  onPreview,
}: {
  template: GymTemplate;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  const exerciseNames = template.exercises.map((e) => e.name).join(", ");
  const theme = WORKOUT_THEMES[template.type] || WORKOUT_THEMES.gym;
  const Icon = template.type === "mobility" ? Activity : Dumbbell;

  return (
    <div
      onClick={onPreview}
      className={cn(
        "bg-zinc-900/90 rounded-3xl border overflow-hidden flex flex-col justify-between p-4 sm:p-5 space-y-4 transition-all duration-200 cursor-pointer shadow-md group",
        theme.border,
        theme.glow
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner", theme.bgLight)}>
              <Icon size={18} className={theme.text} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-100 text-sm sm:text-base truncate group-hover:text-cyan-300 transition-colors">
                {template.name}
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 line-clamp-1">
                {exerciseNames || "Keine Übungen hinterlegt"}
              </p>
            </div>
          </div>

          {/* Generous Hitbox Actions */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer"
              title="Routine bearbeiten"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={handleDelete}
              className={cn(
                "p-2 rounded-xl transition-all cursor-pointer",
                confirmDelete
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold px-2.5"
                  : "bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
              )}
              title="Routine löschen"
            >
              {confirmDelete ? "Löschen?" : <Trash2 size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onStart}
          className={cn(
            "w-full py-2.5 rounded-2xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-1.5",
            theme.bg
          )}
        >
          <Zap size={13} />
          <span>Routine starten</span>
        </button>
      </div>
    </div>
  );
}

function EnduranceRoutineCard({
  template,
  onStart,
  onEdit,
  onDelete,
  onPreview,
}: {
  template: EnduranceTemplate;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  const isRun = template.type === "running";
  const isSwim = template.type === "swimming";
  const Icon = isSwim ? Waves : isRun ? Footprints : Bike;
  const theme = isSwim
    ? WORKOUT_THEMES.swimming
    : isRun
      ? WORKOUT_THEMES.running
      : WORKOUT_THEMES.cycling;

  return (
    <div
      onClick={onPreview}
      className={cn(
        "bg-zinc-900/90 rounded-3xl border overflow-hidden flex flex-col justify-between p-4 sm:p-5 space-y-4 transition-all duration-200 cursor-pointer shadow-md group",
        theme.border,
        theme.glow
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner", theme.bgLight)}>
              <Icon size={18} className={theme.text} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-zinc-100 text-sm sm:text-base truncate group-hover:text-cyan-300 transition-colors">
                {template.name}
              </h3>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 line-clamp-1">
                {template.description || "Ausdauer-Vorlage"}
              </p>
            </div>
          </div>

          {/* Generous Hitbox Actions */}
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all cursor-pointer"
              title="Einheit bearbeiten"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={handleDelete}
              className={cn(
                "p-2 rounded-xl transition-all cursor-pointer",
                confirmDelete
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold px-2.5"
                  : "bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
              )}
              title="Einheit löschen"
            >
              {confirmDelete ? "Löschen?" : <Trash2 size={13} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onStart}
          className={cn(
            "w-full py-2.5 rounded-2xl text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-1.5",
            theme.bg
          )}
        >
          <Zap size={13} />
          <span>Einheit starten</span>
        </button>
      </div>
    </div>
  );
}
