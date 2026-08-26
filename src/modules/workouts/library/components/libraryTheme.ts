import { Activity, Bike, Dumbbell, Footprints } from "lucide-react";
import type { IntensityFocus, LibraryDiscipline, LibraryStepPhase, WorkoutStatus } from "../types";

type IconRef = typeof Dumbbell;

export interface DisciplineMeta {
  label: string;
  Icon: IconRef;
  badge: string;
  bgLight: string;
  text: string;
  solidBg: string;
  border: string;
  bar: string;
}

export const DISCIPLINE_META: Record<LibraryDiscipline, DisciplineMeta> = {
  gym: {
    label: "Gym / Kraft",
    Icon: Dumbbell,
    badge: "bg-blue-600/20 text-blue-300 border-blue-500/30",
    bgLight: "bg-blue-500/10",
    text: "text-blue-400",
    solidBg: "bg-blue-600 hover:bg-blue-500",
    border: "border-blue-500/30 hover:border-blue-500/60",
    bar: "bg-blue-500",
  },
  cycling: {
    label: "Rennrad / Bike",
    Icon: Bike,
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    bgLight: "bg-orange-500/10",
    text: "text-orange-400",
    solidBg: "bg-orange-500 hover:bg-orange-400",
    border: "border-orange-500/30 hover:border-orange-500/60",
    bar: "bg-orange-500",
  },
  running: {
    label: "Laufen",
    Icon: Footprints,
    badge: "bg-green-600/20 text-green-300 border-green-500/30",
    bgLight: "bg-green-600/10",
    text: "text-green-400",
    solidBg: "bg-green-600 hover:bg-green-500",
    border: "border-green-500/30 hover:border-green-500/60",
    bar: "bg-green-500",
  },
  mobility: {
    label: "Mobility / Prehab",
    Icon: Activity,
    badge: "bg-pink-600/20 text-pink-300 border-pink-500/30",
    bgLight: "bg-pink-600/10",
    text: "text-pink-400",
    solidBg: "bg-pink-600 hover:bg-pink-500",
    border: "border-pink-500/30 hover:border-pink-500/60",
    bar: "bg-pink-500",
  },
};

export const STATUS_META: Record<WorkoutStatus, { label: string; badge: string }> = {
  planned: {
    label: "Geplant / Vorlage",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  },
  completed: {
    label: "Abgeschlossen",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  skipped: {
    label: "Übersprungen",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
};

export const FOCUS_META: Record<IntensityFocus, { label: string; badge: string }> = {
  z2: { label: "Z2 Endurance", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  sweetspot: { label: "Sweetspot", badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  "threshold-vo2max": { label: "Threshold / VO2max", badge: "bg-red-500/15 text-red-300 border-red-500/30" },
  hypertrophy: { label: "Hypertrophy", badge: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  "max-strength": { label: "Max Strength", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

export const PHASE_META: Record<
  LibraryStepPhase,
  { label: string; dot: string; bar: string; chip: string }
> = {
  warmup: {
    label: "Warmup",
    dot: "bg-amber-400",
    bar: "bg-amber-500/80",
    chip: "text-amber-300",
  },
  work: {
    label: "Work",
    dot: "bg-cyan-400",
    bar: "bg-cyan-400",
    chip: "text-cyan-300",
  },
  rest: {
    label: "Rest",
    dot: "bg-zinc-500",
    bar: "bg-zinc-600",
    chip: "text-zinc-300",
  },
  cooldown: {
    label: "Cooldown",
    dot: "bg-sky-400",
    bar: "bg-sky-500/70",
    chip: "text-sky-300",
  },
};

export function intensityColor(pct: number): string {
  if (pct >= 0.95) return "bg-red-500";
  if (pct >= 0.8) return "bg-orange-400";
  if (pct >= 0.55) return "bg-emerald-500";
  return "bg-sky-600";
}
