"use client";

import { cn } from "@/lib/utils";
import type { ComplianceData } from "../types";

interface ComplianceChartProps {
  data: ComplianceData;
  accentClass?: string;
}

export default function ComplianceChart({ data, accentClass = "bg-cyan-400" }: ComplianceChartProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
          Plan vs. Ist
        </h4>
        <div className="flex items-center gap-3 text-[10px] font-bold">
          <span className="flex items-center gap-1.5 text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-700 inline-block" /> Geplant
          </span>
          <span className="flex items-center gap-1.5 text-zinc-300">
            <span className={cn("w-2.5 h-2.5 rounded-sm inline-block", accentClass)} /> Tatsächlich
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {data.metrics.map((metric) => {
          const max = Math.max(metric.planned, metric.actual, 1);
          const deviation =
            metric.planned > 0 ? ((metric.actual - metric.planned) / metric.planned) * 100 : 0;
          const onTarget = Math.abs(deviation) <= 10;
          const plannedWidth = (metric.planned / max) * 100;
          const actualWidth = (metric.actual / max) * 100;

          return (
            <div key={metric.key} className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/70 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-zinc-300">{metric.label}</span>
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-zinc-500">
                    {metric.planned}
                    {metric.unit}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-200 font-bold">
                    {metric.actual}
                    {metric.unit}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full border font-bold",
                      onTarget
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : deviation > 0
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-sky-500/15 text-sky-300 border-sky-500/30"
                    )}
                  >
                    {deviation > 0 ? "+" : ""}
                    {Math.round(deviation)}%
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <Bar widthPct={plannedWidth} colorClass="bg-zinc-700" />
                <Bar widthPct={actualWidth} colorClass={accentClass} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ widthPct, colorClass }: { widthPct: number; colorClass: string }) {
  return (
    <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClass)}
        style={{ width: `${Math.max(3, widthPct)}%` }}
      />
    </div>
  );
}
