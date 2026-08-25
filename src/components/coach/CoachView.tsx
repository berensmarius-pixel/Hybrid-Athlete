"use client";

import { useState, useCallback } from "react";
import {
  Bot,
  Brain,
  MessageSquare,
  FileText,
  BarChart3,
  KeyRound,
} from "lucide-react";
import { generateId, cn, getLocalDateString } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import WeeklyReportInline from "./WeeklyReportInline";
import CoachAnalyticsTab from "./CoachAnalyticsTab";
import CoachMemoryPanel from "./CoachMemoryPanel";
import type {
  ChatMessage,
  ChatMessageAction,
  GymTemplate,
  DayPlan,
} from "@/types";

import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";
import GeminiKeyModal from "@/components/settings/GeminiKeyModal";
import {
  argNumber,
  argString,
  parseInteractionSteps,
} from "@/lib/gemini/coachTools";
import { callGeminiInteractions, GeminiKeyError } from "@/lib/gemini/interactionsClient";
import {
  buildBodyCompContext,
  buildGarminContext,
  buildHistoryContext,
  buildNutritionContext,
  buildPrsContext,
  buildStravaContext,
  buildSystemPrompt,
} from "@/lib/gemini/promptBuilder";

const DAY_SHORTS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_FULLS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

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
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

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
      const prsContext = buildPrsContext(personalRecords);
      const historyContext = buildHistoryContext(loggedSessions);

      const today = getLocalDateString();
      const nutritionContext = buildNutritionContext(nutritionLogs, nutritionGoals, today);

      const garmin = garminHealthLogs[today];
      const garminContext = buildGarminContext(garmin ?? {}, garminActivities || []);

      const bodyCompContext = buildBodyCompContext(bodyWeightLog);

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

      const { data, usedModel } = await callGeminiInteractions(systemPrompt, text);
      const { text: modelText, toolCalls } = parseInteractionSteps(data);

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
      const isQuotaError =
        err instanceof GeminiKeyError ||
        (err instanceof Error && (err.message.includes("Quota") || err.message.includes("limit") || err.message.includes("exhausted")));
      const errorReply: ChatMessage = {
        id: generateId(),
        role: "coach",
        text: isQuotaError
          ? "Entschuldigung, meine KI-Kapazitäten sind gerade erschöpft oder es ist kein gültiger API-Key konfiguriert. Bitte prüfe die Gemini-Einstellungen bzw. versuche es später wieder."
          : "Entschuldigung, meine Verbindung zum Server ist gerade gestört. Versuche es später noch einmal.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  }

  /** Führt einen Tool-Call des Modells aus und liefert den Antwort-Anhang. */
  async function dispatchToolCall(
    toolName: string,
    args: Record<string, unknown>,
    ctx: { onAction: (action: ChatMessageAction) => void }
  ): Promise<string> {
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
        saveTemplate(newTemplate);
        return `\n\n✅ Der Trainingsplan **${name}** wurde direkt in deine Pläne gespeichert!`;
      }

      case "create_endurance_template": {
        const name = argString(args, "name");
        if (!name) break;
        saveEnduranceTemplate({
          id: generateId(),
          name,
          type: (argString(args, "type") as "running" | "cycling") || "running",
          description: argString(args, "description") ?? "",
          estimatedDuration: argString(args, "estimatedDuration"),
        });
        return `\n\n🏃‍♂️ Die Ausdauer-Vorlage **${name}** wurde gespeichert!`;
      }

      case "log_body_weight": {
        const weight = argNumber(args, "weight");
        if (weight === undefined) break;
        addBodyWeight({
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
        updateWeeklyPlan(
          weeklyPlan.map((d) =>
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
        deleteGymTemplate(templateId);
        return `\n\n🗑️ Routine mit ID \`${templateId}\` wurde gelöscht.`;
      }

      case "delete_endurance_template": {
        const templateId = argString(args, "templateId");
        if (!templateId) break;
        deleteEnduranceTemplate(templateId);
        return `\n\n🗑️ Ausdauer-Routine mit ID \`${templateId}\` wurde gelöscht.`;
      }

      case "save_memory": {
        const facts = Array.isArray(args.facts)
          ? args.facts.filter((f): f is string => typeof f === "string" && f.trim() !== "")
          : [];
        for (const fact of facts) addCoachMemory(fact.trim());
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
        if (!date || !workoutName || !sportType) break;
        try {
          const res = await scheduleNativeGarminWorkout(date, {
            name: workoutName,
            type: sportType as "gym" | "running" | "cycling",
            exercises: Array.isArray(args.exercises) ? args.exercises : [],
          });          if (res.success) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateWeeklyPlan, bodyWeightLog]);

  const [coachTab, setCoachTab] = useState<"chat" | "reviews" | "analytics">("chat");

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
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
              onClick={() => setShowKeyModal(true)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-purple-500/30"
              )}
              aria-label="KI API-Key verwalten"
              title="KI API-Key & Status"
            >
              <KeyRound size={14} />
              <span className="hidden sm:inline">KI-Key</span>
            </button>
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
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
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
        <div className="flex-1 flex flex-col min-h-0">
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

      {/* KI API-Key Verwaltung */}
      <GeminiKeyModal isOpen={showKeyModal} onClose={() => setShowKeyModal(false)} />
    </div>
  );
}
