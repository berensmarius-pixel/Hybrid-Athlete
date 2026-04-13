"use client";

import { Bike, Footprints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnduranceSession } from "@/types";

type EnduranceFields = Pick<
  EnduranceSession,
  "activityType" | "duration" | "heartRate" | "pace" | "rpe"
>;

interface EnduranceFormProps {
  values: EnduranceFields;
  onChange: (patch: Partial<EnduranceFields>) => void;
}

const RPE_LABELS: Record<number, string> = {
  1: "Sehr leicht",
  2: "Leicht",
  3: "Moderat",
  4: "Etwas anstrengend",
  5: "Anstrengend",
  6: "Anstrengend+",
  7: "Sehr anstrengend",
  8: "Sehr anstrengend+",
  9: "Extrem",
  10: "Maximum",
};

function InputCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/40">
      <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function EnduranceForm({ values, onChange }: EnduranceFormProps) {
  return (
    <div className="space-y-3">
      {/* Activity type toggle */}
      <InputCard label="Aktivität">
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ activityType: "cycling" })}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border transition-all",
              values.activityType === "cycling"
                ? "bg-orange-500 text-white border-transparent"
                : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
            )}
          >
            <Bike size={16} />
            Radfahren
          </button>
          <button
            onClick={() => onChange({ activityType: "running" })}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold border transition-all",
              values.activityType === "running"
                ? "bg-green-600 text-white border-transparent"
                : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500"
            )}
          >
            <Footprints size={16} />
            Laufen
          </button>
        </div>
      </InputCard>

      {/* Duration */}
      <InputCard label="Dauer">
        <input
          type="text"
          value={values.duration}
          onChange={(e) => onChange({ duration: e.target.value })}
          placeholder="z.B. 45:00 oder 1:30:00"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/70 focus:ring-1 focus:ring-orange-500/30"
        />
      </InputCard>

      {/* HR + Pace side by side */}
      <div className="grid grid-cols-2 gap-3">
        <InputCard label="Herzfrequenz (bpm)">
          <input
            type="number"
            value={values.heartRate}
            onChange={(e) =>
              onChange({
                heartRate: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
            placeholder="z.B. 145"
            min={30}
            max={220}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/70 focus:ring-1 focus:ring-orange-500/30"
          />
        </InputCard>

        <InputCard label="Pace">
          <input
            type="text"
            value={values.pace}
            onChange={(e) => onChange({ pace: e.target.value })}
            placeholder="5:30/km"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-orange-500/70 focus:ring-1 focus:ring-orange-500/30"
          />
        </InputCard>
      </div>

      {/* RPE slider */}
      <InputCard label={`RPE – Anstrengungsgrad (${values.rpe}/10)`}>
        <input
          type="range"
          min={1}
          max={10}
          value={values.rpe}
          onChange={(e) => onChange({ rpe: Number(e.target.value) })}
          className="w-full accent-orange-500 mb-2"
        />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>1</span>
          <span className="text-zinc-400 font-medium">{RPE_LABELS[values.rpe]}</span>
          <span>10</span>
        </div>
      </InputCard>
    </div>
  );
}
