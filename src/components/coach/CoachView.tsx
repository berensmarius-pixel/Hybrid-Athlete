"use client";

import { useState, useCallback } from "react";
import {
  Bot,
  Brain,
  MessageSquare,
  FileText,
  BarChart3,
  KeyRound,
  CircleStop,
} from "lucide-react";
import { generateId, cn } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import WeeklyReportInline from "./WeeklyReportInline";
import CoachAnalyticsTab from "./CoachAnalyticsTab";
import CoachMemoryPanel from "./CoachMemoryPanel";
import GeminiKeyModal from "@/components/settings/GeminiKeyModal";
import type { ChatMessage, ChatMessageAction, DayPlan } from "@/types";
import {
  abortCoachSession,
  sendCoachMessage,
  useCoachSessionState,
} from "@/lib/coach/coachSession";

/**
 * Coach-UI (dünne View-Schicht). Die komplette Chat-Pipeline lebt im
 * Modul-Singleton `src/lib/coach/coachSession.ts` – sie läuft damit im
 * Hintergrund weiter, wenn dieser View unmountet (Tab-Wechsel).
 */

const STATUS_LABELS: Record<string, string> = {
  uploading: "Lade Bilder…",
  grounding: "Durchsuche Wissensbasis…",
  streaming: "Denkt nach…",
  executing_tools: "Führe Aktionen aus…",
  error: "Fehler",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoachView() {
  const {
    updateWeeklyPlan,
    chatMessages: messages,
    setChatMessages: setMessages,
    coachMemories,
    deleteCoachMemory,
    bodyWeightLog,
  } = useApp();
  const [input, setInput] = useState("");
  const [showMemories, setShowMemories] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const session = useCoachSessionState();

  const busy = session.status !== "idle";
  const streamingActive = session.status === "streaming" || session.status === "executing_tools";

  // Streaming-Nachricht als synthetisches ChatMessage-Element anhängen →
  // profitiert vom Auto-Scroll des ChatWindows bei jedem Delta.
  const streamingMessage: ChatMessage | null = streamingActive
    ? {
        id: "__coach_streaming__",
        role: "coach",
        text: session.partialText + (session.status === "streaming" ? " ▍" : ""),
        timestamp: new Date(),
        model: session.usedModel ?? undefined,
      }
    : null;
  const displayMessages = streamingMessage ? [...messages, streamingMessage] : messages;

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
                {busy && (
                  <span className="relative flex h-2 w-2" title="Antwort läuft – läuft auch im Hintergrund weiter">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                  </span>
                )}
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
          <ChatWindow messages={displayMessages} onActionClick={handleActionClick} />

          {/* Status-Bubble: solange noch kein (Teil-)Text streamt */}
          {busy && !(streamingActive && session.partialText.length > 0) && (
            <div className="px-4 pb-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <Bot size={13} className="text-cyan-400" />
              </div>
              <div className="flex gap-1 items-center px-3 py-2 bg-zinc-800 rounded-2xl rounded-tl-sm">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
                <span className="text-[11px] text-zinc-400 ml-1.5">
                  {STATUS_LABELS[session.status] ?? "Arbeite…"}
                </span>
                {session.thinkingLevel === "high" && session.status === "streaming" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">
                    Tiefes Denken
                  </span>
                )}
              </div>
              <button
                onClick={abortCoachSession}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-rose-500/40 text-[11px] font-semibold transition-all cursor-pointer"
                title="Antwort abbrechen"
              >
                <CircleStop size={13} />
                Stop
              </button>
            </div>
          )}

          {/* Stop-Button während des Streamings (unterhalb der Partial-Antwort) */}
          {streamingActive && session.partialText.length > 0 && (
            <div className="px-4 pb-2 flex justify-start">
              <button
                onClick={abortCoachSession}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-rose-500/40 text-[11px] font-semibold transition-all cursor-pointer"
                title="Antwort abbrechen"
              >
                <CircleStop size={13} />
                Stop
              </button>
            </div>
          )}

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => {
              const text = input;
              const imgs = selectedImages;
              if (!text.trim() && imgs.length === 0) return;
              setInput("");
              setSelectedImages([]);
              void sendCoachMessage(text, imgs);
            }}
            disabled={busy}
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
