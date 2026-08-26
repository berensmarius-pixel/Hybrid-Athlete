"use client";

/**
 * Modul-Singleton für die Coach-Chat-Pipeline – lebt außerhalb des
 * React-Life-Cycles, damit die KI im Hintergrund weiterläuft, während der
 * Nutzer den Coach-Tab verlässt (CoachView wird bedingt gerendert und
 * unmountet!).
 *
 * Ablauf pro Nachricht:
 *   1. User-Message persistieren (AppContext)
 *   2. RAG-Grounding SOFORT starten (parallel zu Bild-Uploads)
 *   3. Bild-Uploads
 *   4. System-Prompt bauen (Athlet-Kontext + Grounding)
 *   5. Streaming-Call (adaptives Thinking-Level, Quota-optimierte Kette)
 *   6. Tool-Calls dispatchen (AppContext-Aktionen)
 *   7. Finale Antwort persistieren
 *
 * Der Store hält ausschließlich UI-unabhängigen Zustand; die AppContext-
 * Aktionen werden von einer nie unmountenden Bridge (AppShell) registriert.
 */

import { useSyncExternalStore } from "react";
import type {
  AppContextValue,
  ChatMessage,
  ChatMessageAction,
  DayPlan,
  GymTemplate,
  StravaActivity,
  StravaConnection,
} from "@/types";
import { generateId, getLocalDateString } from "@/lib/utils";
import { argNumber, argString, parseInteractionSteps } from "@/lib/gemini/coachTools";
import {
  GeminiKeyError,
  streamGeminiInteractions,
} from "@/lib/gemini/interactionsClient";
import { fetchScientificGrounding } from "@/lib/knowledge/coachGrounding";
import {
  buildBodyCompContext,
  buildChatHistoryContext,
  buildGarminContext,
  buildHistoryContext,
  buildNutritionContext,
  buildPrsContext,
  buildStravaContext,
  buildSystemPrompt,
} from "@/lib/gemini/promptBuilder";
import { classifyCoachComplexity } from "@/lib/ai/complexity";
import type { ThinkingLevel } from "@/lib/ai/model-router";
import { scheduleNativeGarminWorkout, withIntelligentTargets } from "@/lib/garmin/garminService";

const DAY_SHORTS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_FULLS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

// ─── State ────────────────────────────────────────────────────────────────────

export type CoachSessionStatus =
  | "idle"
  | "uploading"
  | "grounding"
  | "streaming"
  | "executing_tools"
  | "error";

export interface CoachSessionState {
  status: CoachSessionStatus;
  /** Inkrementell gestreamter Antwort-Text. */
  partialText: string;
  /** Tatsächlich antwortendes Modell (x-ai-router-model). */
  usedModel: string | null;
  /** Vom Complexity-Router gewählte Denkstufe der aktiven Anfrage. */
  thinkingLevel: ThinkingLevel | null;
  error: string | null;
}

const IDLE_STATE: CoachSessionState = {
  status: "idle",
  partialText: "",
  usedModel: null,
  thinkingLevel: null,
  error: null,
};

let state: CoachSessionState = IDLE_STATE;
const listeners = new Set<() => void>();

function setState(patch: Partial<CoachSessionState>): void {
  state = { ...state, ...patch };
  // Sofort-Benachrichtigung (Delta-Throttling passiert im Stream-Handler).
  for (const listener of listeners) listener();
}

export function getCoachSessionState(): CoachSessionState {
  return state;
}

export function subscribeCoachSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCoachSessionBusy(): boolean {
  return state.status !== "idle";
}

/** React-Hook: Session-State ohne Context-Provider (useSyncExternalStore). */
export function useCoachSessionState(): CoachSessionState {
  return useSyncExternalStore(subscribeCoachSession, getCoachSessionState, getCoachSessionState);
}

/** React-Hook: läuft gerade eine Coach-Anfrage (für Nav-Badges)? */
export function useCoachSessionBusy(): boolean {
  return useSyncExternalStore(
    subscribeCoachSession,
    isCoachSessionBusy,
    isCoachSessionBusy
  );
}

// ─── Kontext-Registrierung (Bridge in AppShell) ──────────────────────────────

export interface CoachSessionContext {
  app: AppContextValue;
  stravaActivities: StravaActivity[];
  stravaConnection: StravaConnection;
}

let sessionContext: CoachSessionContext | null = null;

/**
 * Wird bei jedem Render der Bridge aufgerufen (immer der frischeste
 * Context-Snapshot). Kein Cleanup: der Store lebt für die Seiten-Lebensdauer.
 */
export function setCoachSessionContext(ctx: CoachSessionContext): void {
  sessionContext = ctx;
}

// ─── Bild-Upload ──────────────────────────────────────────────────────────────

/**
 * Lädt ein Chat-Bild (Data-URL) in den privaten Storage-Bucket und liefert
 * eine auth-gated Proxy-URL. Bei Fehler → null (Fallback: Base64-Vorschau).
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

// ─── Öffentliche Aktionen ─────────────────────────────────────────────────────

let activeController: AbortController | null = null;

/** Bricht die laufende Coach-Anfrage ab. Partial-Text wird als Nachricht erhalten. */
export function abortCoachSession(): void {
  activeController?.abort();
}

/**
 * Sendet eine Coach-Nachricht. Kein-op, wenn bereits eine Anfrage läuft
 * oder kein App-Kontext registriert ist.
 */
export async function sendCoachMessage(text: string, images: string[] = []): Promise<void> {
  const ctx = sessionContext;
  if (!ctx || state.status !== "idle") return;

  const trimmed = text.trim();
  if (!trimmed && images.length === 0) return;

  activeController = new AbortController();
  const { signal } = activeController;
  const { app } = ctx;

  // User-Message persistieren (funktioniert unabhängig von gemounteten Views).
  const userMsg: ChatMessage = {
    id: generateId(),
    role: "user",
    text: trimmed,
    timestamp: new Date(),
    images: images.length > 0 ? images : undefined,
  };
  app.setChatMessages((prev) => [...prev, userMsg]);

  state = { ...IDLE_STATE, status: images.length > 0 ? "uploading" : "grounding" };
  for (const listener of listeners) listener();

  try {
    // RAG-Retrieval sofort starten (parallel zu Bild-Uploads + Prompt-Bau).
    const groundingPromise = fetchScientificGrounding(trimmed);

    // Chat-Bilder hochladen (auth-gated Proxy-URLs statt Base64 im State).
    const uploadedImages: string[] = [];
    for (const img of images) {
      if (img.startsWith("data:")) {
        const url = await uploadChatImage(img);
        if (url) uploadedImages.push(url);
      } else {
        uploadedImages.push(img);
      }
    }
    if (uploadedImages.length !== images.length) {
      // Fallback-Bilder (Upload fehlgeschlagen) in der User-Message korrigieren.
      app.setChatMessages((prev) =>
        prev.map((m) =>
          m.id === userMsg.id
            ? { ...m, images: uploadedImages.length > 0 ? uploadedImages : undefined }
            : m
        )
      );
    }

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Athlet-Kontexte (rein synchron).
    const stravaContext = buildStravaContext(ctx.stravaActivities, ctx.stravaConnection);
    const prsContext = buildPrsContext(app.personalRecords);
    const historyContext = buildHistoryContext(app.loggedSessions);
    const today = getLocalDateString();
    const nutritionContext = buildNutritionContext(app.nutritionLogs, app.nutritionGoals, today);
    const garmin = app.garminHealthLogs[today];
    const garminContext = buildGarminContext(garmin ?? {}, app.garminActivities || []);
    const bodyCompContext = buildBodyCompContext(app.bodyWeightLog);
    const athleteName = ctx.stravaConnection.athlete?.firstname || "Athlet";

    // Auf paralleles Grounding warten (läuft bereits seit Sende-Beginn).
    setState({ status: "grounding" });
    const grounding = await groundingPromise;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const chatHistoryContext = buildChatHistoryContext(app.chatMessages);

    const systemPrompt = buildSystemPrompt(
      stravaContext,
      app.coachMemories.map((m) => m.content),
      prsContext,
      historyContext,
      app.gymTemplates,
      app.enduranceTemplates,
      nutritionContext,
      garminContext,
      bodyCompContext,
      athleteName,
      grounding?.context,
      chatHistoryContext
    );

    // Adaptives Thinking-Level: Workout-/Plan-Erstellung & Analysen denken tiefer.
    const thinkingLevel = classifyCoachComplexity(trimmed);

    // Streaming-Call mit Live-Deltas (Notify auf ~60 ms getaktet, um
    // Re-Render-Fluten pro Token zu vermeiden).
    setState({ status: "streaming", thinkingLevel });
    let pendingChunk = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushPending = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingChunk) {
        const chunk = pendingChunk;
        pendingChunk = "";
        setState({ partialText: state.partialText + chunk });
      }
    };
    const { data, usedModel } = await streamGeminiInteractions(systemPrompt, trimmed, {
      thinkingLevel,
      signal,
      onDelta: (chunk) => {
        pendingChunk += chunk;
        if (flushTimer === null) {
          flushTimer = setTimeout(flushPending, 60);
        }
      },
      onModel: (modelId) => setState({ usedModel: modelId }),
    });
    flushPending();

    const { text: modelText, toolCalls } = parseInteractionSteps(data);

    setState({ status: "executing_tools", partialText: modelText });
    let finalReplyText = modelText;
    const replyActions: ChatMessageAction[] = [];

    for (const call of toolCalls) {
      const appended = await dispatchToolCall(call.name, call.args, {
        onAction: (a) => replyActions.push(a),
      });
      if (appended) finalReplyText += appended;
    }

    // Proactive prompt actions if bot proposes an action in plain text
    if (replyActions.length === 0) {
      if (
        finalReplyText.toLowerCase().includes("gewicht") &&
        (finalReplyText.toLowerCase().includes("korrigier") ||
          finalReplyText.toLowerCase().includes("anpassen"))
      ) {
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
      text: finalReplyText || "Verstanden.",
      timestamp: new Date(),
      model: usedModel,
      actions: replyActions.length > 0 ? replyActions : undefined,
    };
    app.setChatMessages((prev) => [...prev, reply]);
    setState({ ...IDLE_STATE });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Abbruch: Partial-Text als (abgeschnittene) Antwort erhalten.
      if (state.partialText.trim()) {
        app.setChatMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "coach",
            text: `${state.partialText.trim()}\n\n_(Antwort abgebrochen)_`,
            timestamp: new Date(),
            model: state.usedModel ?? undefined,
          },
        ]);
      }
      setState({ ...IDLE_STATE });
      return;
    }

    const isQuotaError =
      err instanceof GeminiKeyError ||
      (err instanceof Error &&
        (err.message.includes("Quota") ||
          err.message.includes("limit") ||
          err.message.includes("exhausted")));
    const errorMessage = isQuotaError
      ? "Entschuldigung, meine KI-Kapazitäten sind gerade erschöpft oder es ist kein gültiger API-Key konfiguriert. Bitte prüfe die Gemini-Einstellungen bzw. versuche es später wieder."
      : "Entschuldigung, meine Verbindung zum Server ist gerade gestört. Versuche es später noch einmal.";

    app.setChatMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "coach",
        text: errorMessage,
        timestamp: new Date(),
      },
    ]);
    setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
    // Nach kurzer Fehler-Phase zurück in idle (Badge erlischt, Input frei).
    setTimeout(() => {
      if (state.status === "error") setState({ ...IDLE_STATE });
    }, 1500);
  } finally {
    activeController = null;
  }
}

// ─── Tool-Dispatch ────────────────────────────────────────────────────────────

/** Führt einen Tool-Call des Modells aus und liefert den Antwort-Anhang. */
async function dispatchToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { onAction: (action: ChatMessageAction) => void }
): Promise<string> {
  const app = sessionContext?.app;
  if (!app) return "";

  switch (toolName) {
    case "create_gym_template": {
      const name = argString(args, "name");
      if (!name) break;
      const rawExercises = Array.isArray(args.exercises) ? args.exercises : [];
      const newTemplate: GymTemplate = {
        id: generateId(),
        name,
        type: (argString(args, "type") as GymTemplate["type"]) || "gym",
        exercises: rawExercises.map((rawEx) => {
          const ex = rawEx as { name?: unknown; sets?: unknown };
          const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
          return {
            id: generateId(),
            name: String(ex.name ?? ""),
            sets: rawSets.map((rawSet) => {
              const s = rawSet as Record<string, unknown>;
              return {
                id: generateId(),
                type: (typeof s.type === "string" ? s.type : "working") as "warmup" | "working" | "drop",
                targetReps: typeof s.targetReps === "number" ? s.targetReps : undefined,
                targetDuration: typeof s.targetDuration === "number" ? s.targetDuration : undefined,
                targetRir: typeof s.targetRir === "number" ? s.targetRir : undefined,
              };
            }),
          };
        }),
      };
      app.saveGymTemplate(newTemplate);
      return `\n\n✅ Der Trainingsplan **${name}** wurde direkt in deine Pläne gespeichert!`;
    }

    case "create_endurance_template": {
      const name = argString(args, "name");
      if (!name) break;
      const rawType = argString(args, "type");
      const type: "running" | "cycling" = rawType === "cycling" ? "cycling" : "running";
      app.saveEnduranceTemplate({
        id: generateId(),
        name,
        type,
        description: argString(args, "description") ?? "",
        estimatedDuration: argString(args, "estimatedDuration"),
      });
      const icon = type === "cycling" ? "🚴" : "🏃‍♂️";
      return `\n\n${icon} Die Ausdauer-Vorlage **${name}** wurde gespeichert!`;
    }

    case "log_body_weight": {
      const weight = argNumber(args, "weight");
      if (weight === undefined) break;
      app.addBodyWeight({
        id: generateId(),
        date: new Date().toISOString(),
        weight,
      });
      ctx.onAction({
        id: generateId(),
        label: `🔄 BMR & Plan für ${weight} kg neu berechnen`,
        variant: "primary",
        actionType: "recalculate_metrics",
        payload: { weight },
      });
      return `\n\n⚖️ Dein Gewicht von **${weight} kg** wurde protokolliert.`;
    }

    case "complete_planned_activity": {
      const dayIndex = argNumber(args, "dayIndex");
      const isCompleted = args.isCompleted === true;
      if (dayIndex === undefined) break;
      app.updateWeeklyPlan(
        app.weeklyPlan.map((d) =>
          d.dayIndex === dayIndex ? { ...d, isCompleted } : d
        )
      );
      return isCompleted
        ? `\n\n✅ Einheit für ${DAY_FULLS[dayIndex]} als erledigt markiert!`
        : `\n\n↩️ Erledigt-Status für ${DAY_FULLS[dayIndex]} zurückgesetzt.`;
    }

    case "delete_gym_template": {
      const templateId = argString(args, "templateId");
      if (!templateId) break;
      app.deleteGymTemplate(templateId);
      return `\n\n🗑️ Routine mit ID \`${templateId}\` wurde gelöscht.`;
    }

    case "delete_endurance_template": {
      const templateId = argString(args, "templateId");
      if (!templateId) break;
      app.deleteEnduranceTemplate(templateId);
      return `\n\n🗑️ Ausdauer-Routine mit ID \`${templateId}\` wurde gelöscht.`;
    }

    case "save_memory": {
      const facts = Array.isArray(args.facts)
        ? args.facts.filter((f): f is string => typeof f === "string" && f.trim() !== "")
        : [];
      for (const fact of facts) app.addCoachMemory(fact.trim());
      return `\n\n🧠 ${facts.length} Fakt${facts.length !== 1 ? "en" : ""} in meinem Gedächtnis gespeichert.`;
    }

    case "update_weekly_plan": {
      const rawDays = Array.isArray(args.days) ? args.days : [];
      const days = rawDays
        .map((raw) => raw as { dayIndex?: unknown; workoutType?: unknown; title?: unknown; description?: unknown })
        .filter(
          (d): d is { dayIndex: number; workoutType: string; title: string; description: string } =>
            typeof d.dayIndex === "number" &&
            typeof d.workoutType === "string" &&
            typeof d.title === "string" &&
            typeof d.description === "string"
        );
      if (days.length === 0) break;
      const newPlan: DayPlan[] = app.weeklyPlan.map((existing) => {
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
      app.updateWeeklyPlan(newPlan);
      ctx.onAction({
        id: generateId(),
        label: "✅ Plan jetzt übernehmen",
        variant: "primary",
        actionType: "apply_plan",
        payload: newPlan,
      });
      ctx.onAction({
        id: generateId(),
        label: "✏️ Plan anpassen",
        variant: "secondary",
        actionType: "custom_prompt",
        payload: "Bitte passe den Plan noch in folgenden Punkten an: ",
      });
      return `\n\n📅 Dein Wochenplan wurde aktualisiert!`;
    }

    case "schedule_garmin_workout": {
      const date = argString(args, "date");
      const workoutName = argString(args, "workoutName");
      const sportType = argString(args, "sportType");
      const description = argString(args, "description");
      if (!date || !workoutName || !sportType) break;
      try {
        const basePayload = {
          name: workoutName,
          type: sportType as "gym" | "running" | "cycling",
          description: description || undefined,
          exercises: Array.isArray(args.exercises) ? args.exercises : [],
        };
        const payload =
          (sportType === "running" || sportType === "cycling") && description
            ? withIntelligentTargets(basePayload)
            : basePayload;
        const res = await scheduleNativeGarminWorkout(date, payload);
        if (res.success && (res as { duplicate?: boolean }).duplicate) {
          return `\n\nℹ️ **${workoutName}** liegt bereits am ${date} im Garmin-Kalender – kein Doppel-Eintrag erstellt.`;
        }
        if (res.success) {
          return `\n\n✅ **${workoutName}** wurde für den ${date} in deinen Garmin-Kalender geplant und erscheint auf deiner Uhr!`;
        }
        return `\n\n⚠️ Garmin-Planung fehlgeschlagen: ${res.error}`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `\n\n⚠️ Fehler bei Garmin-Übertragung: ${message}`;
      }
    }

    default:
      return "";
  }
  return "";
}
