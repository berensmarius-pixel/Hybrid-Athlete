"use client";

import { useState, useEffect } from "react";
import { Bot, Sparkles, Brain, Trash2, ChevronDown, ChevronUp, CalendarDays, Key, Settings, X, ExternalLink, Check } from "lucide-react";
import { generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats } from "@/lib/stravaUtils";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import type { ChatMessage, GymTemplate, DayPlan, EnduranceTemplate } from "@/types";
import type { StravaActivity } from "@/types";

export const GEMINI_API_KEY_STORAGE = "hybrid_athlete_gemini_api_key";

const DEFAULT_FALLBACK_KEY =
  process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

const GEMINI_MODELS = [
  { id: "gemini-3.5-flash", api: "v1beta" },
  { id: "gemini-3.1-flash-lite", api: "v1beta" },
  { id: "gemini-flash-latest", api: "v1beta" },
  { id: "gemini-3.7-flash", api: "v1beta" },
  { id: "gemini-pro-latest", api: "v1beta" },
];

// ─── Strava context formatter ─────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function formatPace(ms: number): string {
  const secsPerKm = 1000 / ms;
  const min = Math.floor(secsPerKm / 60);
  const sec = Math.round(secsPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso));
}

function buildStravaContext(
  activities: StravaActivity[],
  connection: { isConnected: boolean; athlete: { firstname: string; lastname: string } | null; lastSynced: string | null }
): string {
  if (!connection.isConnected || activities.length === 0) {
    return "Strava: Nicht verbunden oder noch keine Aktivitäten synchronisiert.";
  }

  const athlete = connection.athlete;
  const lastSynced = connection.lastSynced
    ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(connection.lastSynced))
    : "–";

  const weekStats = getWeekStats(activities);

  const activityLines = activities.slice(0, 15).map((a, i) => {
    const isRun = a.sport_type === "Run" || a.type === "Run";
    const type = isRun ? "Laufen" : "Radfahren";
    const distKm = (a.distance / 1000).toFixed(2);
    const duration = formatDuration(a.moving_time);
    const speed = isRun
      ? `Pace: ${formatPace(a.average_speed)}`
      : `Tempo: ${(a.average_speed * 3.6).toFixed(1)} km/h`;
    const hr = a.average_heartrate ? `Ø HF: ${Math.round(a.average_heartrate)} bpm` : "HF: –";
    const elevation = `Höhenmeter: ${Math.round(a.total_elevation_gain)}m`;

    return `${i + 1}. ${formatDate(a.start_date_local)} | ${type} | "${a.name}"
   Distanz: ${distKm} km | Dauer: ${duration} | ${speed} | ${hr} | ${elevation}`;
  }).join("\n\n");

  const weekSection = `=== DIESE WOCHE (Strava) ===
Laufen:    ${weekStats.runKm > 0 ? `${weekStats.runKm} km (${weekStats.runCount} Einheit${weekStats.runCount !== 1 ? "en" : ""})` : "–"}
Radfahren: ${weekStats.rideKm > 0 ? `${weekStats.rideKm} km (${weekStats.rideCount} Einheit${weekStats.rideCount !== 1 ? "en" : ""})` : "–"}
Gesamt:    ${weekStats.totalHours > 0 ? `${weekStats.totalHours}h Bewegungszeit` : "–"}`;

  return `=== ATHLETENDATEN (Strava) ===
Name: ${athlete ? `${athlete.firstname} ${athlete.lastname}` : "–"}
Zuletzt synchronisiert: ${lastSynced}
Anzahl importierter Aktivitäten: ${activities.length}

${weekSection}

=== LETZTE AKTIVITÄTEN (chronologisch, neueste zuerst) ===
${activityLines}`;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  stravaContext: string,
  memories: string[],
  prs: string,
  history: string,
  gymTemplates: GymTemplate[],
  enduranceTemplates: EnduranceTemplate[],
  nutritionContext: string,
  garminContext: string,
  bodyCompContext: string
): string {
  const memorySection = memories.length > 0
    ? `=== DEIN GEDÄCHTNIS (Fakten über den Nutzer) ===\n${memories.join("\n")}`
    : "";

  const templatesContext = `=== AKTUELLE TEMPLATES (WICHTIG für IDs) ===
Kraft/Mobilität:
${gymTemplates.length > 0 ? gymTemplates.map(t => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Kraft-Templates vorhanden."}

Ausdauer:
${enduranceTemplates.length > 0 ? enduranceTemplates.map(t => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Ausdauer-Templates vorhanden."}`;

  return `Du bist ein ganzheitlicher KI-Coach für Hybrid-Athleten (Kombination aus Kraft- und Ausdauertraining, Schlaf, Erholung und Ernährung). \
Antworte immer auf Deutsch, hilfreich, präzise und motivierend.

Du hast Zugriff auf:
- Die Garmin Connect Vital- und Erholungsdaten (Training Readiness, Body Battery, HRV Status, Schlaf, Ruhepuls, verbrannte Aktiv-Kalorien).
- Die Körperzusammensetzungsdaten der Körperfettwaage (Gewicht, KFA %, Muskelmasse in kg, Wasser %, Viszeralfett).
- Den aktuellen Ernährungs- und Kalorientracker (OpenNutriTracker).
- Die Strava- und internen Trainings-Logs und Bestleistungen (PRs).

Nutze diese Daten aktiv, um dem Athleten ganzheitlich vorzugeben, was er heute trainieren soll (angepasst an Erholungszustand) und was bzw. wie viel er essen soll.

=== DEINE MÖGLICHKEITEN & TOOLS ===

1. KRAFT & MOBILITÄT: Erstelle Kraft-, Stretching- oder Mobilitäts-Routinen mit create_gym_template. (Mobilität wird in der App rosa markiert).
2. AUSDAUERTRAINING: Erstelle Vorlagen mit create_endurance_template.
3. WOCHENPLANUNG: Plane die Woche mit update_weekly_plan.
4. ABHAKEN: Nutze complete_planned_activity.
5. ADMINISTRATIVE KONTROLLE: Du kannst alte Routinen löschen mit delete_gym_template oder delete_endurance_template.
6. GEDÄCHTNIS/GEWICHT: Nutze save_memory und log_body_weight.

=== WICHTIGE REGEL FÜR ÄNDERUNGEN ===
BEVOR du ein Tool ausführst, das etwas erstellt, löscht oder massiv ändert, MUSST du:
1. Den Inhalt der Änderung kurz zusammenfassen (was wird gelöscht? was kommt neu?).
2. Den Nutzer explizit um Erlaubnis fragen.
Führe den Tool-Call ERST aus, wenn der Nutzer im nächsten Schritt zugestimmt hat. Ausnahme: Der Nutzer hat dich explizit in seiner Nachricht dazu aufgefordert ("Lösche ID X").

=== AKTUELLER KONTEXT ===
${memorySection}
${templatesContext}
${prs}

${history}

${garminContext}

${bodyCompContext}

${nutritionContext}

${stravaContext}`;
}

// ─── Gemini tool declarations ─────────────────────────────────────────────────

const GYM_TEMPLATE_TOOL = {
  name: "create_gym_template",
  description: "Erstellt einen neuen Trainingsplan (Kraft-, Stretching- oder Mobility-Vorlage) in der App.",
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

const SAVE_MEMORY_TOOL = {
  name: "save_memory",
  description: "Speichert wichtige Fakten über den Athleten dauerhaft im Coach-Gedächtnis (Ziele, Verletzungen, Präferenzen, Trainingshistorie).",
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

const UPDATE_WEEKLY_PLAN_TOOL = {
  name: "update_weekly_plan",
  description: "Aktualisiert den Wochentrainingsplan des Athleten mit einem neuen Plan für alle 7 Tage.",
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

const ENDURANCE_TEMPLATE_TOOL = {
  name: "create_endurance_template",
  description: "Erstellt eine neue Vorlage für Ausdauertraining (Laufen/Radfahren) in der App.",
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

const LOG_WEIGHT_TOOL = {
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

const COMPLETE_ACTIVITY_TOOL = {
  name: "complete_planned_activity",
  description: "Markiert eine Einheit im Wochenplan als erledigt (hakt sie ab).",
  parameters: {
    type: "OBJECT",
    properties: {
      dayIndex: { type: "INTEGER", description: "0=Mo bis 6=So" },
      isCompleted: { type: "BOOLEAN", description: "True zum Abhaken, False zum Rückgängigmachen" },
    },
    required: ["dayIndex", "isCompleted"],
  },
};

const DELETE_GYM_TEMPLATE_TOOL = {
  name: "delete_gym_template",
  description: "Löscht eine Kraft- oder Mobilitäts-Routine aus der Datenbank.",
  parameters: {
    type: "OBJECT",
    properties: {
      templateId: { type: "STRING", description: "Die ID der zu löschenden Routine." },
    },
    required: ["templateId"],
  },
};

const DELETE_ENDURANCE_TEMPLATE_TOOL = {
  name: "delete_endurance_template",
  description: "Löscht eine Ausdauer-Routine (Laufen/Radfahren) aus der Datenbank.",
  parameters: {
    type: "OBJECT",
    properties: {
      templateId: { type: "STRING", description: "Die ID der zu löschenden Routine." },
    },
    required: ["templateId"],
  },
};

const DAY_SHORTS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_FULLS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoachView() {
  const {
    saveGymTemplate: saveTemplate,
    deleteGymTemplate,
    gymTemplates,
    saveEnduranceTemplate,
    deleteEnduranceTemplate,
    enduranceTemplates,
    chatMessages: messages,
    setChatMessages: setMessages,
    coachMemories,
    addCoachMemory,
    deleteCoachMemory,
    weeklyPlan,
    updateWeeklyPlan,
    personalRecords,
    loggedSessions,
    bodyWeightLog,
    addBodyWeight,
    nutritionLogs,
    nutritionGoals,
    garminHealthLogs,
    garminActivities,
  } = useApp();
  const { activities, connection } = useStrava();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySavedNotice, setApiKeySavedNotice] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(GEMINI_API_KEY_STORAGE);
      if (stored) {
        setApiKey(stored);
        setApiKeyInput(stored);
      }
    } catch {}
  }, []);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = apiKeyInput.trim();
    setApiKey(clean);
    try {
      localStorage.setItem(GEMINI_API_KEY_STORAGE, clean);
    } catch {}
    setApiKeySavedNotice(true);
    setTimeout(() => {
      setApiKeySavedNotice(false);
      setApiKeyModalOpen(false);
    }, 1200);
  };

  async function sendMessage() {
    const text = input.trim();
    if (!text && selectedImages.length === 0) return;

    // Check if user pasted an API key directly into the chat input
    if (text.startsWith("AIzaSy") && text.length > 30 && !text.includes(" ")) {
      setApiKey(text);
      setApiKeyInput(text);
      try {
        localStorage.setItem(GEMINI_API_KEY_STORAGE, text);
      } catch {}
      setInput("");
      const confirmReply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: "✅ Dein Google Gemini API-Key wurde erfolgreich gespeichert! Ich bin startklar und habe Zugriff auf deine Garmin-, Strava- und Ernährungsdaten. Was möchtest du wissen oder planen?",
        timestamp: new Date(),
      };
      setMessages([...messages, { id: generateId(), role: "user", text: "🔑 [API-Key eingegeben]", timestamp: new Date() }, confirmReply]);
      return;
    }

    const effectiveKey = apiKey || DEFAULT_FALLBACK_KEY;
    if (!effectiveKey) {
      setApiKeyModalOpen(true);
      return;
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      text,
      timestamp: new Date(),
      images: selectedImages.length > 0 ? [...selectedImages] : undefined,
    };

    setMessages([...messages, userMsg]);
    setInput("");
    setSelectedImages([]);
    setLoading(true);

    try {
      const stravaContext = buildStravaContext(activities, connection);
      
      const prsContext = `=== PERSÖNLICHE BESTLEISTUNGEN (App PRs) ===\n${personalRecords.length > 0 
        ? personalRecords.map(p => `- ${p.exerciseName}: ${p.bestWeight}kg x ${p.bestReps} (Est. 1RM: ${p.estimated1RM}kg)`).join("\n")
        : "Noch keine PRs aufgezeichnet."}`;

      const historyContext = `=== LETZTE LOGS (App Historie) ===\n${loggedSessions.slice(0, 10).map(s => {
        const date = formatDate(s.date);
        if (s.kind === "endurance") {
          return `- ${date} | ${s.activityType === "running" ? "Laufen" : "Rad"} | ${s.duration} | RPE ${s.rpe}`;
        }
        return `- ${date} | Gym (${s.kind}) | ${s.entries.length} Übungen | RPE ${s.rpe ?? "-"}`;
      }).join("\n")}`;

      const today = new Date().toISOString().split("T")[0];
      const todayNutri = nutritionLogs.find(l => l.date === today);
      const nutriEntries = todayNutri?.entries || [];
      const totalKcal = nutriEntries.reduce((s, e) => s + (e.calories || 0), 0);
      const totalProtein = Math.round(nutriEntries.reduce((s, e) => s + (e.protein || 0), 0) * 10) / 10;
      const nutritionContext = `=== ERNÄHRUNG HEUTE (OpenNutriTracker) ===
Ziele: ${nutritionGoals.calories} kcal | ${nutritionGoals.protein}g Protein | ${nutritionGoals.carbs || 280}g Carbs | ${nutritionGoals.fat || 70}g Fett
Getrackt heute: ${totalKcal} kcal | ${totalProtein}g Protein (${nutriEntries.length} Einträge geloggt)`;

      const garmin = garminHealthLogs[today] || {
        trainingReadiness: 78,
        bodyBattery: 82,
        hrvStatus: "balanced",
        sleepScore: 85,
        sleepDurationHours: 7.8,
        activeCaloriesBurned: 620,
        restingHeartRate: 46,
      };

      const garminContext = `=== GARMIN CONNECT (Vital- & Erholungsdaten) ===
Training Readiness: ${garmin.trainingReadiness}/100
Body Battery: ${garmin.bodyBattery}%
HRV Status: ${garmin.hrvStatus}
Schlaf: ${garmin.sleepDurationHours}h (Score ${garmin.sleepScore}/100)
Ruhepuls: ${garmin.restingHeartRate} bpm
Aktiv-Kalorien verbrannt: ${garmin.activeCaloriesBurned} kcal
Garmin Aktivitäten heute: ${garminActivities.length} importiert`;

      const latestComp = bodyWeightLog && bodyWeightLog.length > 0 ? bodyWeightLog[0] : null;
      const bodyCompContext = latestComp
        ? `=== KÖRPERZUSAMMENSETZUNG (Körperfettwaage) ===
Gewicht: ${latestComp.weight} kg (vom ${latestComp.date.split("T")[0]})
Körperfett: ${latestComp.bodyFatPct ? `${latestComp.bodyFatPct}%` : "nicht gemessen"}
Muskelmasse: ${latestComp.muscleMassKg ? `${latestComp.muscleMassKg} kg (${latestComp.muscleMassPct || ""}% Anteil)` : "nicht gemessen"}
Körperwasser: ${latestComp.waterPct ? `${latestComp.waterPct}%` : "nicht gemessen"}
Viszeralfett: ${latestComp.visceralFat || "-"}
Grundumsatz (BMR): ${latestComp.bmrKcal || "-"} kcal`
        : "=== KÖRPERZUSAMMENSETZUNG ===\nNoch keine Messung vorhanden.";

      const systemPrompt = buildSystemPrompt(
        stravaContext, 
        coachMemories.map((m) => m.content),
        prsContext,
        historyContext,
        gymTemplates,
        enduranceTemplates,
        nutritionContext,
        garminContext,
        bodyCompContext
      );

      let response: Response | null = null;
      let data: any = null;
      let usedModel = "";

      const INTERACTION_TOOLS = [
        { type: "function", ...GYM_TEMPLATE_TOOL },
        { type: "function", ...SAVE_MEMORY_TOOL },
        { type: "function", ...UPDATE_WEEKLY_PLAN_TOOL },
        { type: "function", ...ENDURANCE_TEMPLATE_TOOL },
        { type: "function", ...LOG_WEIGHT_TOOL },
        { type: "function", ...COMPLETE_ACTIVITY_TOOL },
        { type: "function", ...DELETE_GYM_TEMPLATE_TOOL },
        { type: "function", ...DELETE_ENDURANCE_TEMPLATE_TOOL },
      ];

      // Fallback loop for different models on Interactions API
      for (const modelConfig of GEMINI_MODELS) {
        try {
          const modelId = modelConfig.id;
          usedModel = modelId;
          
          const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${effectiveKey}`;
          
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId,
              system_instruction: systemPrompt,
              input: text,
              tools: INTERACTION_TOOLS,
              store: true,
            }),
          });

          const json = await res.json();
          
          // Check for rate limit / quota / unavailable errors
          if (!res.ok) {
            console.warn(`Interactions model ${modelId} failed (${res.status}):`, json.error?.message);

            if (res.status === 429 || json.error?.status === "RESOURCE_EXHAUSTED") {
              continue;
            }
            
            if (res.status === 503 || json.error?.status === "UNAVAILABLE") {
              continue;
            }

            if (res.status === 400 && json.error?.message?.includes("API key")) {
              setApiKeyModalOpen(true);
              throw new Error("Ungültiger Gemini API-Key. Bitte überprüfe deinen API-Key in den Einstellungen.");
            }

            throw new Error(json.error?.message || `API Error ${res.status}`);
          }

          response = res;
          data = json;
          break; // Success!
        } catch (err) {
          console.error(`Error with model ${usedModel}:`, err);
          if (modelConfig.id === GEMINI_MODELS[GEMINI_MODELS.length - 1].id) {
            throw err;
          }
        }
      }

      if (!data) throw new Error("Alle KI-Modelle haben das Limit erreicht.");

      let finalReplyText = "";

      // Parse Interactions API steps
      if (data.steps && Array.isArray(data.steps)) {
        for (const step of data.steps) {
          if (step.type === "model_output" && Array.isArray(step.content)) {
            for (const c of step.content) {
              if (c.text) {
                finalReplyText += c.text;
              }
            }
          }

          if (step.type === "function_call") {
            const toolName = step.name;
            const args = step.arguments || {};

            if (toolName === "create_gym_template") {
              const newTemplate: GymTemplate = {
                id: generateId(),
                name: args.name,
                type: args.type || "gym",
                exercises: (args.exercises || []).map((ex: any) => ({
                  id: generateId(),
                  name: ex.name,
                  sets: (ex.sets || []).map((s: any) => ({
                    id: generateId(),
                    type: s.type || "working",
                    targetReps: s.targetReps,
                    targetDuration: s.targetDuration,
                    targetRir: s.targetRir,
                  })),
                })),
              };
              saveTemplate(newTemplate);
              finalReplyText += `\n\n✅ Der Trainingsplan **${args.name}** wurde direkt in deine Pläne gespeichert!`;
            }

            if (toolName === "create_endurance_template") {
              saveEnduranceTemplate({
                id: generateId(),
                name: args.name,
                type: args.type as "running" | "cycling",
                description: args.description,
                estimatedDuration: args.estimatedDuration,
              });
              finalReplyText += `\n\n🏃‍♂️ Die Ausdauer-Vorlage **${args.name}** wurde gespeichert!`;
            }

            if (toolName === "log_body_weight") {
              addBodyWeight({
                id: generateId(),
                date: new Date().toISOString(),
                weight: Number(args.weight),
              });
              finalReplyText += `\n\n⚖️ Dein Gewicht von **${args.weight} kg** wurde protokolliert.`;
            }

            if (toolName === "complete_planned_activity") {
              const newPlan = weeklyPlan.map(d => 
                d.dayIndex === args.dayIndex ? { ...d, isCompleted: !!args.isCompleted } : d
              );
              updateWeeklyPlan(newPlan);
              finalReplyText += args.isCompleted 
                ? `\n\n✅ Einheit für ${DAY_FULLS[args.dayIndex]} als erledigt markiert!`
                : `\n\n↩️ Erledigt-Status für ${DAY_FULLS[args.dayIndex]} zurückgesetzt.`;
            }

            if (toolName === "delete_gym_template") {
              deleteGymTemplate(args.templateId);
              finalReplyText += `\n\n🗑️ Routine mit ID \`${args.templateId}\` wurde gelöscht.`;
            }

            if (toolName === "delete_endurance_template") {
              deleteEnduranceTemplate(args.templateId);
              finalReplyText += `\n\n🗑️ Ausdauer-Routine mit ID \`${args.templateId}\` wurde gelöscht.`;
            }

            if (toolName === "save_memory") {
              const facts: string[] = args.facts || [];
              for (const fact of facts) {
                if (fact.trim()) addCoachMemory(fact.trim());
              }
              finalReplyText += `\n\n🧠 ${facts.length} Fakt${facts.length !== 1 ? "en" : ""} in meinem Gedächtnis gespeichert.`;
            }

            if (toolName === "update_weekly_plan") {
              const days: { dayIndex: number; workoutType: string; title: string; description: string }[] = args.days || [];
              const newPlan: DayPlan[] = weeklyPlan.map((existing) => {
                const update = days.find((d) => d.dayIndex === existing.dayIndex);
                if (!update) return existing;
                return {
                  ...existing,
                  workoutType: update.workoutType as DayPlan["workoutType"],
                  title: update.title,
                  description: update.description,
                  dayShort: DAY_SHORTS[existing.dayIndex],
                  dayFull: DAY_FULLS[existing.dayIndex],
                };
              });
              updateWeeklyPlan(newPlan);
              finalReplyText += `\n\n📅 Dein Wochenplan wurde aktualisiert!`;
            }
          }
        }
      }

      const reply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: finalReplyText || "Plan gespeichert!",
        timestamp: new Date(),
        model: usedModel,
      };
      setMessages([...messages, userMsg, reply]);
    } catch (err) {
      const isQuotaError = err instanceof Error && (err.message.includes("Quota") || err.message.includes("limit") || err.message.includes("exhausted"));
      const errorReply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: isQuotaError 
          ? "Entschuldigung, alle meine KI-Kapazitäten für heute sind aufgebraucht (Tageslimit überschritten). Bitte versuche es morgen wieder oder verbinde einen eigenen API-Key."
          : "Entschuldigung, meine Verbindung zum Server ist gerade gestört. Versuche es später noch einmal.",
        timestamp: new Date(),
      };
      setMessages([...messages, userMsg, errorReply]);
    } finally {
      setLoading(false);
    }
  }

  const hasStravaData = connection.isConnected && activities.length > 0;

  return (
    <div className="flex flex-col h-full pb-16 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 border-b border-zinc-800/60 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Bot size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-1.5">
                KI Hybrid Coach
                <Sparkles size={14} className="text-blue-400" />
              </h1>
              <p className="text-xs text-zinc-500">Dein persönlicher Trainingsberater</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Strava data indicator */}
            {hasStravaData && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <svg viewBox="0 0 24 24" className="w-3 h-3 text-orange-400 fill-current" aria-hidden="true">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                <span className="text-[10px] font-medium text-orange-400">{activities.length}</span>
              </div>
            )}

            {/* Memory toggle */}
            <button
              onClick={() => setShowMemories((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
                showMemories
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Brain size={14} />
              <span className="text-[10px] font-semibold">{coachMemories.length}</span>
              {showMemories ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {/* API Key settings button */}
            <button
              onClick={() => setApiKeyModalOpen(true)}
              className={`p-1.5 rounded-lg border transition-colors ${
                apiKey
                  ? "bg-zinc-800 border-zinc-700 text-emerald-400 hover:text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 animate-pulse"
              }`}
              title={apiKey ? "Gemini API-Key verwalten" : "Gemini API-Key eintragen"}
            >
              <Key size={15} />
            </button>

            {/* AI week planning */}
            <button
              onClick={() => {
                const prompt = `Analysiere meine Strava-Daten oben und erstelle JETZT SOFORT einen vollständigen Wochenplan für alle 7 Tage (Mo–So) mit der update_weekly_plan Funktion. Regeln:
- Nutze die Strava-Daten um Volumen, Belastung und Erholung einzuschätzen
- Wenn kein Ziel bekannt: Hybrid-Athlete-Standard (3× Gym, 2× Laufen, 1× Rad, 1× Pause)
- Schreibe kurze, konkrete Titel und Beschreibungen für jeden Tag
- Speichere den Plan direkt — frag nicht nach, sondern handle und erkläre danach kurz deine Entscheidungen`;
                setInput(prompt);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-colors"
              title="KI Wochenplan generieren"
            >
              <CalendarDays size={14} />
            </button>
          </div>
        </div>

        {/* Memory panel */}
        {showMemories && (
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">Coach-Gedächtnis</p>
            {coachMemories.length === 0 ? (
              <p className="text-xs text-zinc-600">Noch keine Fakten gespeichert. Der Coach merkt sich wichtige Dinge automatisch.</p>
            ) : (
              <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                {coachMemories.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 group">
                    <span className="text-xs text-zinc-300 flex-1 leading-snug">{m.content}</span>
                    <button
                      onClick={() => deleteCoachMemory(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0 mt-0.5"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Inline API Key Banner if no key configured */}
        {!apiKey && (
          <div className="p-3.5 rounded-2xl bg-linear-to-r from-amber-500/10 via-zinc-900 to-zinc-900 border border-amber-500/30 shadow-lg space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Key size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-100">
                  Google Gemini API-Key erforderlich
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Füge deinen Key hier ein oder tippe ihn direkt in das Chatfeld:
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveApiKey} className="flex gap-2">
              <input
                type="password"
                placeholder="AIzaSy... (Hier einfügen)"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all shrink-0"
              >
                Speichern
              </button>
            </form>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
              <span>Kostenlos in 30 Sekunden:</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
              >
                <span>aistudio.google.com</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <ChatWindow messages={messages} />

      {/* Loading indicator */}
      {loading && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Bot size={13} className="text-blue-400" />
          </div>
          <div className="flex gap-1 items-center px-3 py-2 bg-zinc-800 rounded-2xl rounded-tl-sm">
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        disabled={loading}
        images={selectedImages}
        onAddImage={(img) => setSelectedImages(prev => [...prev, img])}
        onRemoveImage={(idx) => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
      />

      {/* ── API Key Modal ────────────────────────────────────────────────────── */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Key size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Google Gemini API-Key</h3>
                  <p className="text-xs text-zinc-400">Kostenlos für KI-Coach & Ernährungsanalyse</p>
                </div>
              </div>
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Dein API-Key
                </label>
                <input
                  type="password"
                  required
                  placeholder="AIzaSy..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 space-y-1.5">
                <p className="font-semibold text-zinc-300">Noch keinen Key?</p>
                <p>
                  Du kannst dir in 30 Sekunden kostenlos einen persönlichen Key bei Google AI Studio erstellen:
                </p>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold pt-0.5"
                >
                  <span>Google AI Studio öffnen</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {apiKeySavedNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5">
                  <Check size={14} />
                  <span>API-Key erfolgreich gespeichert!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setApiKeyModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Key speichern</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
