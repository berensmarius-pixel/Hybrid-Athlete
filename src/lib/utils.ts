import type { WorkoutType } from "@/types";

// ─── Color maps ───────────────────────────────────────────────────────────────

interface ColorSet {
  bg: string;
  bgLight: string;
  text: string;
  border: string;
  dot: string;
  badge: string;
}

export const WORKOUT_COLORS: Record<WorkoutType, ColorSet> = {
  gym: {
    bg: "bg-blue-600",
    bgLight: "bg-blue-600/10",
    text: "text-blue-400",
    border: "border-blue-500",
    dot: "bg-blue-500",
    badge: "bg-blue-600/20 text-blue-300 border border-blue-500/30",
  },
  cycling: {
    bg: "bg-orange-500",
    bgLight: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500",
    dot: "bg-orange-500",
    badge: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  },
  running: {
    bg: "bg-green-600",
    bgLight: "bg-green-600/10",
    text: "text-green-400",
    border: "border-green-500",
    dot: "bg-green-500",
    badge: "bg-green-600/20 text-green-300 border border-green-500/30",
  },
  rest: {
    bg: "bg-zinc-600",
    bgLight: "bg-zinc-600/10",
    text: "text-zinc-400",
    border: "border-zinc-500",
    dot: "bg-zinc-500",
    badge: "bg-zinc-700/50 text-zinc-400 border border-zinc-600/30",
  },
  stretching: {
    bg: "bg-purple-600",
    bgLight: "bg-purple-600/10",
    text: "text-purple-400",
    border: "border-purple-500",
    dot: "bg-purple-500",
    badge: "bg-purple-600/20 text-purple-300 border border-purple-500/30",
  },
  warmup: {
    bg: "bg-amber-500",
    bgLight: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500",
    dot: "bg-amber-500",
    badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  },
  mobility: {
    bg: "bg-pink-600",
    bgLight: "bg-pink-600/10",
    text: "text-pink-400",
    border: "border-pink-500",
    dot: "bg-pink-500",
    badge: "bg-pink-600/20 text-pink-300 border border-pink-500/30",
  },
};

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  gym: "Krafttraining",
  cycling: "Radfahren",
  running: "Laufen",
  rest: "Ruhe",
  stretching: "Dehnen",
  warmup: "Aufwärmen",
  mobility: "Mobilität",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Lokales Datum als "YYYY-MM-DD" – NICHT UTC.
 * `toISOString().split("T")[0]` liefert den UTC-Tag und liegt damit
 * in Deutschland zwischen 00:00 und 01:59 CET falsch.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns 0 (Mon) … 6 (Sun) for today */
export function getTodayIndex(): number {
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** Format: "Mo, 14. Apr" */
export function formatDayLabel(dayIndex: number): string {
  const today = new Date();
  const jsToday = today.getDay();
  const todayMon = jsToday === 0 ? 6 : jsToday - 1;
  const diff = dayIndex - todayMon;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

/** Returns the day-of-month number for a given Mon-based dayIndex relative to this week */
export function getDayOfMonth(dayIndex: number): number {
  const today = new Date();
  const jsToday = today.getDay();
  const todayMon = jsToday === 0 ? 6 : jsToday - 1;
  const diff = dayIndex - todayMon;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.getDate();
}

// ─── ID generator ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Duration formatting (zentral statt pro Komponente dupliziert) ───────────

/** Sekunden → menschenlesbar: "1h 05min" / "45min" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

/** Sekunden → Stoppuhr-Format: "MM:SS" / "H:MM:SS" */
export function formatClockDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

