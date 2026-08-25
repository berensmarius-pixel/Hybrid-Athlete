/**
 * Gemini Interactions API: Modell-Fallback-Liste, Tool-Deklarationen und
 * Response-Parsing für den AI-Coach. Extrahiert aus CoachView.tsx.
 */

export const GEMINI_MODELS = [
  { id: "gemini-3.5-flash", api: "v1beta" },
  { id: "gemini-3.1-flash-lite", api: "v1beta" },
  { id: "gemini-flash-latest", api: "v1beta" },
  { id: "gemini-3.7-flash", api: "v1beta" },
  { id: "gemini-pro-latest", api: "v1beta" },
] as const;

// ─── Tool declarations ────────────────────────────────────────────────────────

export const GYM_TEMPLATE_TOOL = {
  name: "create_gym_template",
  description:
    "Erstellt einen neuen Trainingsplan (Kraft-, Stretching- oder Mobility-Vorlage) in der App.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Name des Trainingsplans (z.B. Upper Push, Mobilitäts-Flow)" },
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
                  targetReps: { type: "INTEGER", description: "Ziel-Wiederholungen für Kraftübungen" },
                  targetDuration: { type: "INTEGER", description: "Dauer in Sekunden für Dehn- oder Aufwärmübungen" },
                  targetRir: { type: "INTEGER", description: "Ziel RIR (Reps in Reserve), z.B. 2" },
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
    "Aktualisiert den Wochentrainingsplan des Athleten mit einem neuen Plan für alle 7 Tage.",
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
            workoutType: { type: "STRING", description: "gym | running | cycling | rest | stretching | warmup" },
            title: { type: "STRING", description: "Kurzer Titel, z.B. 'Upper Push A'" },
            description: { type: "STRING", description: "Beschreibung des Trainings" },
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
    "Erstellt eine neue Vorlage für Ausdauertraining (Laufen/Radfahren) in der App.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Name des Trainings, z.B. 'Intervalle 5x1km', 'Lockerer Dauerlauf'" },
      type: { type: "STRING", description: "Art des Sports: 'running' oder 'cycling'" },
      description: { type: "STRING", description: "Detaillierte Trainingsanweisung (Pace, Puls, Intervalle)" },
      estimatedDuration: { type: "STRING", description: "Geschätzte Dauer, z.B. '45 Min', '1:30 h'" },
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
    "Löscht eine Ausdauer-Routine (Laufen/Radfahren) aus der Datenbank.",
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
    "Plant ein Workout (Kraft, Laufen, Radfahren) direkt für ein Datum im nativen Garmin Connect Kalender. Das Workout erscheint morgens auf der Uhr (Forerunner 265 / Edge 840) zum direkten Starten.",
  parameters: {
    type: "OBJECT",
    properties: {
      date: { type: "STRING", description: "Ziel-Datum im Format YYYY-MM-DD" },
      workoutName: { type: "STRING", description: "Name des Workouts, z.B. 'AI Adaptive Upper Push'" },
      sportType: { type: "STRING", enum: ["gym", "running", "cycling"], description: "Sportart" },
      exercises: {
        type: "ARRAY",
        description: "Übungen für Krafttraining mit Sätzen, Reps und Gewichten",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Name der Übung (z.B. Bankdrücken, Kniebeugen)" },
            sets: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  targetReps: { type: "NUMBER", description: "Wiederholungen (z.B. 8)" },
                  targetWeight: { type: "NUMBER", description: "Gewicht in kg (z.B. 80)" },
                  restSeconds: { type: "NUMBER", description: "Pausenzeit in Sekunden (z.B. 90)" },
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
