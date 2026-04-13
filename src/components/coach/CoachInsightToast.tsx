"use client";

import { useEffect, useState, useCallback } from "react";
import { Bot, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { LoggedSession, GymSession } from "@/types";

const GEMINI_KEY = "AIzaSyB8etVS0VuF21zxdkOJidxsgIImf0wK5ZE";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

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

async function fetchInsight(session: LoggedSession): Promise<string> {
  const prompt = buildInsightPrompt(session);
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text?.trim() ?? "";
}

export default function CoachInsightToast() {
  const { loggedSessions } = useApp();
  const [insight, setInsight] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const lastSeenRef = useState<string | null>(null);

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
    if (lastSeenRef[0] === latest.id) return;
    lastSeenRef[0] = latest.id;

    let cancelled = false;
    fetchInsight(latest)
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
