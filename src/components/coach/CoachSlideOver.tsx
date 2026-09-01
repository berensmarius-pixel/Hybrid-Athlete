"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Bot,
  Brain,
  X,
  ChevronDown,
  CircleStop,
  ArrowUpRight,
  Sparkles,
  MessageSquare,
  BarChart3,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils";
import { useApp } from "@/context/AppContext";
import { abortCoachSession, sendCoachMessage, useCoachSessionState } from "@/lib/coach/coachSession";
import ChatWindow from "./ChatWindow";
import ChatInput from "./ChatInput";
import type { ChatMessage, ChatMessageAction, DayPlan } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  uploading: "Lade Bilder…",
  grounding: "Durchsuche Wissensbasis…",
  streaming: "Denkt nach…",
  executing_tools: "Führe Aktionen aus…",
  error: "Fehler",
};

interface CoachSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

export default function CoachSlideOver({ isOpen, onClose, initialPrompt }: CoachSlideOverProps) {
  const {
    updateWeeklyPlan,
    chatMessages: messages,
    setChatMessages: setMessages,
    coachMemories,
    deleteCoachMemory,
    bodyWeightLog,
  } = useApp();
  const [input, setInput] = useState(initialPrompt || "");
  const [showMemories, setShowMemories] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const session = useCoachSessionState();
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);

  const busy = session.status !== "idle";
  const streamingActive = session.status === "streaming" || session.status === "executing_tools";

  // Streaming-Nachricht nur als ChatMessage anhängen, wenn bereits tatsächlicher Text gestreamt wird
  const streamingMessage: ChatMessage | null =
    streamingActive && session.partialText.trim().length > 0
      ? {
          id: "__coach_streaming__",
          role: "coach",
          text: session.partialText + (session.status === "streaming" ? " ▍" : ""),
          timestamp: new Date(),
          model: session.usedModel ?? undefined,
        }
      : null;
  const displayMessages = streamingMessage ? [...messages, streamingMessage] : messages;

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Keyboard shortcut: Escape schließt Coach oder beendet Fullscreen
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  // Handle drag for bottom sheet
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || isFullscreen) return;
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = startYRef.current;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !sheetRef.current || isFullscreen) return;
    currentYRef.current = e.touches[0].clientY;
    const delta = currentYRef.current - startYRef.current;
    if (delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      setDragActive(true);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !sheetRef.current || isFullscreen) return;
    const delta = currentYRef.current - startYRef.current;
    sheetRef.current.style.transform = "";
    setDragActive(false);
    if (delta > 100) {
      onClose();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isMobile || isFullscreen) return;
    startYRef.current = e.clientY;
    currentYRef.current = startYRef.current;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      currentYRef.current = moveEvent.clientY;
      const delta = currentYRef.current - startYRef.current;
      if (delta > 0 && sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${delta}px)`;
        setDragActive(true);
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (sheetRef.current) {
        const delta = currentYRef.current - startYRef.current;
        sheetRef.current.style.transform = "";
        setDragActive(false);
        if (delta > 100) onClose();
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Stabile Identität für React.memo auf ChatMessage
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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with click-to-close on all screens */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200 cursor-pointer",
          isFullscreen && "hidden"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over / Fullscreen Modal / Bottom Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed z-[60] bg-zinc-950 border-zinc-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-300",
          isFullscreen
            ? "inset-0 w-full h-full rounded-none border-0 z-[70] animate-in fade-in zoom-in-95 duration-200"
            : isMobile
            ? "bottom-0 left-0 right-0 h-[92vh] max-h-[92vh] rounded-t-3xl border-t border-r-0 border-b-0 border-l-0 slide-up"
            : "right-0 top-0 bottom-0 w-full sm:w-[460px] md:w-[500px] lg:w-[560px] 2xl:w-[640px] border-l border-r-0 border-t-0 border-b-0 slide-in-right"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={dragActive && !isFullscreen ? { transition: "none" } : { transition: "transform 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out" }}
      >
        {/* Drag Handle (Mobile only when not fullscreen) */}
        {isMobile && !isFullscreen && (
          <div className="flex items-center justify-center px-4 py-3 border-b border-zinc-800 shrink-0">
            <div className="w-10 h-1 rounded-full bg-zinc-700" />
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/95 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-cyan-400 shrink-0">
              <Bot size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-zinc-100 truncate">Performance Coach</h1>
                {isFullscreen && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                    VOLLBILD
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate">Ganzheitliche Steuerung • Garmin • Waage • Ernährung</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowMemories(!showMemories)}
              className={cn(
                "p-2 rounded-xl border text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer",
                showMemories
                  ? "bg-zinc-800 border-white/20"
                  : "bg-zinc-900 border-zinc-800 hover:border-white/20"
              )}
              aria-label="Gedächtnis"
              title="Coach-Gedächtnis"
            >
              <Brain size={16} />
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono ml-1">
                {coachMemories.length}
              </span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer"
              aria-label={isFullscreen ? "Fenstermodus" : "Vollbildmodus"}
              title={isFullscreen ? "Fenstermodus (Esc)" : "Vollbildmodus"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-rose-500/10 hover:border-rose-500/30 border border-zinc-800/80 transition-all cursor-pointer"
              aria-label="Schließen"
              title="Schließen (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab switchers (Desktop only, or when memories open) */}
        {!isMobile && (
          <div className={cn(
            "flex items-center gap-1 p-1 rounded-xl bg-zinc-900/60 border border-white/[0.06] mx-3 mb-2 mt-2",
            isFullscreen && "max-w-5xl mx-auto w-full px-4"
          )}>
            <button
              onClick={() => setShowMemories(false)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                !showMemories
                  ? "bg-zinc-800 text-zinc-100 border border-white/10 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <MessageSquare size={12} />
              <span>Chat</span>
            </button>

            <button
              onClick={() => setShowMemories(true)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                showMemories
                  ? "bg-zinc-800 text-zinc-100 border border-white/10 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Brain size={12} />
              <span>Gedächtnis</span>
            </button>
          </div>
        )}

        {/* Memory panel */}
        {showMemories && (
          <div className="p-4 border-b border-zinc-800 shrink-0 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Coach-Gedächtnis</h3>
            </div>
            {coachMemories.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">Keine gespeicherten Fakten. Der Coach lernt automatisch aus Gesprächen.</p>
            ) : (
              <div className="space-y-2">
                {coachMemories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start justify-between gap-2"
                  >
                    <p className="text-xs text-zinc-300 flex-1">{mem.content}</p>
                    <button
                      onClick={() => deleteCoachMemory(mem.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                      aria-label="Löschen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat Window */}
        {!showMemories && (
          <div className={cn(
            "flex-1 flex flex-col min-h-0 overflow-hidden w-full",
            isFullscreen && "max-w-4xl 2xl:max-w-5xl mx-auto"
          )}>
            <ChatWindow messages={displayMessages} onActionClick={handleActionClick} />

            {/* Status-Bubble: solange noch kein (Teil-)Text streamt */}
            {busy && !(streamingActive && session.partialText.length > 0) && (
              <div className="px-4 pb-2 flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
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
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-rose-500/40 text-[11px] font-semibold transition-all cursor-pointer shrink-0"
                  title="Antwort abbrechen"
                >
                  <CircleStop size={13} />
                  <span className="hidden sm:inline">Stop</span>
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
                  <span className="hidden sm:inline">Stop</span>
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
      </div>
    </>
  );
}