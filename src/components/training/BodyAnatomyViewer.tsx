"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface BodyAnatomyViewerProps {
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  activeMuscleId?: string;
  className?: string;
}

export default function BodyAnatomyViewer({
  primaryMuscles = [],
  secondaryMuscles = [],
  activeMuscleId,
  className,
}: BodyAnatomyViewerProps) {
  // Helper to check highlight level for body regions
  const getRegionStatus = (keywords: string[]) => {
    const isPrimary = primaryMuscles.some((m) =>
      keywords.some((k) => m.toLowerCase().includes(k.toLowerCase()))
    );
    if (isPrimary) return "primary";

    const isSecondary = secondaryMuscles.some((m) =>
      keywords.some((k) => m.toLowerCase().includes(k.toLowerCase()))
    );
    if (isSecondary) return "secondary";

    if (activeMuscleId && keywords.some((k) => activeMuscleId.toLowerCase().includes(k.toLowerCase()))) {
      return "primary";
    }

    return "inactive";
  };

  const chestStatus = getRegionStatus(["chest", "brust", "pectoralis"]);
  const shoulderStatus = getRegionStatus(["shoulder", "schulter", "deltoid"]);
  const armStatus = getRegionStatus(["biceps", "triceps", "trizeps", "bizeps", "arms"]);
  const coreStatus = getRegionStatus(["core", "abs", "bauch", "bauchmuskeln"]);
  const quadStatus = getRegionStatus(["quad", "oberschenkel", "legs"]);
  const backStatus = getRegionStatus(["back", "rücken", "lats", "latissimus", "trapez"]);
  const gluteStatus = getRegionStatus(["glute", "gesäß", "hip"]);
  const hamstringStatus = getRegionStatus(["hamstring", "beinbeuger", "ischiokrurale"]);
  const calfStatus = getRegionStatus(["calf", "wade", "waden"]);

  const getColor = (status: "primary" | "secondary" | "inactive") => {
    if (status === "primary") return "fill-emerald-400 stroke-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]";
    if (status === "secondary") return "fill-amber-400 stroke-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]";
    return "fill-zinc-800/80 stroke-zinc-700/50 hover:fill-zinc-700/80";
  };

  return (
    <div className={cn("flex flex-col items-center justify-center p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80", className)}>
      <div className="flex items-center gap-6">
        {/* Front View */}
        <div className="flex flex-col items-center space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Vorderseite</span>
          <svg viewBox="0 0 100 180" className="w-24 h-44 overflow-visible">
            {/* Head */}
            <circle cx="50" cy="14" r="8" className="fill-zinc-800 stroke-zinc-700/60" strokeWidth="1" />
            
            {/* Neck & Traps */}
            <path d="M 44 22 L 56 22 L 60 28 L 40 28 Z" className={getColor(backStatus)} strokeWidth="0.8" />
            
            {/* Shoulders */}
            <circle cx="34" cy="33" r="6" className={getColor(shoulderStatus)} strokeWidth="0.8" />
            <circle cx="66" cy="33" r="6" className={getColor(shoulderStatus)} strokeWidth="0.8" />

            {/* Chest */}
            <path
              d="M 39 30 L 61 30 C 63 44, 52 48, 50 49 C 48 48, 37 44, 39 30 Z"
              className={getColor(chestStatus)}
              strokeWidth="0.8"
            />

            {/* Biceps / Arms */}
            <rect x="26" y="38" width="7" height="20" rx="3.5" className={getColor(armStatus)} strokeWidth="0.8" />
            <rect x="67" y="38" width="7" height="20" rx="3.5" className={getColor(armStatus)} strokeWidth="0.8" />
            {/* Forearms */}
            <rect x="24" y="60" width="6" height="20" rx="3" className={getColor(armStatus)} strokeWidth="0.8" />
            <rect x="70" y="60" width="6" height="20" rx="3" className={getColor(armStatus)} strokeWidth="0.8" />

            {/* Core / Abs */}
            <path
              d="M 41 50 L 59 50 L 57 74 L 43 74 Z"
              className={getColor(coreStatus)}
              strokeWidth="0.8"
            />

            {/* Pelvis */}
            <path d="M 42 75 L 58 75 L 50 86 Z" className="fill-zinc-800 stroke-zinc-700/60" strokeWidth="0.8" />

            {/* Quadriceps (Left & Right) */}
            <path
              d="M 39 88 L 48 88 L 46 122 L 37 122 Z"
              className={getColor(quadStatus)}
              strokeWidth="0.8"
            />
            <path
              d="M 52 88 L 61 88 L 63 122 L 54 122 Z"
              className={getColor(quadStatus)}
              strokeWidth="0.8"
            />

            {/* Knees */}
            <circle cx="41.5" cy="126" r="3" className="fill-zinc-800 stroke-zinc-700/60" strokeWidth="0.8" />
            <circle cx="58.5" cy="126" r="3" className="fill-zinc-800 stroke-zinc-700/60" strokeWidth="0.8" />

            {/* Shins / Calves Front */}
            <rect x="38" y="131" width="7" height="32" rx="3.5" className={getColor(calfStatus)} strokeWidth="0.8" />
            <rect x="55" y="131" width="7" height="32" rx="3.5" className={getColor(calfStatus)} strokeWidth="0.8" />
          </svg>
        </div>

        {/* Back View */}
        <div className="flex flex-col items-center space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Rückseite</span>
          <svg viewBox="0 0 100 180" className="w-24 h-44 overflow-visible">
            {/* Head Back */}
            <circle cx="50" cy="14" r="8" className="fill-zinc-800 stroke-zinc-700/60" strokeWidth="1" />
            
            {/* Trapezius / Upper Back */}
            <path
              d="M 43 22 L 57 22 L 64 34 L 50 48 L 36 34 Z"
              className={getColor(backStatus)}
              strokeWidth="0.8"
            />

            {/* Rear Deltoids */}
            <circle cx="33" cy="33" r="5.5" className={getColor(shoulderStatus)} strokeWidth="0.8" />
            <circle cx="67" cy="33" r="5.5" className={getColor(shoulderStatus)} strokeWidth="0.8" />

            {/* Latissimus Dorsi */}
            <path
              d="M 37 42 L 63 42 L 57 66 L 43 66 Z"
              className={getColor(backStatus)}
              strokeWidth="0.8"
            />

            {/* Triceps / Arms */}
            <rect x="25" y="38" width="7" height="20" rx="3.5" className={getColor(armStatus)} strokeWidth="0.8" />
            <rect x="68" y="38" width="7" height="20" rx="3.5" className={getColor(armStatus)} strokeWidth="0.8" />

            {/* Glutes */}
            <ellipse cx="44" cy="78" rx="7" ry="9" className={getColor(gluteStatus)} strokeWidth="0.8" />
            <ellipse cx="56" cy="78" rx="7" ry="9" className={getColor(gluteStatus)} strokeWidth="0.8" />

            {/* Hamstrings */}
            <path
              d="M 38 90 L 48 90 L 46 122 L 37 122 Z"
              className={getColor(hamstringStatus)}
              strokeWidth="0.8"
            />
            <path
              d="M 52 90 L 62 90 L 63 122 L 54 122 Z"
              className={getColor(hamstringStatus)}
              strokeWidth="0.8"
            />

            {/* Calves (Gastrocnemius & Soleus) */}
            <ellipse cx="41.5" cy="144" rx="4.5" ry="12" className={getColor(calfStatus)} strokeWidth="0.8" />
            <ellipse cx="58.5" cy="144" rx="4.5" ry="12" className={getColor(calfStatus)} strokeWidth="0.8" />
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 text-[10px] text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="font-bold text-zinc-300">Primär</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
          <span className="font-bold text-zinc-300">Sekundär</span>
        </div>
      </div>
    </div>
  );
}
