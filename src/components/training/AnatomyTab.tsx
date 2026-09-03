"use client";

import { useState } from "react";
import {
  Activity,
  Dumbbell,
  Sparkles,
  Search,
  Layers,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MUSCLE_GROUPS,
  EXERCISE_DATABASE,
  MuscleGroupInfo,
} from "@/lib/exercises/wgerService";

interface AnatomyTabProps {
  onOpenFullModal: () => void;
}

const FATIGUE_COLORS = {
  high: { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40", light: "bg-rose-500/10", label: "Hohe Belastung (Erholung aktiv)" },
  moderate: { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/40", light: "bg-amber-500/10", label: "Moderate Ermüdung" },
  fresh: { bg: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/40", light: "bg-emerald-500/10", label: "Regeneriert & Einsatzbereit" },
};

export default function AnatomyTab({ onOpenFullModal }: AnatomyTabProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupInfo>(MUSCLE_GROUPS[0]);
  const [viewAngle, setViewAngle] = useState<"front" | "back">("front");
  const [searchQuery, setSearchQuery] = useState("");

  const muscleExercises = EXERCISE_DATABASE.filter(
    (ex) =>
      ex.primaryMuscles.some((m) => m.toLowerCase().includes(selectedMuscle.nameGerman.toLowerCase())) ||
      ex.secondaryMuscles.some((m) => m.toLowerCase().includes(selectedMuscle.nameGerman.toLowerCase()))
  );

  const searchedExercises = searchQuery.trim()
    ? EXERCISE_DATABASE.filter(
        (ex) =>
          ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ex.primaryMuscles.some((m) => m.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : muscleExercises;

  const muscleFatigueMap: Record<string, { level: "high" | "moderate" | "fresh"; pct: number; hoursLeft: number; drill: string }> = {
    chest: { level: "fresh", pct: 15, hoursLeft: 0, drill: "Brustöffnung am Türrahmen (Türdehnung)" },
    back_lats: { level: "fresh", pct: 20, hoursLeft: 0, drill: "Latissimus Stretch an Stange / Tischkante" },
    legs_quads: { level: "high", pct: 88, hoursLeft: 36, drill: "Couch Stretch (2x 60s) & Foam Rolling Oberschenkel" },
    legs_hamstrings: { level: "moderate", pct: 55, hoursLeft: 18, drill: "Hamstring Floss & RDL Stretching" },
    glutes: { level: "moderate", pct: 60, hoursLeft: 22, drill: "Pigeon Pose & 90/90 Hip Opener" },
    calves: { level: "high", pct: 82, hoursLeft: 30, drill: "Wadendehnen an Wand & Faszienball Fußsohle" },
    shoulders: { level: "moderate", pct: 45, hoursLeft: 12, drill: "Cross-Body Shoulder Stretch & Face Pulls" },
    core_abs: { level: "fresh", pct: 10, hoursLeft: 0, drill: "Cobra Pose / Bauchmuskel-Dehnung" },
  };

  const currentFatigue = muscleFatigueMap[selectedMuscle.id] || {
    level: "fresh" as const,
    pct: 20,
    hoursLeft: 0,
    drill: "Leichtes dynamisches Durchbewegen & Mobilisation",
  };

  const fatigueTheme = FATIGUE_COLORS[currentFatigue.level];

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-6 sm:space-y-8 pb-28 md:pb-8">
      {/* ── 1. Top Section: 2D/3D Interactive Muscle Model & Fatigue Inspector ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Interactive Muscle Heatmap Visualizer */}
        <div className="lg:col-span-6 p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/25 text-purple-400 flex items-center justify-center shrink-0">
                <Activity size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                  Muskel-Heatmap & Belastungs-Status
                </h2>
                <p className="text-xs text-zinc-400">
                  Dynamische Erholungsanzeige aus Garmin & Krafttraining
                </p>
              </div>
            </div>

            {/* Front / Back Toggle */}
            <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
              <button
                onClick={() => setViewAngle("front")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  viewAngle === "front"
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Vorderseite
              </button>
              <button
                onClick={() => setViewAngle("back")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  viewAngle === "back"
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Rückseite
              </button>
            </div>
          </div>

          {/* Interactive Muscle Group Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {MUSCLE_GROUPS.map((muscle) => {
              const fatigue = muscleFatigueMap[muscle.id] || { level: "fresh", pct: 15 };
              const isSelected = selectedMuscle.id === muscle.id;
              const theme = FATIGUE_COLORS[fatigue.level];

              return (
                <button
                  key={muscle.id}
                  onClick={() => setSelectedMuscle(muscle)}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2",
                    isSelected
                      ? "bg-zinc-800 border-purple-500/80 ring-2 ring-purple-500/20"
                      : "bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-zinc-200 truncate">
                      {muscle.nameGerman}
                    </span>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", theme.bg)} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                      <span>Belastung</span>
                      <span className={theme.text}>{fatigue.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", theme.bg)}
                        style={{ width: `${fatigue.pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Hoch (&gt;75%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Moderat (40–75%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Frisch (&lt;40%)</span>
            </div>
          </div>
        </div>

        {/* Selected Muscle Focus Card & Recovery Recommendation */}
        <div className="lg:col-span-6 p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                      fatigueTheme.light,
                      fatigueTheme.text,
                      fatigueTheme.border
                    )}
                  >
                    {fatigueTheme.label}
                  </span>
                </div>
                <h3 className="text-xl font-black text-zinc-100 mt-1">
                  {selectedMuscle.nameGerman}
                </h3>
                <span className="text-xs text-zinc-500 font-mono italic">
                  {selectedMuscle.nameLatin}
                </span>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono text-zinc-100">
                  {currentFatigue.pct}%
                </span>
                <span className="text-[10px] text-zinc-500 block">Ermüdungs-Score</span>
              </div>
            </div>

            {/* Recovery Time Progress Bar */}
            <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400 font-medium">Verbleibende Superkompensation</span>
                <span className="font-bold text-zinc-200">
                  {currentFatigue.hoursLeft > 0 ? (
                    `ca. ${currentFatigue.hoursLeft} Std.`
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 size={13} /> Volle Leistungsfähigkeit
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", fatigueTheme.bg)}
                  style={{ width: `${Math.max(10, 100 - currentFatigue.pct)}%` }}
                />
              </div>
            </div>

            {/* Targeted Mobility / Foam Rolling Recommendation */}
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                <Sparkles size={14} className="text-purple-400" />
                <span>Empfohlene Regeneration & Mobility-Drill</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                {currentFatigue.drill}
              </p>
            </div>
          </div>

          <button
            onClick={onOpenFullModal}
            className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Layers size={14} />
            <span>Wger Open-Source Anatomie-Explorer öffnen</span>
          </button>
        </div>
      </div>

      {/* ── 2. Exercise Database & Activations for Selected Muscle ─────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-zinc-100">
              Übungen für {selectedMuscle.nameGerman}
            </h3>
            <span className="text-[11px] font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
              {searchedExercises.length} Übungen
            </span>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Übung oder Muskel suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-purple-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {searchedExercises.map((exercise) => (
            <div
              key={exercise.id}
              className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 space-y-3 shadow-md hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                      <Dumbbell size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-zinc-100 truncate">
                        {exercise.name}
                      </h4>
                      <span className="text-[11px] text-zinc-400 uppercase font-bold">
                        {exercise.category} • {exercise.equipment}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {exercise.primaryMuscles.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30"
                      >
                        Haupt: {m}
                      </span>
                    ))}
                    {exercise.secondaryMuscles.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400"
                      >
                        Sek: {m}
                      </span>
                    ))}
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed pt-1">
                    {exercise.hybridFocus || exercise.executionTips[0] || "Optimale Übung für funktionellen Kraftaufbau."}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[11px] text-zinc-400">
                <span>Wger Open-Source Verified</span>
                <span className="text-purple-400 font-bold flex items-center gap-1">
                  Details <ChevronRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
