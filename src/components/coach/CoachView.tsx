"use client";

import { useState, useCallback } from "react";
import {
  Bot,
  Brain,
  MessageSquare,
  FileText,
  BarChart3,
} from "lucide-react";
import { generateId, cn, getLocalDateString } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { getWeekStats } from "@/lib/stravaUtils";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import WeeklyReportInline from "./WeeklyReportInline";
import CoachAnalyticsTab from "./CoachAnalyticsTab";
import CoachMemoryPanel from "./CoachMemoryPanel";
import type { ChatMessage, ChatMessageAction, GymTemplate, DayPlan, EnduranceTemplate } from "@/types";
import type { StravaActivity } from "@/types";

import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";

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

/**
 * Lädt ein Chat-Bild (Data-URL) in den privaten Storage-Bucket und liefert
 * eine auth-gated Proxy-URL. Bei Fehler → null (Fallback: Base64-Vorschau).
 */
async function uploadChatImage(dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/uploads/chat-images", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        const [meta, b64] = dataUrl.split(",");
        const mime = meta.slice(meta.indexOf(":") + 1, meta.indexOf(";")) || "image/jpeg";
        const byteStr = atob(b64);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
        form.append("file", new Blob([bytes], { type: mime }), `chat.${ext}`);
        return form;
      })(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success?: boolean; path?: string };
    if (!data.success || !data.path) return null;
    return `/api/files/chat-images/${data.path}`;
  } catch {
    return null;
  }
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
  bodyCompContext: string,
  athleteName: string = "Athlet"
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

Du sprichst mit dem Athleten "${athleteName}". Sprich ihn respektvoll mit "${athleteName}" an (verwende NIEMALS statische Fallback-Namen wie "Max", außer der Nutzer stellt sich explizit so vor).

Du hast Zugriff auf:
- Die Garmin Connect Vital- und Erholungsdaten (Training Readiness, Body Battery, HRV Status, Schlaf, Ruhepuls, verbrannte Aktiv-Kalorien).
- Die Körperzusammensetzungsdaten der Körperfettwaage (Gewicht, KFA %, Muskelmasse in kg, Wasser %, Viszeralfett).
- Den aktuellen Ernährungs- und Kalorientracker (OpenNutriTracker).
- Die Strava- und internen Trainings-Logs und Bestleistungen (PRs).

=== AUTOMATISCHER REKALKULATIONS-LOOP BEI GEWICHTSKORREKTUR ===
Wenn der Nutzer sein Körpergewicht korrigiert oder einen Messfehler meldet:
1. Speichere das neue Gewicht via \`log_body_weight\`.
2. Bestätige nicht nur trocken den Eintrag, sondern berechne PROAKTIV den neuen Grundumsatz (BMR nach Mifflin-St Jeor) und gib eine sportwissenschaftliche Einschätzung zur Gelenkbelastung (z. B. Sehnen- & Knieentlastung beim Laufen und Kniebeugen).
3. Biete sofort interaktiv an: "Möchtest du, dass ich deinen Trainingsplan und dein Kalorienziel mit dem korrigierten Gewicht für die Woche neu anpasse?"
4. Halte den Status der offenen Anfrage aktiv.

=== WOCHENPLAN-FORMATIERUNG IM CHAT ===
Wenn du einen 7-Tage-Trainingsplan vorstellst, formatiere ihn als kompakte, übersichtliche Markdown-Tabelle (| Tag | Sportart | Einheit | Intensität/Fokus |), damit die Nachricht kompakt und angenehm lesbar bleibt.

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

const SCHEDULE_GARMIN_WORKOUT_TOOL = {
  name: "schedule_garmin_workout",
  description: "Plant ein Workout (Kraft, Laufen, Radfahren) direkt für ein Datum im nativen Garmin Connect Kalender. Das Workout erscheint morgens auf der Uhr (Forerunner 265 / Edge 840) zum direkten Starten.",
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

  /**
   * Lädt ein Base64-Bild nach /api/uploads/chat-images hoch und liefert die
   * auth-gated Proxy-URL zurück. Gibt null bei Fehler zurück (Fallback: Base64).
   */
  async function uploadChatImage(dataUrl: string): Promise<string | null> {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const mime = blob.type || "image/jpeg";
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const file = new File([blob], `chat.${ext}`, { type: mime });
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/chat-images", { method: "POST", body: form });
      if (!res.ok) return null;
      const data = (await res.json()) as { success?: boolean; path?: string };
      if (!data.success || !data.path) return null;
      return `/api/files/chat-images/${data.path}`;
    } catch {
      return null;
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text && selectedImages.length === 0) return;

    // ── Chat-Bilder vor dem Senden hochladen (statt Base64 im State) ─────────
    // Erfolgreiche Uploads liefern auth-gated Proxy-URLs, die auch nach einem
    // Reload erhalten bleiben. Bei Fehler (offline) bleibt die Base64-Vorschau.
    const uploadedImages: string[] = [];
    for (const img of selectedImages) {
      if (img.startsWith("data:")) {
        const url = await uploadChatImage(img);
        if (url) uploadedImages.push(url);
      } else {
        // Bereits eine URL (z. B. Retry oder Server-Bild)
        uploadedImages.push(img);
      }
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      text,
      timestamp: new Date(),
      images: uploadedImages.length > 0 ? uploadedImages : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
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

      const today = getLocalDateString();
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

      const garminActivitiesDetail = (garminActivities || []).map((act) => {
        const distKm = act.distanceMeters ? `${(act.distanceMeters / 1000).toFixed(1)} km` : "";
        const durationMin = act.durationSeconds ? `${Math.round(act.durationSeconds / 60)} Min` : "";
        const hrStr = act.avgHeartRate ? `Puls: Ø ${act.avgHeartRate} bpm (Max: ${act.maxHeartRate || "-"} bpm)` : "";
        const powerStr = act.avgPowerWatts ? `Leistung: Ø ${act.avgPowerWatts}W (Max: ${act.maxPowerWatts || "-"}W)` : "";
        const eleStr = act.elevationGainMeters ? `Höhenmeter: +${act.elevationGainMeters}m` : "";
        const teStr = act.trainingEffectAerobic ? `Training Effect: Aerob ${act.trainingEffectAerobic} / Anaerob ${act.trainingEffectAnaerobic || 0}` : "";
        const dateStr = new Date(act.startTime).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

        return `- [${act.device || "Garmin"}] ${dateStr}: "${act.name}" (${act.type}) | ${distKm} in ${durationMin} | ${act.caloriesBurned} kcal | ${hrStr} | ${powerStr} | ${eleStr} | ${teStr}`;
      }).join("\n");

      const garminContext = `=== GARMIN CONNECT (Vital-, Erholungs- & Aktivitätsdaten) ===
Training Readiness: ${garmin.trainingReadiness}/100
Body Battery: ${garmin.bodyBattery}%
HRV Status: ${garmin.hrvStatus}
Schlaf: ${garmin.sleepDurationHours}h (Score ${garmin.sleepScore}/100)
Ruhepuls: ${garmin.restingHeartRate} bpm
Aktiv-Kalorien verbrannt: ${garmin.activeCaloriesBurned} kcal

Garmin synchronisierte Aktivitäten (${garminActivities.length}):
${garminActivities.length > 0 ? garminActivitiesDetail : "Keine synchronisierten Garmin-Aktivitäten vorhanden."}`;

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

      const athleteName = connection.athlete?.firstname || "Athlet";

      const systemPrompt = buildSystemPrompt(
        stravaContext, 
        coachMemories.map((m) => m.content),
        prsContext,
        historyContext,
        gymTemplates,
        enduranceTemplates,
        nutritionContext,
        garminContext,
        bodyCompContext,
        athleteName
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
        { type: "function", ...SCHEDULE_GARMIN_WORKOUT_TOOL },
      ];

      // Fallback loop for different models on Interactions API
      for (const modelConfig of GEMINI_MODELS) {
        try {
          const modelId = modelConfig.id;
          usedModel = modelId;
          
          const url = `/api/gemini/v1beta/interactions`;
          
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
              throw new Error("Kein gültiger Gemini API-Key auf dem Server konfiguriert (Env GEMINI_API_KEY).");
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
      const replyActions: any[] = [];

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
              replyActions.push({
                id: generateId(),
                label: `🔄 BMR & Plan für ${args.weight} kg neu berechnen`,
                variant: "primary",
                actionType: "recalculate_metrics",
                payload: { weight: args.weight },
              });
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
              replyActions.push({
                id: generateId(),
                label: "✅ Plan jetzt übernehmen",
                variant: "primary",
                actionType: "apply_plan",
                payload: newPlan,
              });
              replyActions.push({
                id: generateId(),
                label: "✏️ Plan anpassen",
                variant: "secondary",
                actionType: "custom_prompt",
                payload: "Passe den Plan bitte noch in folgenden Punkten an: ",
              });
            }

            if (toolName === "schedule_garmin_workout") {
              try {
                const res = await scheduleNativeGarminWorkout(args.date, {
                  name: args.workoutName,
                  type: args.sportType,
                  exercises: args.exercises || [],
                });
                if (res.success) {
                } else {
                  finalReplyText += `\n\n⚠️ Garmin-Planung fehlgeschlagen: ${res.error}`;
                }
              } catch (err: any) {
                finalReplyText += `\n\n⚠️ Fehler bei Garmin-Übertragung: ${err.message}`;
              }
            }
          }
        }
      }

      // Proactive prompt actions if bot proposes an action in plain text
      if (replyActions.length === 0) {
        if (finalReplyText.toLowerCase().includes("gewicht") && (finalReplyText.toLowerCase().includes("korrigier") || finalReplyText.toLowerCase().includes("anpassen"))) {
          replyActions.push({
            id: generateId(),
            label: "🔄 Metriken mit neuem Gewicht berechnen",
            variant: "primary",
            actionType: "recalculate_metrics",
          });
        }
      }

      const reply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: finalReplyText || "Plan gespeichert!",
        timestamp: new Date(),
        model: usedModel,
        actions: replyActions.length > 0 ? replyActions : undefined,
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      const isQuotaError = err instanceof Error && (err.message.includes("Quota") || err.message.includes("limit") || err.message.includes("exhausted"));
      const errorReply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: isQuotaError 
          ? "Entschuldigung, alle meine KI-Kapazitäten für heute sind aufgebraucht (Tageslimit überschritten). Bitte versuche es morgen wieder."
          : "Entschuldigung, meine Verbindung zum Server ist gerade gestört. Versuche es später noch einmal.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  }

  // Stabile Identität (useCallback) – Voraussetzung für React.memo auf ChatMessage
  const handleActionClick = useCallback((action: ChatMessageAction) => {
    if (action.actionType === "apply_plan" && action.payload) {
      updateWeeklyPlan(action.payload as DayPlan[]);
      const confirmMsg: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: "✅ **Wochenplan erfolgreich übernommen!** Der aktualisierte Trainingsplan ist jetzt in deinem Cockpit und der Wochenansicht aktiv.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } else if (action.actionType === "recalculate_metrics") {
      const latestWeight = bodyWeightLog[0]?.weight;
      setInput(
        typeof latestWeight === "number"
          ? `Bitte passe meinen Trainingsplan, BMR und mein Kalorienziel mit meinem aktuellen Gewicht von ${latestWeight} kg für die Woche neu an.`
          : "Bitte berechne meinen BMR und passe mein Kalorienziel sowie meinen Trainingsplan an mein aktuelles Körpergewicht an."
      );
    } else if (action.actionType === "custom_prompt") {
      setInput(String(action.payload ?? ""));
    }
  }, [updateWeeklyPlan, bodyWeightLog]);

  const [coachTab, setCoachTab] = useState<"chat" | "reviews" | "analytics">("chat");

  const hasStravaData = connection.isConnected && activities.length > 0;

  return (
    <div className="flex flex-col h-full pb-16 md:pb-0 overflow-hidden bg-zinc-950">
      {/* Header */}
      <div className="px-3.5 sm:px-6 pt-3 sm:pt-6 pb-3 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md shrink-0 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0">
              <Bot size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-zinc-100">
                  Hybrid Coach Nova
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                  AI Pro
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400">
                Ganzheitliche Steuerung • Garmin • Waage • Ernährung
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowMemories(!showMemories)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                showMemories
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
              )}
            >
              <Brain size={14} />
              <span className="hidden sm:inline">Gedächtnis</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                {coachMemories.length}
              </span>
            </button>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
          <button
            onClick={() => setCoachTab("chat")}
            className={cn(
              "flex-1 min-w-[100px] py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              coachTab === "chat"
                ? "bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <MessageSquare size={13} />
            <span>KI-Coach</span>
          </button>

          <button
            onClick={() => setCoachTab("reviews")}
            className={cn(
              "flex-1 min-w-[120px] py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              coachTab === "reviews"
                ? "bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <FileText size={13} />
            <span>Wochenberichte</span>
          </button>

          <button
            onClick={() => setCoachTab("analytics")}
            className={cn(
              "flex-1 min-w-[120px] py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              coachTab === "analytics"
                ? "bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <BarChart3 size={13} />
            <span>Analytik & Trends</span>
          </button>
        </div>

        {/* Memory panel */}
        {showMemories && (
          <CoachMemoryPanel
            memories={coachMemories}
            onDeleteMemory={deleteCoachMemory}
          />
        )}
      </div>

      {/* ── Tab 1: Chat ──────────────────────────────────────────────────────── */}
      {coachTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 pb-20 md:pb-0">
          <ChatWindow messages={messages} onActionClick={handleActionClick} />

          {loading && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Bot size={13} className="text-cyan-400" />
              </div>
              <div className="flex gap-1 items-center px-3 py-2 bg-zinc-800 rounded-2xl rounded-tl-sm">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={sendMessage}
            disabled={loading}
            images={selectedImages}
            onAddImage={(img) => setSelectedImages((prev) => [...prev, img])}
            onRemoveImage={(idx) => setSelectedImages((prev) => prev.filter((_, i) => i !== idx))}
          />
        </div>
      )}

      {/* ── Tab 2: Wochenberichte ────────────────────────────────────────────── */}
      {coachTab === "reviews" && (
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-4 sm:space-y-6 pb-28 md:pb-8">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">Wochenrückblick & Belastungsanalyse</h2>
            <p className="text-[11px] sm:text-xs text-zinc-400">Vergangene Trainingszyklen, Sätze, Volumen & Persönliche Rekorde</p>
          </div>
          <WeeklyReportInline />
        </div>
      )}

      {/* ── Tab 3: Deep Analytics ────────────────────────────────────────────── */}
      {coachTab === "analytics" && <CoachAnalyticsTab />}
    </div>
  );
}
