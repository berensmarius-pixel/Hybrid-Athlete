"use client";

import { useState } from "react";
import {
  X,
  Dumbbell,
  Activity,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Search,
  RotateCcw,
  Layers,
} from "lucide-react";
import {
  MUSCLE_GROUPS,
  EXERCISE_DATABASE,
  MuscleGroupInfo,
  ExerciseDetail,
} from "@/lib/exercises/wgerService";
import BodyAnatomyViewer from "./BodyAnatomyViewer";
import { cn } from "@/lib/utils";

interface ExerciseAnatomyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExerciseAnatomyModal({ isOpen, onClose }: ExerciseAnatomyModalProps) {
  const [activeTab, setActiveTab] = useState<"exercises" | "anatomy">("exercises");
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDetail>(EXERCISE_DATABASE[0]);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupInfo>(MUSCLE_GROUPS[0]);
  const [searchFilter, setSearchFilter] = useState("");

  if (!isOpen) return null;

  const filteredExercises = EXERCISE_DATABASE.filter(
    (e) =>
      e.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      e.primaryMuscles.some((m) => m.toLowerCase().includes(searchFilter.toLowerCase())) ||
      e.secondaryMuscles.some((m) => m.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  // Cross-linking handler from Muscle Atlas -> Exercise Biomechanics
  const handleNavigateToExercise = (exerciseName: string) => {
    const matched = EXERCISE_DATABASE.find(
      (e) =>
        e.name.toLowerCase().includes(exerciseName.toLowerCase()) ||
        exerciseName.toLowerCase().includes(e.name.toLowerCase())
    );
    if (matched) {
      setSelectedExercise(matched);
      setActiveTab("exercises");
    }
  };

  // Cross-linking handler from Exercise Biomechanics -> Muscle Atlas
  const handleNavigateToMuscle = (muscleName: string) => {
    const matched = MUSCLE_GROUPS.find(
      (m) =>
        m.nameGerman.toLowerCase().includes(muscleName.toLowerCase()) ||
        m.nameLatin.toLowerCase().includes(muscleName.toLowerCase()) ||
        muscleName.toLowerCase().includes(m.nameGerman.toLowerCase())
    );
    if (matched) {
      setSelectedMuscle(matched);
      setActiveTab("anatomy");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-zinc-950 border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/30 shrink-0">
              <Dumbbell size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-zinc-100">
                  Muskel-Anatomie & Übungs-Guide
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  wger Open-Source
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-0.5">
                Primäre & sekundäre Muskelaktivierung, Biomechanik & Hybrid-Fokus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-zinc-800 px-4 sm:px-6 pt-2 gap-3 shrink-0 bg-zinc-950/80">
          <button
            type="button"
            onClick={() => setActiveTab("exercises")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "exercises"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-neutral-400 hover:text-zinc-200"
            )}
          >
            <Dumbbell size={14} />
            <span>Übungs-Ausführung & Biomechanik</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("anatomy")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "anatomy"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-neutral-400 hover:text-zinc-200"
            )}
          >
            <Activity size={14} />
            <span>Muskelgruppen-Atlas</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* ── TAB 1: Exercises Breakdown ─────────────────────────────────── */}
          {activeTab === "exercises" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left Column: Exercise Selector with Search and Clear Button */}
              <div className="md:col-span-4 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Übung oder Muskel filtern..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8.5 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-400 focus:outline-hidden focus:border-blue-500 font-medium"
                  />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {filteredExercises.length > 0 ? (
                  <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                    {filteredExercises.map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => setSelectedExercise(ex)}
                        className={cn(
                          "w-full text-left p-3.5 rounded-2xl border transition-all text-xs font-bold flex items-center justify-between cursor-pointer",
                          selectedExercise.id === ex.id
                            ? "bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-md shadow-blue-500/10"
                            : "bg-zinc-900/90 border-zinc-800/80 text-neutral-300 hover:bg-zinc-850 hover:border-zinc-700"
                        )}
                      >
                        <span className="truncate">{ex.name}</span>
                        <ChevronRight size={14} className="text-zinc-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-zinc-900/60 border border-dashed border-zinc-800 text-center space-y-2">
                    <p className="text-xs text-neutral-400 font-medium">Keine passenden Übungen gefunden.</p>
                    <button
                      onClick={() => setSearchFilter("")}
                      className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1 mx-auto"
                    >
                      <RotateCcw size={12} />
                      <span>Filter zurücksetzen</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Exercise Detail View & Interactive SVG Anatomy */}
              <div className="md:col-span-8 space-y-4">
                <div className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-400 block">
                        Biomechanische Analyse
                      </span>
                      <h3 className="text-lg font-black text-zinc-100">{selectedExercise.name}</h3>
                    </div>
                    <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-zinc-950 border border-zinc-800 text-neutral-300 uppercase self-start sm:self-auto">
                      {selectedExercise.equipment}
                    </span>
                  </div>

                  {/* Muscle Engagement Chips with Cross-Linking */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                        🎯 Primäre Zielmuskeln (Klick = Atlas):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedExercise.primaryMuscles.map((m, i) => (
                          <button
                            key={i}
                            onClick={() => handleNavigateToMuscle(m)}
                            className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25 transition-colors text-xs font-bold cursor-pointer"
                            title="Zu Muskelkarte im Atlas springen"
                          >
                            {m} ↗
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
                        ⚡ Sekundäre / Stabilisierende Muskeln:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedExercise.secondaryMuscles.map((m, i) => (
                          <button
                            key={i}
                            onClick={() => handleNavigateToMuscle(m)}
                            className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-bold cursor-pointer"
                            title="Zu Muskelkarte im Atlas springen"
                          >
                            {m} ↗
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Visual SVG Anatomy Highlight */}
                  <div className="pt-2">
                    <BodyAnatomyViewer
                      primaryMuscles={selectedExercise.primaryMuscles}
                      secondaryMuscles={selectedExercise.secondaryMuscles}
                    />
                  </div>

                  {/* Hybrid Athlete Insight */}
                  <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-300 space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-blue-200">
                      <Sparkles size={14} className="text-blue-400" />
                      Hybrid Athlete Nutzen:
                    </span>
                    <p className="text-neutral-300 leading-relaxed font-medium">
                      {selectedExercise.hybridFocus}
                    </p>
                  </div>
                </div>

                {/* Execution Tips & Mistakes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2.5">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 size={15} />
                      Ausführungstipps
                    </span>
                    <ul className="space-y-1.5 text-neutral-300">
                      {selectedExercise.executionTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span className="leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2.5">
                    <span className="font-bold text-rose-400 flex items-center gap-1.5 text-xs">
                      <AlertCircle size={15} />
                      Häufige Fehler
                    </span>
                    <ul className="space-y-1.5 text-neutral-300">
                      {selectedExercise.commonMistakes.map((mis, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-rose-400 font-bold">•</span>
                          <span className="leading-relaxed">{mis}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: Muscle Anatomy Atlas ───────────────────────────────── */}
          {activeTab === "anatomy" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {MUSCLE_GROUPS.map((mg) => (
                  <button
                    key={mg.id}
                    onClick={() => setSelectedMuscle(mg)}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                      selectedMuscle.id === mg.id
                        ? "bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-md"
                        : "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 text-neutral-300"
                    )}
                  >
                    <span className="text-xs font-bold block truncate">{mg.nameGerman}</span>
                    <span className="text-[10px] text-neutral-400 font-mono italic block truncate mt-0.5">
                      {mg.nameLatin}
                    </span>
                  </button>
                ))}
              </div>

              {selectedMuscle && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-8 p-5 sm:p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4">
                    <div>
                      <h3 className="text-lg font-black text-zinc-100">{selectedMuscle.nameGerman}</h3>
                      <span className="text-xs text-blue-400 italic font-mono font-medium">
                        {selectedMuscle.nameLatin}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed font-medium">
                      {selectedMuscle.description}
                    </p>

                    <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                        Beste Übungen (Klick = Biomechanik-Analyse):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedMuscle.primaryExercises.map((ex, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleNavigateToExercise(ex)}
                            className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 text-neutral-200 hover:text-blue-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <span>{ex}</span>
                            <ChevronRight size={12} className="text-blue-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-4">
                    <BodyAnatomyViewer activeMuscleId={selectedMuscle.id} className="h-full" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
