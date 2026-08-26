"use client";

import { cn } from "@/lib/utils";
import { intensityColor } from "./libraryTheme";
import type { SparklineSegment } from "../types";

interface IntervalSparklineProps {
  segments: SparklineSegment[];
  className?: string;
  heightClass?: string;
}

export default function IntervalSparkline({
  segments,
  className,
  heightClass = "h-10 sm:h-12",
}: IntervalSparklineProps) {
  if (!segments || segments.length === 0) {
    return (
      <div
        className={cn(
          "w-full rounded-xl bg-zinc-950/60 border border-zinc-800/70 flex items-center justify-center",
          heightClass,
          className
        )}
      >
        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
          Kein Intervall-Profil
        </span>
      </div>
    );
  }

  const maxPct = Math.max(...segments.map((s) => s.pct), 0.05);
  const totalWeight = segments.reduce((sum, s) => sum + Math.max(1, s.weight), 0);

  return (
    <div
      className={cn(
        "w-full rounded-xl bg-zinc-950/60 border border-zinc-800/70 p-1.5 flex items-end gap-[2px] overflow-hidden",
        heightClass,
        className
      )}
      role="img"
      aria-label="Intervall-Verlauf"
    >
      {segments.map((segment, index) => {
        const widthShare = (Math.max(1, segment.weight) / totalWeight) * 100;
        const heightShare = Math.max(12, Math.min(100, (segment.pct / maxPct) * 100));
        const isPhaseColored =
          segment.phase === "warmup" || segment.phase === "rest" || segment.phase === "cooldown";
        return (
          <div
            key={index}
            className="flex flex-col justify-end h-full min-w-[3px]"
            style={{ width: `${widthShare}%` }}
            title={`${Math.round(segment.pct * 100)}% · ${Math.round(segment.weight / 60)} min`}
          >
            <div
              className={cn(
                "w-full rounded-t-[2px]",
                isPhaseColored ? phaseBarClass(segment.phase) : intensityColor(segment.pct)
              )}
              style={{ height: `${heightShare}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function phaseBarClass(phase: SparklineSegment["phase"]): string {
  switch (phase) {
    case "warmup":
      return "bg-amber-500/80";
    case "cooldown":
      return "bg-sky-500/70";
    case "rest":
      return "bg-zinc-600";
    default:
      return "bg-cyan-400";
  }
}
