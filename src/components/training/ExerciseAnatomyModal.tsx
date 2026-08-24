"use client";

import { useState } from "react";
import {
  X,
  Dumbbell,
  Activity,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  MUSCLE_GROUPS,
  EXERCISE_DATABASE,
  MuscleGroupInfo,
  ExerciseDetail,
} from "@/lib/exercises/wgerService";

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
      e.primaryMuscles.some((m) => m.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Dumbbell size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Muskel-Anatomie & Übungs-Guide</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Wger Open-Source
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Primäre & sekundäre Muskelaktivierung, Ausführung & Hybrid-Fokus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setActiveTab("exercises")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "exercises"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Dumbbell size={14} />
            <span>Übungs-Ausführung & Biomechanik</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("anatomy")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "anatomy"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity size={14} />
            <span>Muskelgruppen-Atlas</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ── TAB 1: Exercises Breakdown ─────────────────────────────────── */}
          {activeTab === "exercises" && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Exercise Selector */}
              <div className="md:col-span-4 space-y-1.5">
                <input
                  type="text"
                  placeholder="Übung filtern..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 mb-2 focus:outline-none"
                />

                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {filteredExercises.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setSelectedExercise(ex)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all text-xs font-bold flex items-center justify-between ${
                        selectedExercise.id === ex.id
                          ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                          : "bg-zinc-900 border-zinc-800/80 text-zinc-300 hover:bg-zinc-850"
                      }`}
                    >
                      <span className="truncate">{ex.name}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Exercise Detail View */}
              <div className="md:col-span-8 space-y-3.5">
                <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-400 block">
                        Biomechanische Analyse
                      </span>
                      <h3 className="text-base font-bold text-zinc-100">{selectedExercise.name}</h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-zinc-950 border border-zinc-800 text-zinc-300">
                      {selectedExercise.equipment}
                    </span>
                  </div>

                  {/* Muscle Engagement Chips */}
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                        🎯 Primäre Zielmuskeln:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedExercise.primaryMuscles.map((m, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                        ⚡ Sekundäre / Stabilisierende Muskeln:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedExercise.secondaryMuscles.map((m, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 text-[11px]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hybrid Athlete Insight */}
                  <div className="p-3 rounded-2xl bg-blue-950/20 border border-blue-500/30 text-xs text-blue-300 space-y-1">
                    <span className="font-bold flex items-center gap-1">
                      <Sparkles size={13} />
                      Hybrid Athlete Mehrwert:
                    </span>
                    <p className="text-zinc-300 leading-relaxed">{selectedExercise.hybridFocus}</p>
                  </div>
                </div>

                {/* Execution Tips & Mistakes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      Ausführungstipps
                    </span>
                    <ul className="space-y-1.5 text-zinc-300">
                      {selectedExercise.executionTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                    <span className="font-bold text-rose-400 flex items-center gap-1.5">
                      <AlertCircle size={14} />
                      Häufige Fehler
                    </span>
                    <ul className="space-y-1.5 text-zinc-300">
                      {selectedExercise.commonMistakes.map((mis, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-rose-400 font-bold">•</span>
                          <span>{mis}</span>
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MUSCLE_GROUPS.map((mg) => (
                  <button
                    key={mg.id}
                    onClick={() => setSelectedMuscle(mg)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      selectedMuscle.id === mg.id
                        ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                    }`}
                  >
                    <span className="text-xs font-bold block">{mg.nameGerman}</span>
                    <span className="text-[10px] text-zinc-500 italic block">{mg.nameLatin}</span>
                  </button>
                ))}
              </div>

              {selectedMuscle && (
                <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-zinc-100">{selectedMuscle.nameGerman}</h3>
                      <span className="text-xs text-blue-400 italic font-mono">{selectedMuscle.nameLatin}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{selectedMuscle.description}</p>

                  <div className="space-y-1.5 pt-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 block">
                      Beste Übungen für diese Muskelgruppe:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {selectedMuscle.primaryExercises.map((ex, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs font-bold"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
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
