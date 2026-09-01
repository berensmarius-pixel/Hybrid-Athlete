"use client";

import { useState } from "react";
import {
  X,
  Zap,
  Activity,
  Bike,
  Waves,
  Dumbbell,
  Sparkles,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Check,
  Loader2,
  Flame,
  Layers,
  ChevronRight,
} from "lucide-react";
import { cn, getLocalDateString } from "@/lib/utils";
import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";
import type { GarminWorkoutPayload } from "@/lib/garmin/garminService";
import { getFitnessProfile } from "@/lib/workout/targetEngine";

interface GarminQuickWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workoutName: string, date: string) => void;
}

type SportType = "running" | "cycling" | "swimming" | "strength" | "custom" | "yoga" | "pilates";

interface ExerciseItem {
  id: string;
  name: string;
  reps?: number;
  duration?: number;
  rest: number;
}

export default function GarminQuickWorkoutModal({
  isOpen,
  onClose,
  onSuccess,
}: GarminQuickWorkoutModalProps) {
  const profile = getFitnessProfile();
  const today = getLocalDateString();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  })();

  const [sport, setSport] = useState<SportType>("running");
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState(tomorrow);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Endurance Params
  const [warmupMins, setWarmupMins] = useState(5);
  const [repeats, setRepeats] = useState(6);
  const [workMins, setWorkMins] = useState(2);
  const [workSecs, setWorkSecs] = useState(0);
  const [restMins, setRestMins] = useState(2);
  const [restSecs, setRestSecs] = useState(0);
  const [cooldownMins, setCooldownMins] = useState(5);
  const [intensity, setIntensity] = useState<"z2" | "threshold" | "vo2max">("threshold");

  // Custom / Mobility / Yoga exercises
  const [exercises, setExercises] = useState<ExerciseItem[]>([
    { id: "1", name: "Beinschwünge vor / zurück", reps: 15, rest: 15 },
    { id: "2", name: "Beinschwünge zur Seite", reps: 10, rest: 15 },
    { id: "3", name: "Walking Lunges mit Twist", reps: 8, rest: 20 },
    { id: "4", name: "Ankel Bounces", duration: 30, rest: 15 },
    { id: "5", name: "High Knees (moderat)", duration: 20, rest: 15 },
  ]);

  if (!isOpen) return null;

  // Preset loaders
  const loadPreset = (presetKey: string) => {
    setError(null);
    if (presetKey === "run_runwalk") {
      setSport("running");
      setName("Laufeinstieg: Run-Walk Intervalle");
      setWarmupMins(5);
      setRepeats(6);
      setWorkMins(2);
      setWorkSecs(0);
      setRestMins(2);
      setRestSecs(0);
      setCooldownMins(5);
      setIntensity("z2");
    } else if (presetKey === "run_threshold") {
      setSport("running");
      setName("Lauf-Schwellenintervalle 4x1000m");
      setWarmupMins(10);
      setRepeats(4);
      setWorkMins(4);
      setWorkSecs(0);
      setRestMins(2);
      setRestSecs(0);
      setCooldownMins(10);
      setIntensity("threshold");
    } else if (presetKey === "run_vo2max") {
      setSport("running");
      setName("Lauf-VO2max Intervalle 5x3m");
      setWarmupMins(10);
      setRepeats(5);
      setWorkMins(3);
      setWorkSecs(0);
      setRestMins(2);
      setRestSecs(30);
      setCooldownMins(10);
      setIntensity("vo2max");
    } else if (presetKey === "bike_sweetspot") {
      setSport("cycling");
      setName("Rad Sweetspot Intervalle 3x10m");
      setWarmupMins(10);
      setRepeats(3);
      setWorkMins(10);
      setWorkSecs(0);
      setRestMins(3);
      setRestSecs(0);
      setCooldownMins(10);
      setIntensity("threshold");
    } else if (presetKey === "swim_pyramid") {
      setSport("swimming");
      setName("Schwimm-Intervall Pyramide");
      setWarmupMins(10);
      setRepeats(5);
      setWorkMins(3);
      setWorkSecs(0);
      setRestMins(1);
      setRestSecs(0);
      setCooldownMins(5);
      setIntensity("threshold");
    } else if (presetKey === "warmup_dynamic") {
      setSport("custom");
      setName("Dynamisches Lauf-Warm-up & Aktivierung");
      setExercises([
        { id: "1", name: "Beinschwünge vor / zurück", reps: 15, rest: 15 },
        { id: "2", name: "Beinschwünge zur Seite", reps: 10, rest: 15 },
        { id: "3", name: "Walking Lunges mit Twist", reps: 8, rest: 20 },
        { id: "4", name: "Ankel Bounces", duration: 30, rest: 15 },
        { id: "5", name: "High Knees (moderat)", duration: 20, rest: 15 },
      ]);
    } else if (presetKey === "mobility_hip") {
      setSport("custom");
      setName("Hüft- & Wirbelsäulen-Mobilität");
      setExercises([
        { id: "1", name: "World's Greatest Stretch", duration: 45, rest: 20 },
        { id: "2", name: "90/90 Hüftrotation", duration: 45, rest: 20 },
        { id: "3", name: "Cat-Cow Wirbelsäulen-Mobilisation", duration: 45, rest: 15 },
        { id: "4", name: "Couch Stretch (Hüftbeuger)", duration: 45, rest: 20 },
        { id: "5", name: "Deep Squat Hold", duration: 60, rest: 30 },
      ]);
    }
  };

  const handleAddExercise = () => {
    setExercises((prev) => [
      ...prev,
      { id: String(Date.now()), name: "Neue Übung", reps: 10, rest: 20 },
    ]);
  };

  const handleUpdateExercise = (id: string, patch: Partial<ExerciseItem>) => {
    setExercises((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleRemoveExercise = (id: string) => {
    setExercises((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async () => {
    const finalName = name.trim() || getDefaultWorkoutName();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      let payload: GarminWorkoutPayload;

      if (sport === "running" || sport === "cycling" || sport === "swimming") {
        const totalDurationMins =
          warmupMins + repeats * (workMins + workSecs / 60 + restMins + restSecs / 60) + cooldownMins;

        const workLabel =
          workSecs > 0 ? `${workMins}m ${workSecs}s` : `${workMins} Min`;
        const restLabel =
          restSecs > 0 ? `${restMins}m ${restSecs}s` : `${restMins} Min`;

        const hrIntensity =
          intensity === "vo2max"
            ? "@ 165-178 bpm"
            : intensity === "threshold"
            ? "@ 150-165 bpm"
            : "@ 125-140 bpm";

        const description = `${Math.round(totalDurationMins)} Min: ${warmupMins} Min Warm-up, ${repeats}x (${workLabel} Belastung ${hrIntensity} / ${restLabel} Pause), ${cooldownMins} Min Cool-down`;

        payload = {
          name: finalName,
          type: sport,
          description,
          durationMinutes: Math.round(totalDurationMins),
          exercises: [],
        };
      } else {
        payload = {
          name: finalName,
          type: "custom",
          description: exercises.map((e, i) => `${i + 1}. ${e.name}`).join("\n"),
          exercises: exercises.map((e) => ({
            name: e.name,
            sets: [
              {
                targetReps: e.duration ? undefined : e.reps || 10,
                targetDuration: e.duration ? e.duration : undefined,
                targetWeight: 0,
                restSeconds: e.rest,
              },
            ],
          })),
        };
      }

      const res = await scheduleNativeGarminWorkout(targetDate, payload);
      if (res.success) {
        setSuccessMsg(`Workout '${finalName}' erfolgreich für ${targetDate} im Garmin-Kalender hinterlegt!`);
        onSuccess?.(finalName, targetDate);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(res.error || "Fehler beim Erstellen des Workouts");
      }
    } catch (err: any) {
      setError(err?.message || "Fehler bei der Übertragung");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDefaultWorkoutName = () => {
    switch (sport) {
      case "running":
        return `Lauf-Intervalle (${repeats}x ${workMins}m)`;
      case "cycling":
        return `Rad-Intervalle (${repeats}x ${workMins}m)`;
      case "swimming":
        return "Schwimmtraining";
      case "yoga":
        return "Yoga Vinyasa Flow";
      case "pilates":
        return "Pilates Core Routine";
      case "custom":
      default:
        return "Dynamisches Warm-up & Aktivierung";
    }
  };

  const totalCalculatedMins =
    warmupMins + repeats * (workMins + workSecs / 60 + restMins + restSecs / 60) + cooldownMins;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950/95 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Quick Workout Creator
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                  Garmin Push
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Strukturierte Intervalle oder Warm-up direkt an deine Uhr senden
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Quick Presets Bar */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 block">
              Schnell-Vorlagen
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => loadPreset("run_runwalk")}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Activity size={12} className="text-emerald-400" />
                Run-Walk (6x 2m)
              </button>
              <button
                onClick={() => loadPreset("run_threshold")}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Activity size={12} className="text-emerald-400" />
                Schwellenlauf (4x 1km)
              </button>
              <button
                onClick={() => loadPreset("bike_sweetspot")}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-orange-500/40 text-zinc-300 hover:text-orange-400 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Bike size={12} className="text-orange-400" />
                Sweetspot Rad (3x 10m)
              </button>
              <button
                onClick={() => loadPreset("warmup_dynamic")}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles size={12} className="text-indigo-400" />
                Dynamisches Lauf-Warm-up
              </button>
              <button
                onClick={() => loadPreset("mobility_hip")}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 text-zinc-300 hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles size={12} className="text-indigo-400" />
                Hüft- & Wirbelsäulen-Flow
              </button>
            </div>
          </div>

          {/* Sportart & Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 mb-1.5 block">
                Sportart / Modus
              </label>
              <div className="grid grid-cols-4 gap-1.5 bg-zinc-900/80 p-1 rounded-2xl border border-zinc-800">
                <button
                  onClick={() => setSport("running")}
                  className={cn(
                    "py-2 rounded-xl text-center font-bold transition-all flex flex-col items-center gap-1 cursor-pointer",
                    sport === "running"
                      ? "bg-emerald-500 text-zinc-950 shadow-md"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Activity size={14} />
                  <span className="text-[10px]">Laufen</span>
                </button>
                <button
                  onClick={() => setSport("cycling")}
                  className={cn(
                    "py-2 rounded-xl text-center font-bold transition-all flex flex-col items-center gap-1 cursor-pointer",
                    sport === "cycling"
                      ? "bg-orange-500 text-zinc-950 shadow-md"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Bike size={14} />
                  <span className="text-[10px]">Rad</span>
                </button>
                <button
                  onClick={() => setSport("custom")}
                  className={cn(
                    "py-2 rounded-xl text-center font-bold transition-all flex flex-col items-center gap-1 cursor-pointer",
                    sport === "custom"
                      ? "bg-cyan-500 text-zinc-950 shadow-md"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Sparkles size={14} />
                  <span className="text-[10px]">Warm-up</span>
                </button>
                <button
                  onClick={() => setSport("swimming")}
                  className={cn(
                    "py-2 rounded-xl text-center font-bold transition-all flex flex-col items-center gap-1 cursor-pointer",
                    sport === "swimming"
                      ? "bg-sky-500 text-zinc-950 shadow-md"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Waves size={14} />
                  <span className="text-[10px]">Schwimmen</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400 mb-1.5 block">
                Ziel-Datum im Garmin-Kalender
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTargetDate(today)}
                  className={cn(
                    "px-3 py-2 rounded-xl font-bold border transition-all cursor-pointer",
                    targetDate === today
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  Heute
                </button>
                <button
                  onClick={() => setTargetDate(tomorrow)}
                  className={cn(
                    "px-3 py-2 rounded-xl font-bold border transition-all cursor-pointer",
                    targetDate === tomorrow
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  Morgen
                </button>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Workout Name */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 mb-1.5 block">
              Workout Name
            </label>
            <input
              type="text"
              placeholder={getDefaultWorkoutName()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-xs font-semibold"
            />
          </div>

          {/* Form depending on Sport */}
          {sport === "running" || sport === "cycling" || sport === "swimming" ? (
            <div className="space-y-4 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Clock size={14} className="text-cyan-400" />
                  Intervall-Struktur (Gesamt: ~{Math.round(totalCalculatedMins)} Min)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIntensity("z2")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[10px] transition-colors cursor-pointer",
                      intensity === "z2"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    GA1 (Zone 2)
                  </button>
                  <button
                    onClick={() => setIntensity("threshold")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[10px] transition-colors cursor-pointer",
                      intensity === "threshold"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Schwelle (Z4)
                  </button>
                  <button
                    onClick={() => setIntensity("vo2max")}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[10px] transition-colors cursor-pointer",
                      intensity === "vo2max"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    VO2max (Z5)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">
                    Warm-up (Min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={warmupMins}
                    onChange={(e) => setWarmupMins(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-100 font-mono text-center font-bold"
                  />
                </div>

                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">
                    Wiederholungen
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={repeats}
                    onChange={(e) => setRepeats(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-mono text-center font-bold"
                  />
                </div>

                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">
                    Intervall-Dauer
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={workMins}
                      onChange={(e) => setWorkMins(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 font-mono text-center font-bold"
                    />
                    <span className="text-zinc-500">m</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={15}
                      value={workSecs}
                      onChange={(e) => setWorkSecs(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 font-mono text-center font-bold"
                    />
                    <span className="text-zinc-500">s</span>
                  </div>
                </div>

                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">
                    Pause / Erholung
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={restMins}
                      onChange={(e) => setRestMins(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 font-mono text-center font-bold"
                    />
                    <span className="text-zinc-500">m</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={15}
                      value={restSecs}
                      onChange={(e) => setRestSecs(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-100 font-mono text-center font-bold"
                    />
                    <span className="text-zinc-500">s</span>
                  </div>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-100">Garmin Struktur:</span>
                  <span>{warmupMins}m Warm-up</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-cyan-400 font-bold">
                    {repeats}x ({workMins}m {workSecs > 0 ? `${workSecs}s` : ""} Belastung + {restMins}m {restSecs > 0 ? `${restSecs}s` : ""} Pause)
                  </span>
                  <span className="text-zinc-500">→</span>
                  <span>{cooldownMins}m Cool-down</span>
                </div>
              </div>
            </div>
          ) : (
            /* Custom / Warm-up / Mobility exercise list */
            <div className="space-y-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-cyan-400" />
                  Übungen &amp; Ablauf (Benutzerdefiniert)
                </span>
                <button
                  onClick={handleAddExercise}
                  className="px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 font-bold transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                >
                  <Plus size={12} />
                  Übung hinzufügen
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {exercises.map((ex, idx) => (
                  <div
                    key={ex.id}
                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5"
                  >
                    <span className="w-5 font-mono text-zinc-500 text-center font-bold">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={ex.name}
                      onChange={(e) => handleUpdateExercise(ex.id, { name: e.target.value })}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs font-medium focus:outline-none focus:border-cyan-500"
                    />
                    {ex.duration ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={ex.duration}
                          onChange={(e) =>
                            handleUpdateExercise(ex.id, { duration: Number(e.target.value) })
                          }
                          className="w-14 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200 text-xs text-center font-mono font-bold"
                        />
                        <span className="text-zinc-500 text-[10px]">Sek</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={ex.reps}
                          onChange={(e) =>
                            handleUpdateExercise(ex.id, { reps: Number(e.target.value) })
                          }
                          className="w-14 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200 text-xs text-center font-mono font-bold"
                        />
                        <span className="text-zinc-500 text-[10px]">Wdh</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-[10px]">Pause:</span>
                      <input
                        type="number"
                        value={ex.rest}
                        onChange={(e) =>
                          handleUpdateExercise(ex.id, { rest: Number(e.target.value) })
                        }
                        className="w-12 bg-zinc-900 border border-zinc-800 rounded-lg px-1.5 py-1.5 text-zinc-200 text-xs text-center font-mono"
                      />
                      <span className="text-zinc-500 text-[10px]">s</span>
                    </div>
                    <button
                      onClick={() => handleRemoveExercise(ex.id)}
                      className="p-1.5 text-zinc-600 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 font-bold">
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Abbrechen
          </button>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-zinc-950 font-bold text-xs hover:from-cyan-400 hover:to-blue-400 transition-all cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Übertrage an Garmin...</span>
              </>
            ) : (
              <>
                <Zap size={14} />
                <span>An Garmin Kalender senden</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
