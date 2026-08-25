"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Bot, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { geminiGenerateText } from "@/lib/gemini/client";
import type { LoggedSession, GymSession } from "@/types";

function buildInsightPrompt(session: LoggedSession): string {
  if (session.kind === "endurance") {
    return `Du bist ein motivierender Sportcoach. Der Athlet hat gerade eine Ausdauereinheit abgeschlossen:
Typ: ${session.activityType === "running" ? "Laufen" : "Radfahren"}
Dauer: ${session.duration}
Herzfrequenz: ${session.heartRate || "–"} bpm
Pace/Tempo: ${session.pace || "–"}
RPE: ${session.rpe}/10
${session.notes ? `Notizen: ${session.notes}` : ""}

Gib einen kurzen, motivierenden Kommentar (max. 2 Sätze). Sei spezifisch auf die Daten bezogen. Kein "Als KI-Coach..." — direkt auf Deutsch antworten.`;
  }

  const gym = session as GymSession;
  const totalVolume = gym.entries.reduce((acc, e) =>
    acc + e.sets.reduce((a, s) => a + (s.isCompleted ? (Number(s.weight) || 0) * (Number(s.reps) || 0) : 0), 0), 0
  );
  const totalSets = gym.entries.reduce((acc, e) => acc + e.sets.filter((s) => s.isCompleted).length, 0);
  const exercises = gym.entries.map((e) => e.exercise).filter(Boolean).join(", ");

  return `Du bist ein motivierender Sportcoach. Der Athlet hat gerade eine Gym-Einheit abgeschlossen:
Übungen: ${exercises || "–"}
Sätze: ${totalSets}
Gesamtvolumen: ${totalVolume.toLocaleString("de")} kg
${session.notes ? `Notizen: ${session.notes}` : ""}

Gib einen kurzen, motivierenden Kommentar (max. 2 Sätze). Sei spezifisch auf die Daten bezogen. Kein "Als KI-Coach..." — direkt auf Deutsch antworten.`;
}

export default function CoachInsightToast() {
  const { loggedSessions } = useApp();
  const [insight, setInsight] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  // useRef statt useState – dedupliziert korrekt und triggert keine Re-Renders
  const lastSeenIdRef = useRef<string | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setInsight(null), 300);
  }, []);

  useEffect(() => {
    const latest = loggedSessions[0];
    if (!latest) return;
    // Skip Strava-imported sessions (no point commenting on old data)
    if (latest.kind === "endurance" && latest.stravaId) return;
    // Don't re-trigger for the same session
    if (lastSeenIdRef.current === latest.id) return;
    lastSeenIdRef.current = latest.id;

    let cancelled = false;
    geminiGenerateText(buildInsightPrompt(latest))
      .then((text) => {
        if (!cancelled && text) {
          setInsight(text);
          setVisible(true);
          // Auto-dismiss after 10s
          setTimeout(() => {
            if (!cancelled) dismiss();
          }, 10000);
        }
      })
      .catch(() => { /* silent fail */ });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedSessions]);

  if (!insight) return null;

  return (
    <div
      className={`fixed bottom-20 inset-x-4 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-800 border border-zinc-700/60 shadow-2xl">
        <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
          <Bot size={15} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Coach-Feedback</p>
          <p className="text-sm text-zinc-200 leading-snug">{insight}</p>
        </div>
        <button onClick={dismiss} className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
