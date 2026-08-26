/**
 * Baut die Google-Calendar-Event-Payloads für Workouts:
 * Titel-Format `🏋️ [Gym] Upper Push`, strukturierte Beschreibung mit
 * Trainingsüberblick, Zonen/Watts-Hinweisen & Fueling-Empfehlungen.
 */

import type { SchedulableWorkoutType } from "./types";

const TYPE_EMOJI: Record<SchedulableWorkoutType, string> = {
  gym: "🏋️",
  cycling: "🚴",
  running: "🏃",
  stretching: "🧘",
  warmup: "🔥",
  mobility: "🤸",
};

const TYPE_LABEL: Record<SchedulableWorkoutType, string> = {
  gym: "Gym",
  cycling: "Bike",
  running: "Run",
  stretching: "Mobility",
  warmup: "Warmup",
  mobility: "Mobility",
};

/** Google-Farben (colorId) pro Typ – schnelle visuelle Unterscheidung. */
const TYPE_COLOR_ID: Record<SchedulableWorkoutType, string> = {
  gym: "11", // Tomato
  cycling: "9", // Blueberry
  running: "10", // Basil
  stretching: "1", // Lavender
  warmup: "5", // Banana
  mobility: "1",
};

export function buildEventTitle(type: SchedulableWorkoutType, rawTitle: string): string {
  // Plan-Titel wie "Krafttraining: Upper Push" auf den Kern kürzen
  const cleaned = rawTitle.includes(":") ? rawTitle.split(":").slice(1).join(":").trim() : rawTitle.trim();
  const core = cleaned.length > 0 ? cleaned : TYPE_LABEL[type];
  return `${TYPE_EMOJI[type]} [${TYPE_LABEL[type]}] ${core}`.slice(0, 180);
}

const FUELING_ADVICE: Record<SchedulableWorkoutType, string> = {
  gym:
    "🍽 Fueling: 1,5–2 h vorher kohlenhydratbetonte Mahlzeit + 30 g Protein. " +
    "Während der Session Wasser; danach 30–40 g Protein zur Synthese.",
  cycling:
    "🍽 Fueling: 2–3 h vorher komplexe Carbs. Bei >75 Min: 40–60 g Carbs/h " +
    "(Gel/Banane). Danach 4:1 Carbs-zu-Protein zur Glykogen-Resynthese.",
  running:
    "🍽 Fueling: leicht verdauliche Carbs 90 Min vorher. Bei >60 Min Wasser " +
    "mit Elektrolyten mitnehmen. Post-Run: Protein + Glykogen auffüllen.",
  stretching:
    "🍽 Fueling: kein besonderes Timing nötig – Wasser reicht. Ideal am " +
    "Trainingstag zur Erholungsunterstützung.",
  warmup:
    "🍽 Fueling: kurzer Snack optional. Hauptsächlich Aktivierung & Mobilisation.",
  mobility:
    "🍽 Fueling: kein besonderes Timing nötig – ideal als aktive Erholung.",
};

/**
 * Strukturierte Event-Beschreibung: Überblick, Zonen/Watt-Hinweise,
 * Fueling und Traceability-Marker.
 */
export function buildEventDescription(
  type: SchedulableWorkoutType,
  title: string,
  description: string,
  scheduleId: string,
  durationMinutes: number
): string {
  const lines = [
    "📋 TRAININGSÜBERBLICK",
    "─────────────────────",
    description.trim() || "Keine weiteren Details im Trainingsplan hinterlegt.",
    "",
    `⏱ Dauer: ca. ${durationMinutes} Min (inkl. Warmup & Cooldown)`,
    zoneHint(type),
    FUELING_ADVICE[type],
    "",
    "─────────────────────",
    `🤖 Automatisch geplant von Hybrid Athlete • ID ${scheduleId}`,
  ];
  return lines.join("\n").slice(0, 8000);
}

function zoneHint(type: SchedulableWorkoutType): string {
  switch (type) {
    case "cycling":
      return "🎯 Zonen: Grundlage 60–70 % FTP (Z2), Intervalle 95–105 % FTP (Z4). Watt-Vorgaben aus dem Intervall-Template beachten.";
    case "running":
      return "🎯 Zonen: lockere Einheiten < 75 % HFmax, Tempoeinheiten im Threshold-Bereich (~88–92 % HFmax).";
    case "gym":
      return "🎯 Intensität: progressive Überlastung – RIR 1–2 bei Hauptübungen, RIR 2–3 bei Accessoires.";
    default:
      return "🎯 Fokus: Qualität der Bewegung vor Intensität.";
  }
}

export interface GoogleEventPayload {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId: string;
  reminders: { useDefault: boolean; overrides: { method: "popup"; minutes: number }[] };
  extendedProperties: { private: Record<string, string> };
}

/** Vollständige Payload für events.insert. */
export function buildEventPayload(params: {
  workoutType: SchedulableWorkoutType;
  title: string;
  description: string;
  scheduleId: string;
  durationMinutes: number;
  startIso: string;
  endIso: string;
}): GoogleEventPayload {
  return {
    summary: buildEventTitle(params.workoutType, params.title),
    description: buildEventDescription(
      params.workoutType,
      params.title,
      params.description,
      params.scheduleId,
      params.durationMinutes
    ),
    start: { dateTime: params.startIso, timeZone: "Europe/Berlin" },
    end: { dateTime: params.endIso, timeZone: "Europe/Berlin" },
    colorId: TYPE_COLOR_ID[params.workoutType],
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 45 }],
    },
    extendedProperties: {
      private: {
        hybridAthleteScheduleId: params.scheduleId,
        hybridAthleteType: params.workoutType,
        hybridAthleteApp: "hybrid-athlete",
      },
    },
  };
}
