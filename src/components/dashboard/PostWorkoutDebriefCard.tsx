"use client";

// ─── Post-Workout Debrief Feed (Dashboard) ───────────────────────────────────
//
// Zeigt die letzten AI-Debriefs aus der Garmin-Webhook-Pipeline
// (app_state `hybrid_athlete_debriefs`, via /api/state hydratisiert).

import { useEffect, useState } from "react";
import { Zap, Sparkles, ClipboardList } from "lucide-react";
import type { PostWorkoutDebrief } from "@/types";
import { DEBRIEFS_STATE_KEY } from "@/lib/persistence/keys";

const FETCH_TIMEOUT_MS = 8000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "gerade jetzt";
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} d`;
}

export default function PostWorkoutDebriefCard() {
  const [debriefs, setDebriefs] = useState<PostWorkoutDebrief[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/state?keys=${encodeURIComponent(DEBRIEFS_STATE_KEY)}`,
          { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { state?: Record<string, unknown> };
        const value = data.state?.[DEBRIEFS_STATE_KEY];
        if (!cancelled && Array.isArray(value)) setDebriefs(value as PostWorkoutDebrief[]);
      } catch {
        // Server nicht erreichbar → Karte bleibt leer
      }
    }

    void load();
    // Debriefs entstehen serverseitig – nach kurzer Zeit nochmal ziehen
    const t = setTimeout(load, 15_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (debriefs.length === 0) return null;
  const latest = debriefs[0];

  return (
    <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 shadow-xl shadow-black/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400 font-mono">
          <Zap size={14} className="text-lime-400" />
          Post-Workout Debrief
        </h3>
        <span className="text-[10px] font-semibold text-zinc-500 flex items-center gap-1">
          {latest.generator === "ai" ? (
            <>
              <Sparkles size={10} className="text-cyan-400" /> KI-Analyse
            </>
          ) : (
            <>Auto-Summary</>
          )}
          {" · "}
          {timeAgo(latest.createdAt)}
        </span>
      </div>

      {latest.headline && (
        <p className="text-sm font-bold text-zinc-100 leading-snug">{latest.headline}</p>
      )}
      <p className="text-[13px] text-zinc-300 leading-relaxed">{latest.debrief}</p>

      {latest.stats && latest.stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {latest.stats.map((s) => (
            <span
              key={s.label}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.06] border border-white/10 text-zinc-300"
            >
              {s.label}: <span className="text-lime-300">{s.value}</span>
            </span>
          ))}
        </div>
      )}

      {latest.plannedWorkout?.title && (
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 pt-0.5">
          <ClipboardList size={11} />
          Geplant: {latest.plannedWorkout.title}
        </p>
      )}

      {debriefs.length > 1 && (
        <p className="text-[10px] text-zinc-600">
          + {debriefs.length - 1} weitere Debriefs im Verlauf
        </p>
      )}
    </div>
  );
}
