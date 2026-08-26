import type { WorkoutType } from "@/types";

/**
 * Gemeinsame Typen & Defaults für die Google-Calendar-Zweiwege-Integration.
 *
 * Diese Datei wird von Client (Modal) UND Server (API-Routen, Engine)
 * importiert – daher ohne Browser-APIs und ohne Node-APIs.
 */

/** Workout-Typen, die in den Google Kalender geplant werden können. */
export type SchedulableWorkoutType = Exclude<WorkoutType, "rest">;

export const SCHEDULABLE_TYPES: readonly SchedulableWorkoutType[] = [
  "gym",
  "cycling",
  "running",
  "swimming",
  "stretching",
  "warmup",
  "mobility",
];

export function isSchedulableType(v: unknown): v is SchedulableWorkoutType {
  return typeof v === "string" && (SCHEDULABLE_TYPES as readonly string[]).includes(v);
}

/**
 * Bevorzugtes Zeitfenster: Workouts der gelisteten Typen sollen bevorzugt
 * in diesem Fenster liegen. `daysOfWeek` (0 = Montag … 6 = Sonntag) ist
 * optional – ohne Einschränkung gilt das Fenster an allen Tagen.
 */
export interface PreferredWindow {
  id: string;
  label: string;
  workoutTypes: SchedulableWorkoutType[];
  daysOfWeek?: number[];
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
}

export interface SchedulingSettings {
  /** Ziel-Kalender in Google ("primary" oder kalender-spezifische ID). */
  calendarId: string;
  /** Planungshorizont in Tagen (7–14). */
  planningDays: number;
  /** Puffer vor/nach fixen Terminen (Minuten) – Reise/Vorbereitungszeit. */
  bufferMinutes: number;
  /** Mindestabstand zwischen zwei Sessions am selben Tag (Stunden). */
  minGapHours: number;
  /** Frühester Trainingsstart (HH:mm). */
  dayStart: string;
  /** Spätester Trainingsbeginn-Ende-Rahmen (HH:mm). */
  dayEnd: string;
  /** Dauer pro Workout-Typ inkl. Warmup/Cooldown (Minuten). */
  durationsMinutes: Record<SchedulableWorkoutType, number>;
  preferredWindows: PreferredWindow[];
}

export const DEFAULT_SCHEDULING_SETTINGS: SchedulingSettings = {
  calendarId: "primary",
  planningDays: 10,
  bufferMinutes: 30,
  minGapHours: 7,
  dayStart: "06:30",
  dayEnd: "22:00",
  durationsMinutes: {
    gym: 90,
    cycling: 90,
    running: 60,
    swimming: 60,
    stretching: 30,
    warmup: 20,
    mobility: 20,
  },
  preferredWindows: [
    {
      id: "gym-morning",
      label: "Kraft morgens",
      workoutTypes: ["gym"],
      start: "06:30",
      end: "10:00",
    },
    {
      id: "gym-evening",
      label: "Kraft abends",
      workoutTypes: ["gym"],
      start: "17:00",
      end: "21:00",
    },
    {
      id: "intervals-evening",
      label: "Intervalle abends",
      workoutTypes: ["cycling", "running"],
      start: "17:00",
      end: "20:30",
    },
    {
      id: "long-ride-weekend",
      label: "Lange Ausfahrt Wochenende",
      workoutTypes: ["cycling"],
      daysOfWeek: [5, 6],
      start: "09:00",
      end: "16:00",
    },
  ],
};

/** Ein vom Scheduler erzeugter Vorschlag (noch nicht bestätigt). */
export interface ScheduleProposal {
  id: string;
  /** YYYY-MM-DD (Europe/Berlin) */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  workoutType: SchedulableWorkoutType;
  title: string;
  description: string;
  durationMinutes: number;
  /** 0–100, wie gut das Slot die Regeln erfüllt. */
  score: number;
  /** Menschlich lesbare Begründung der Platzierung. */
  reason: string;
}

/** Warum ein Plan-Eintrag nicht platziert werden konnte. */
export interface SkippedDay {
  date: string;
  title: string;
  reason: string;
}

/**
 * Persistenter Eintrag: verknüpft internes Workout mit dem
 * Google-Calendar-Event (zweiwege Updates/Deletes).
 */
export interface ScheduledGoogleWorkout {
  id: string;
  googleEventId: string;
  calendarId: string;
  workoutType: SchedulableWorkoutType;
  title: string;
  description: string;
  /** YYYY-MM-DD (Europe/Berlin) */
  date: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  sourceDayIndex: number;
  htmlLink?: string;
  createdAt: string;
}

/** Busy-Slot aus der Google FreeBusy-API (RFC 3339 UTC). */
export interface BusyInterval {
  start: string;
  end: string;
}

/** Kalender-Auswahl für den Schreibzugriff. */
export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeTime(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizePreferredWindows(raw: unknown): PreferredWindow[] {
  if (!Array.isArray(raw)) return DEFAULT_SCHEDULING_SETTINGS.preferredWindows;
  const windows: PreferredWindow[] = [];
  for (const item of raw.slice(0, 12)) {
    const w = item as Partial<PreferredWindow>;
    if (
      typeof w?.id !== "string" ||
      typeof w?.label !== "string" ||
      !Array.isArray(w?.workoutTypes) ||
      !w.workoutTypes.every(isSchedulableType) ||
      w.workoutTypes.length === 0
    ) {
      continue;
    }
    windows.push({
      id: w.id,
      label: w.label,
      workoutTypes: [...w.workoutTypes],
      daysOfWeek:
        Array.isArray(w.daysOfWeek) && w.daysOfWeek.length > 0
          ? w.daysOfWeek.filter((d) => typeof d === "number" && d >= 0 && d <= 6)
          : undefined,
      start: sanitizeTime(w.start, "06:30"),
      end: sanitizeTime(w.end, "22:00"),
    });
  }
  return windows;
}

/**
 * Validiert beliebige Persistenz-Daten zu vollständigen Settings
 * (unbekannte Felder werden verworfen, Defaults ergänzen Lücken).
 */
export function normalizeSchedulingSettings(raw: unknown): SchedulingSettings {
  const v = (raw ?? {}) as Partial<SchedulingSettings>;
  const durations = { ...DEFAULT_SCHEDULING_SETTINGS.durationsMinutes };
  if (v.durationsMinutes && typeof v.durationsMinutes === "object") {
    for (const type of SCHEDULABLE_TYPES) {
      const value = v.durationsMinutes[type];
      if (typeof value === "number" && Number.isFinite(value)) {
        durations[type] = clampNumber(value, 10, 480, durations[type]);
      }
    }
  }
  return {
    calendarId:
      typeof v.calendarId === "string" && v.calendarId.trim()
        ? v.calendarId.trim().slice(0, 256)
        : DEFAULT_SCHEDULING_SETTINGS.calendarId,
    planningDays: clampNumber(v.planningDays, 7, 14, DEFAULT_SCHEDULING_SETTINGS.planningDays),
    bufferMinutes: clampNumber(
      v.bufferMinutes,
      0,
      120,
      DEFAULT_SCHEDULING_SETTINGS.bufferMinutes
    ),
    minGapHours: clampNumber(v.minGapHours, 1, 14, DEFAULT_SCHEDULING_SETTINGS.minGapHours),
    dayStart: sanitizeTime(v.dayStart, DEFAULT_SCHEDULING_SETTINGS.dayStart),
    dayEnd: sanitizeTime(v.dayEnd, DEFAULT_SCHEDULING_SETTINGS.dayEnd),
    durationsMinutes: durations,
    preferredWindows: sanitizePreferredWindows(v.preferredWindows),
  };
}
