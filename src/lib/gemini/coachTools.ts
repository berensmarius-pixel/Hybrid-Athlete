/**
 * Gemini Interactions API: Modell-Fallback-Liste, Tool-Deklarationen und
 * Response-Parsing für den AI-Coach. Extrahiert aus CoachView.tsx.
 *
 * Die Modell-Kette kommt aus dem zentralen AI-Router
 * (src/lib/ai/model-router.ts) – derselbe Router enforced die Kette auch
 * serverseitig im Gemini-Proxy.
 */

import { AI_MODEL_IDS } from "@/lib/ai/model-router";

export const GEMINI_MODELS = AI_MODEL_IDS.map((id) => ({ id, api: "v1beta" }));

// ─── Tool declarations ────────────────────────────────────────────────────────

export const GYM_TEMPLATE_TOOL = {
  name: "create_gym_template",
  description:
    "Erstellt einen neuen Trainingsplan (Kraft-, Stretching- oder Mobility-Vorlage) in der App.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Spezifischer Name des Trainingsplans (z.B. 'Upper Body Hypertrophie (Brust & Rücken)', 'Unterkörper Quads & Waden', 'Ganzkörper Kraft & Stabilität', 'Hüft- & BWS-Mobilitäts-Flow')" },
      type: { type: "STRING", enum: ["gym", "warmup", "stretching", "mobility"], description: "Kategorie der Routine" },
      exercises: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Name der Übung" },
            sets: {
              type: "ARRAY",
              description: "Liste der einzelnen Sätze für diese Übung",
              items: {
                type: "OBJECT",
                properties: {
                  type: { type: "STRING", description: "Satz-Typ: 'warmup', 'working' oder 'drop'" },
                  targetReps: { type: "INTEGER", description: "Ziel-Wiederholungen für Kraftübungen (z.B. 5 für Maximalkraft, 8-12 für Muskelaufbau)" },
                  targetDuration: { type: "INTEGER", description: "Dauer in Sekunden für Dehn-, Mobilitäts- oder Halteübungen" },
                  targetRir: { type: "INTEGER", description: "Ziel RIR (Reps in Reserve), z.B. 1-2" },
                },
                required: ["type"],
              },
            },
          },
          required: ["name", "sets"],
        },
      },
    },
    required: ["name", "exercises"],
  },
};

export const SAVE_MEMORY_TOOL = {
  name: "save_memory",
  description:
    "Speichert wichtige Fakten über den Athleten dauerhaft im Coach-Gedächtnis (Ziele, Verletzungen, Präferenzen, Trainingshistorie).",
  parameters: {
    type: "OBJECT",
    properties: {
      facts: {
        type: "ARRAY",
        description: "Liste der zu speichernden Fakten als kurze Sätze",
        items: { type: "STRING" },
      },
    },
    required: ["facts"],
  },
};

export const UPDATE_WEEKLY_PLAN_TOOL = {
  name: "update_weekly_plan",
  description:
    "Aktualisiert den Wochentrainingsplan des Athleten mit einem methodisch abgestimmten, abwechslungsreichen Plan für alle 7 Tage.",
  parameters: {
    type: "OBJECT",
    properties: {
      days: {
        type: "ARRAY",
        description: "Plan für alle 7 Tage (Mo=0 bis So=6)",
        items: {
          type: "OBJECT",
          properties: {
            dayIndex: { type: "INTEGER", description: "0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So" },
            workoutType: { type: "STRING", description: "gym | running | cycling | swimming | rest | stretching | warmup | mobility" },
            title: { type: "STRING", description: "Präziser Titel, z.B. 'Unterkörper: Kniebeugen & Beinbeuger', 'Schwellenlauf 3x8 Min', 'Sweet-Spot Rad-Session 2x20 Min', 'Schwimmen 1800m CSS & Technik'" },
            description: { type: "STRING", description: "Detaillierte Beschreibung des Trainings mit Übungen/Intervallen und Belastungssteuerung" },
          },
          required: ["dayIndex", "workoutType", "title", "description"],
        },
      },
    },
    required: ["days"],
  },
};

export const ENDURANCE_TEMPLATE_TOOL = {
  name: "create_endurance_template",
  description:
    "Erstellt eine neue Vorlage für Ausdauertraining (Laufen, Radfahren, Schwimmen) in der App.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Name des Trainings, z.B. 'VO2max-Pyramide 5x800m', 'Sweet Spot 2x20 Min', 'Lockerer Zone 2 Grundlagenlauf 70 Min', 'Kraul-Technik & CSS-Intervalle'" },
      type: { type: "STRING", enum: ["running", "cycling"], description: "Art des Sports: 'running' oder 'cycling'" },
      description: { type: "STRING", description: "Detaillierte Trainingsanweisung (Pace, Puls, Zonen, Intervalle, Warmup & Cooldown)" },
      estimatedDuration: { type: "STRING", description: "Geschätzte Dauer, z.B. '50 Min', '1:15 h'" },
    },
    required: ["name", "type", "description"],
  },
};

export const LOG_WEIGHT_TOOL = {
  name: "log_body_weight",
  description: "Protokolliert das aktuelle Körpergewicht des Athleten.",
  parameters: {
    type: "OBJECT",
    properties: {
      weight: { type: "NUMBER", description: "Körpergewicht in kg" },
    },
    required: ["weight"],
  },
};

export const COMPLETE_ACTIVITY_TOOL = {
  name: "complete_planned_activity",
  description:
    "Markiert eine Einheit im Wochenplan als erledigt (hakt sie ab).",
  parameters: {
    type: "OBJECT",
    properties: {
      dayIndex: { type: "INTEGER", description: "0=Mo bis 6=So" },
      isCompleted: { type: "BOOLEAN", description: "True zum Abhaken, False zum Rückgängigmachen" },
    },
    required: ["dayIndex", "isCompleted"],
  },
};

export const DELETE_GYM_TEMPLATE_TOOL = {
  name: "delete_gym_template",
  description:
    "Löscht eine Kraft- oder Mobilitäts-Routine aus der Datenbank.",
  parameters: {
    type: "OBJECT",
    properties: {
      templateId: { type: "STRING", description: "Die ID der zu löschenden Routine." },
    },
    required: ["templateId"],
  },
};

export const DELETE_ENDURANCE_TEMPLATE_TOOL = {
  name: "delete_endurance_template",
  description:
    "Löscht eine Ausdauer-Routine (Laufen/Radfahren/Schwimmen) aus der Datenbank.",
  parameters: {
    type: "OBJECT",
    properties: {
      templateId: { type: "STRING", description: "Die ID der zu löschenden Routine." },
    },
    required: ["templateId"],
  },
};

export const SCHEDULE_GARMIN_WORKOUT_TOOL = {
  name: "schedule_garmin_workout",
  description:
    "Plant ein Workout (Kraft, Warmup, Mobility/Stretching, Laufen, Radfahren, Schwimmen, Yoga, Pilates, Benutzerdefiniert) direkt für ein Datum im nativen Garmin Connect Kalender. WICHTIG: Wenn der Nutzer ein Warm-up, Mobility oder eine benutzerdefinierte Routine anfordert, setze sportType auf 'custom', 'warmup', 'mobility', 'running' etc. und übergebe die passenden Übungen/Intervalle. Verwende NIEMALS 'gym' / Krafttraining, wenn ein Warmup oder eine andere Sportart gewünscht ist!",
  parameters: {
    type: "OBJECT",
    properties: {
      date: { type: "STRING", description: "Ziel-Datum im Format YYYY-MM-DD" },
      workoutName: { type: "STRING", description: "Spezifischer Name des Workouts, z.B. 'Dynamisches Lauf-Warm-up & Aktivierung', 'Yoga Vinyasa Flow', 'Ganzkörper Mobility & Hüfte', 'Schwellenlauf 3x2km (LT2)', 'Over-Under Rad-Intervalle 3x9m', 'Oberkörper Push & Core'" },
      sportType: { type: "STRING", enum: ["gym", "running", "cycling", "swimming", "mobility", "stretching", "warmup", "yoga", "pilates", "custom", "benutzerdefiniert", "cardio", "hiit"], description: "Sportart oder Fokus: 'custom', 'warmup', 'mobility', 'stretching', 'running', 'cycling', 'swimming', 'yoga', 'pilates', 'gym'" },
      description: {
        type: "STRING",
        description:
          "Trainingsbeschreibung mit Intervall-Vorgaben für Ausdauer oder Übungsablauf für Kraft/Mobility. Wird automatisch in strukturierte Garmin-Ziele übersetzt.",
      },
      exercises: {
        type: "ARRAY",
        description: "Übungen für Kraft- oder Mobility-Training mit Sätzen, Wiederholungen oder Haltezeiten (Sekunden)",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Name der Übung (z.B. 'World's Greatest Stretch', '90/90 Hüftmobilisation', 'Bankdrücken', 'Kniebeugen')" },
            sets: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  targetReps: { type: "NUMBER", description: "Wiederholungen (z.B. 10)" },
                  targetDuration: { type: "NUMBER", description: "Haltezeit / Dauer in Sekunden bei Mobility, Planks oder Dehnen (z.B. 45, 60)" },
                  targetWeight: { type: "NUMBER", description: "Gewicht in kg (z.B. 80 oder 0 für Bodyweight/Mobility)" },
                  restSeconds: { type: "NUMBER", description: "Pausenzeit in Sekunden (z.B. 30 bei Mobility, 90 bei Kraft)" },
                },
              },
            },
          },
        },
      },
    },
    required: ["date", "workoutName", "sportType"],
  },
};

export const INTERACTION_TOOLS = [
  { type: "function", ...GYM_TEMPLATE_TOOL },
  { type: "function", ...SAVE_MEMORY_TOOL },
  { type: "function", ...UPDATE_WEEKLY_PLAN_TOOL },
  { type: "function", ...ENDURANCE_TEMPLATE_TOOL },
  { type: "function", ...LOG_WEIGHT_TOOL },
  { type: "function", ...COMPLETE_ACTIVITY_TOOL },
  { type: "function", ...DELETE_GYM_TEMPLATE_TOOL },
  { type: "function", ...DELETE_ENDURANCE_TEMPLATE_TOOL },
  { type: "function", ...SCHEDULE_GARMIN_WORKOUT_TOOL },
];

// ─── Response parsing ─────────────────────────────────────────────────────────

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ParsedInteraction {
  text: string;
  toolCalls: ParsedToolCall[];
}

interface RawStep {
  type?: unknown;
  content?: unknown;
  name?: unknown;
  arguments?: unknown;
}

/**
 * Parst die `steps`-Struktur der Interactions API in Text + Tool-Calls.
 * Unbekannte/defekte Steps werden still übersprungen.
 */
export function parseInteractionSteps(data: unknown): ParsedInteraction {
  const result: ParsedInteraction = { text: "", toolCalls: [] };
  if (!data || typeof data !== "object") return result;

  const steps = (data as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return result;

  for (const raw of steps as RawStep[]) {
    if (!raw || typeof raw !== "object") continue;

    if (raw.type === "model_output" && Array.isArray(raw.content)) {
      for (const c of raw.content) {
        if (
          c &&
          typeof c === "object" &&
          typeof (c as { text?: unknown }).text === "string"
        ) {
          result.text += (c as { text: string }).text;
        }
      }
    }

    if (raw.type === "function_call" && typeof raw.name === "string") {
      const args =
        raw.arguments && typeof raw.arguments === "object"
          ? (raw.arguments as Record<string, unknown>)
          : {};
      result.toolCalls.push({ name: raw.name, args });
    }
  }

  return result;
}

/** Sicheres Zahlen-Lesen aus LLM-Args. */
export function argNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Sicheres String-Lesen aus LLM-Args. */
export function argString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}
