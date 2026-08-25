"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Clock, CheckCircle2, Plus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId, formatClockDuration } from "@/lib/utils";
import ExerciseRow from "@/components/logger/ExerciseRow";
import type { ActiveGymSession, ExerciseEntry, GymSession } from "@/types";

interface ActiveGymLoggerProps {
  session: ActiveGymSession;
  onDiscard: () => void;
}

function emptyEntry(): ExerciseEntry {
  return {
    id: generateId(),
    exercise: "",
    sets: [{ id: generateId(), type: "working", weight: "", reps: "", isCompleted: false }],
  };
}

function formatDuration(seconds: number): string {
  return formatClockDuration(seconds);
}

export default function ActiveGymLogger({ session, onDiscard }: ActiveGymLoggerProps) {
  const { addSession, setActiveSession, loggedSessions } = useApp();
  const [entries, setEntries] = useState<ExerciseEntry[]>(
    session.entries.length > 0 ? session.entries : [emptyEntry()]
  );
  const [notes, setNotes] = useState("");
  const [sessionRpe, setSessionRpe] = useState(0);
  const [saved, setSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = session.startTime ? new Date(session.startTime).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startTime]);

  const totalSets = entries.reduce(
    (acc, e) => acc + e.sets.filter((s) => s.isCompleted).length,
    0
  );
  const totalVolume = entries.reduce(
    (acc, e) =>
      acc +
      e.sets.reduce((a, s) => {
        if (!s.isCompleted) return a;
        return a + (Number(s.weight) || 0) * (Number(s.reps) || 0);
      }, 0),
    0
  );

  function syncEntries(next: ExerciseEntry[]) {
    setEntries(next);
    setActiveSession({ ...session, entries: next });
  }

  function updateEntry(id: string, patch: Partial<ExerciseEntry>) {
    syncEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    syncEntries(entries.filter((e) => e.id !== id));
  }

  function addEntry() {
    syncEntries([...entries, emptyEntry()]);
  }

  function handleFinish() {
    const logged: GymSession = {
      kind: session.kind as "gym" | "stretching" | "warmup",
      id: generateId(),
      date: new Date().toISOString(),
      templateId: session.templateId,
      templateName: session.templateName,
      entries: entries.filter((e) => e.exercise.trim() !== "" || e.sets.some((s) => s.isCompleted)),
      notes: notes.trim() || undefined,
      rpe: sessionRpe > 0 ? sessionRpe : undefined,
    };
    addSession(logged);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setActiveSession(null);
    }, 1500);
  }

  const title = session.templateName ?? "Workout";

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0 border-b border-zinc-800/60">
        <button
          onClick={onDiscard}
          className="flex items-center gap-1.5 text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          <ChevronDown size={20} />
          <span className="text-base font-bold">{title}</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Clock size={16} />
            <span className="text-sm font-mono tabular-nums">{formatDuration(elapsed)}</span>
          </div>

          {saved ? (
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600/20 border border-green-600/30">
              <CheckCircle2 size={15} className="text-green-400" />
              <span className="text-sm font-semibold text-green-400">Gespeichert!</span>
            </div>
          ) : (
            <button
              onClick={handleFinish}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors"
            >
              Beenden
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-8 px-4 py-3 border-b border-zinc-800/40 shrink-0">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Dauer</p>
          <p className="text-sm font-bold text-blue-400 tabular-nums">{formatDuration(elapsed)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Volumen</p>
          <p className="text-sm font-bold text-zinc-100">{totalVolume.toLocaleString("de")} kg</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold">Sätze</p>
          <p className="text-sm font-bold text-zinc-100">{totalSets}</p>
        </div>
      </div>

      {/* Exercise List */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {entries.map((entry) => (
          <ExerciseRow
            key={entry.id}
            entry={entry}
            onChange={(patch) => updateEntry(entry.id, patch)}
            onRemove={() => removeEntry(entry.id)}
            canRemove={entries.length > 1}
            loggedSessions={loggedSessions}
          />
        ))}

        <button
          onClick={addEntry}
          className="w-full flex items-center justify-center gap-2 py-3.5 mt-2 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <Plus size={16} />
          Übung hinzufügen
        </button>

        {/* Session RPE */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            Session-RPE {sessionRpe > 0 ? `(${sessionRpe}/10)` : "(optional)"}
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {[1,2,3,4,5,6,7,8,9,10].map((v) => (
              <button
                key={v}
                onClick={() => setSessionRpe(v === sessionRpe ? 0 : v)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  sessionRpe === v
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Session notes */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            Notizen (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Wie hat sich das Training angefühlt? Besonderheiten?"
            rows={3}
            className="w-full bg-zinc-800/60 border border-zinc-700/40 rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
