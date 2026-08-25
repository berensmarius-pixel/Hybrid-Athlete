"use client";

import { useState } from "react";
import { X, CheckCircle2, Bike, Footprints } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId, cn } from "@/lib/utils";
import type { ActiveEnduranceSession, EnduranceSession } from "@/types";

interface ActiveEnduranceLoggerProps {
  session: ActiveEnduranceSession;
  onDiscard: () => void;
}

const RPE_LABELS: Record<number, string> = {
  1: "Sehr leicht", 2: "Leicht", 3: "Moderat", 4: "Etwas anstrengend",
  5: "Anstrengend", 6: "Anstrengend+", 7: "Sehr anstrengend",
  8: "Sehr anstrengend+", 9: "Extrem", 10: "Maximum",
};

function InputCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/40">
      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  );
}

export default function ActiveEnduranceLogger({ session, onDiscard }: ActiveEnduranceLoggerProps) {
  const { addSession, setActiveSession } = useApp();
  const [values, setValues] = useState<{
    activityType: "cycling" | "running";
    duration: string;
    heartRate: number | "";
    pace: string;
    rpe: number;
  }>({
    activityType: session.activityType,
    duration: session.duration,
    heartRate: session.heartRate,
    pace: session.pace,
    rpe: session.rpe,
  });
  const [notes, setNotes] = useState("");
  const [hrZones, setHrZones] = useState<string[]>(["", "", "", "", ""]);
  const [saved, setSaved] = useState(false);

  function patch(update: Partial<typeof values>) {
    const next = { ...values, ...update };
    setValues(next);
    setActiveSession({ ...session, ...next });
  }

  const isRunning = values.activityType === "running";

  function handleFinish() {
    if (!values.duration.trim()) return;
    const logged: EnduranceSession = {
      kind: "endurance",
      id: generateId(),
      date: new Date().toISOString(),
      activityType: values.activityType,
      duration: values.duration,
      heartRate: values.heartRate,
      pace: values.pace,
      rpe: values.rpe,
      templateId: session.templateId,
      templateName: session.templateName,
      notes: notes.trim() || undefined,
      hrZones: hrZones.some((z) => z !== "") ? hrZones.map((z) => Number(z) || 0) : undefined,
    };
    addSession(logged);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setActiveSession(null);
    }, 1500);
  }

  const title = session.templateName
    ?? (isRunning ? "Laufen" : "Radfahren");

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          {isRunning
            ? <Footprints size={22} className="text-green-400" />
            : <Bike size={22} className="text-orange-400" />
          }
          <div>
            <h1 className="text-xl font-bold text-zinc-100 truncate">{title}</h1>
            <p className={cn("text-sm", isRunning ? "text-green-400" : "text-orange-400")}>Aktives Training</p>
          </div>
        </div>
        <button
          onClick={onDiscard}
          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
        {/* Template hint */}
        {session.templateName && (
          <div className={cn(
            "px-4 py-3 rounded-xl border text-sm",
            isRunning ? "bg-green-600/10 border-green-500/30 text-green-300" : "bg-orange-500/10 border-orange-500/30 text-orange-300"
          )}>
            📋 {session.templateName}
          </div>
        )}

        {/* Duration */}
        <InputCard label="Dauer">
          <input
            type="text"
            value={values.duration}
            onChange={(e) => patch({ duration: e.target.value })}
            placeholder="z.B. 45:00 oder 1:30:00"
            className={cn(
              "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none",
              isRunning ? "focus:border-green-500/70 focus:ring-1 focus:ring-green-500/30" : "focus:border-orange-500/70 focus:ring-1 focus:ring-orange-500/30"
            )}
          />
        </InputCard>

        {/* HR + Pace */}
        <div className="grid grid-cols-2 gap-3">
          <InputCard label="Herzfrequenz (bpm)">
            <input
              type="number"
              value={values.heartRate}
              onChange={(e) => patch({ heartRate: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="145"
              min={30} max={220}
              className={cn(
                "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none",
                isRunning ? "focus:border-green-500/70" : "focus:border-orange-500/70"
              )}
            />
          </InputCard>
          <InputCard label="Pace / Watt">
            <input
              type="text"
              value={values.pace}
              onChange={(e) => patch({ pace: e.target.value })}
              placeholder={isRunning ? "5:30/km" : "220W"}
              className={cn(
                "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none",
                isRunning ? "focus:border-green-500/70" : "focus:border-orange-500/70"
              )}
            />
          </InputCard>
        </div>

        {/* RPE */}
        <InputCard label={`RPE – Anstrengungsgrad (${values.rpe}/10)`}>
          <input
            type="range" min={1} max={10}
            value={values.rpe}
            onChange={(e) => patch({ rpe: Number(e.target.value) })}
            className={cn("w-full mb-2", isRunning ? "accent-green-500" : "accent-orange-500")}
          />
          <div className="flex justify-between text-xs text-zinc-600">
            <span>1</span>
            <span className="text-zinc-400 font-medium">{RPE_LABELS[values.rpe]}</span>
            <span>10</span>
          </div>
        </InputCard>

        {/* HR Zones */}
        <InputCard label="HF-Zonen (Minuten, optional)">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {["Z1", "Z2", "Z3", "Z4", "Z5"].map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className={`text-[10px] font-semibold ${
                  i === 0 ? "text-sky-400" : i === 1 ? "text-green-400" : i === 2 ? "text-yellow-400" : i === 3 ? "text-orange-400" : "text-red-400"
                }`}>{label}</span>
                <input
                  type="number"
                  min={0}
                  value={hrZones[i]}
                  onChange={(e) => {
                    const next = [...hrZones];
                    next[i] = e.target.value;
                    setHrZones(next);
                  }}
                  placeholder="0"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-1 py-1.5 text-xs text-zinc-100 text-center focus:outline-none focus:ring-1 focus:ring-blue-500/40"
                />
              </div>
            ))}
          </div>
        </InputCard>

        {/* Notes */}
        <InputCard label="Notizen (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Wie hat sich das Training angefühlt? Besonderheiten?"
            rows={3}
            className={cn(
              "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none",
              isRunning ? "focus:border-green-500/70" : "focus:border-orange-500/70"
            )}
          />
        </InputCard>
      </div>

      {/* Finish button */}
      <div className="px-4 pb-4 pt-2 border-t border-zinc-800/60 shrink-0">
        {saved ? (
          <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-600/20 border border-green-600/40">
            <CheckCircle2 size={18} className="text-green-400" />
            <span className="text-green-400 text-sm font-semibold">Gespeichert!</span>
          </div>
        ) : (
          <button
            onClick={handleFinish}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-bold text-white transition-colors",
              isRunning ? "bg-green-600 hover:bg-green-500 active:bg-green-700" : "bg-orange-500 hover:bg-orange-400 active:bg-orange-600"
            )}
          >
            Training abschließen
          </button>
        )}
      </div>
    </div>
  );
}
