"use client";

import { useState } from "react";
import { Bot, Sparkles, Brain, Trash2, ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import { generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats } from "@/lib/stravaUtils";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import type { ChatMessage, GymTemplate, DayPlan, EnduranceTemplate } from "@/types";
import type { StravaActivity } from "@/types";

const GEMINI_KEY = "AIzaSyB8etVS0VuF21zxdkOJidxsgIImf0wK5ZE";
const GEMINI_MODELS = [
  { id: "gemini-3.1-pro-preview", api: "v1beta" },
  { id: "gemini-3-flash-preview", api: "v1beta" },
  { id: "gemini-3.1-flash-lite-preview", api: "v1beta" },
  { id: "gemini-2.5-flash", api: "v1beta" },
  { id: "gemini-2.5-pro", api: "v1beta" },
  { id: "gemini-2.5-flash-lite", api: "v1beta" },
  { id: "gemini-1.5-flash", api: "v1" },
  { id: "gemini-1.5-flash-8b", api: "v1" },
  { id: "gemini-1.5-pro", api: "v1" }
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

function buildSystemPrompt(stravaContext: string, memories: string[], prs: string, history: string, gymTemplates: GymTemplate[], enduranceTemplates: EnduranceTemplate[]): string {
  const memorySection = memories.length > 0
    ? `=== DEIN GEDÄCHTNIS (Fakten über den Nutzer) ===\n${memories.join("\n")}`
    : "";

  const templatesContext = `=== AKTUELLE TEMPLATES (WICHTIG für IDs) ===
Kraft/Mobilität:
${gymTemplates.length > 0 ? gymTemplates.map(t => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Kraft-Templates vorhanden."}

Ausdauer:
${enduranceTemplates.length > 0 ? enduranceTemplates.map(t => `- [${t.type}] ${t.name} (ID: ${t.id})`).join("\n") : "Keine Ausdauer-Templates vorhanden."}`;

  return `Du bist ein KI-Coach für Hybrid-Athleten (Kombination aus Kraft- und Ausdauertraining). \
Antworte immer auf Deutsch, hilfreich, präzise und motivierend.

Du hast Zugriff auf die echten Trainingsdaten des Athleten aus Strava sowie auf die internen App-Daten (PRs, Logs). \
Nutze diese Daten aktiv, um personalisierte Antworten zu geben.

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
    addBodyWeight,
  } = useApp();
  const { activities, connection } = useStrava();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  async function sendMessage() {
    const text = input.trim();
    if (!text && selectedImages.length === 0) return;

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

      const systemPrompt = buildSystemPrompt(
        stravaContext, 
        coachMemories.map((m) => m.content),
        prsContext,
        historyContext,
        gymTemplates,
        enduranceTemplates
      );

      const historyMessages = [...messages, userMsg].map((m) => {
        const parts: any[] = [{ text: m.text }];
        
        if (m.images && m.images.length > 0) {
          m.images.forEach(img => {
            const [meta, data] = img.split(",");
            const mimeType = meta.split(":")[1].split(";")[0];
            parts.push({
              inlineData: {
                mimeType,
                data
              }
            });
          });
        }

        return {
          role: m.role === "coach" ? "model" : "user",
          parts,
        };
      });

      const apiMessages = [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Verstanden! Ich bin dein KI Hybrid Coach und habe Zugriff auf deine Strava-Daten, Bestleistungen, Trainingshistorie und mein Gedächtnis. Wie kann ich dir helfen?" }] },
        ...historyMessages,
      ];

      let response: Response | null = null;
      let data: any = null;
      let usedModel = "";

      // Fallback loop for different models
      for (const modelConfig of GEMINI_MODELS) {
        try {
          const modelId = modelConfig.id;
          const apiVersion = modelConfig.api;
          usedModel = modelId;
          
          const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelId}:generateContent?key=${GEMINI_KEY}`;
          
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: apiMessages,
              tools: [{ functionDeclarations: [GYM_TEMPLATE_TOOL, SAVE_MEMORY_TOOL, UPDATE_WEEKLY_PLAN_TOOL, ENDURANCE_TEMPLATE_TOOL, LOG_WEIGHT_TOOL, COMPLETE_ACTIVITY_TOOL, DELETE_GYM_TEMPLATE_TOOL, DELETE_ENDURANCE_TEMPLATE_TOOL] }],
            }),
          });

          const json = await res.json();
          
          // Check for rate limit / quota errors
          if (!res.ok) {
            // Log for debugging
            console.warn(`Model ${modelId} failed (${res.status}):`, json.error?.message);

            if (res.status === 429 || json.error?.status === "RESOURCE_EXHAUSTED") {
              console.warn(`Model ${modelId} exhausted (Quota exceeded), trying fallback...`);
              continue;
            }
            
            // If the model is not found in the current API version, try fallback instead of crashing
            if (res.status === 404) {
              console.warn(`Model ${modelId} not found in ${apiVersion}, trying fallback...`);
              continue;
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

      if (data.candidates && data.candidates.length > 0) {
        const parts = data.candidates[0].content?.parts ?? [];
        let finalReplyText = "";

        for (const part of parts) {
          if (part.text) {
            finalReplyText += part.text;
          }

          if (part.functionCall?.name === "create_gym_template") {
            const args = part.functionCall.args;
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

          if (part.functionCall?.name === "create_endurance_template") {
            const args = part.functionCall.args;
            saveEnduranceTemplate({
              id: generateId(),
              name: args.name,
              type: args.type as "running" | "cycling",
              description: args.description,
              estimatedDuration: args.estimatedDuration,
            });
            finalReplyText += `\n\n🏃‍♂️ Die Ausdauer-Vorlage **${args.name}** wurde gespeichert!`;
          }

          if (part.functionCall?.name === "log_body_weight") {
            const args = part.functionCall.args;
            addBodyWeight({
              id: generateId(),
              date: new Date().toISOString(),
              weight: Number(args.weight),
            });
            finalReplyText += `\n\n⚖️ Dein Gewicht von **${args.weight} kg** wurde protokolliert.`;
          }

          if (part.functionCall?.name === "complete_planned_activity") {
            const args = part.functionCall.args;
            const newPlan = weeklyPlan.map(d => 
              d.dayIndex === args.dayIndex ? { ...d, isCompleted: !!args.isCompleted } : d
            );
            updateWeeklyPlan(newPlan);
            finalReplyText += args.isCompleted 
              ? `\n\n✅ Einheit für ${DAY_FULLS[args.dayIndex]} als erledigt markiert!`
              : `\n\n↩️ Erledigt-Status für ${DAY_FULLS[args.dayIndex]} zurückgesetzt.`;
          }

          if (part.functionCall?.name === "delete_gym_template") {
            const args = part.functionCall.args;
            deleteGymTemplate(args.templateId);
            finalReplyText += `\n\n🗑️ Routine mit ID \`${args.templateId}\` wurde gelöscht.`;
          }

          if (part.functionCall?.name === "delete_endurance_template") {
            const args = part.functionCall.args;
            deleteEnduranceTemplate(args.templateId);
            finalReplyText += `\n\n🗑️ Ausdauer-Routine mit ID \`${args.templateId}\` wurde gelöscht.`;
          }

          if (part.functionCall?.name === "save_memory") {
            const args = part.functionCall.args;
            const facts: string[] = args.facts || [];
            for (const fact of facts) {
              if (fact.trim()) addCoachMemory(fact.trim());
            }
            finalReplyText += `\n\n🧠 ${facts.length} Fakt${facts.length !== 1 ? "en" : ""} in meinem Gedächtnis gespeichert.`;
          }

          if (part.functionCall?.name === "update_weekly_plan") {
            const args = part.functionCall.args;
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

        const reply: ChatMessage = {
          id: generateId(),
          role: "coach",
          text: finalReplyText || "Plan gespeichert!",
          timestamp: new Date(),
          model: usedModel,
        };
        setMessages([...messages, userMsg, reply]);
      } else {
        throw new Error("No candidates returned. " + JSON.stringify(data));
      }
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
    </div>
  );
}
