"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Sparkles, ChevronRight, Award, Layers } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { computePerformanceCorrelations } from "@/lib/analytics/correlationEngine";

const PerformanceAnalyticsModal = dynamic(() => import("./PerformanceAnalyticsModal"), { ssr: false });

export default function PerformanceAnalyticsCard() {
  const { garminHealthLogs, garminActivities, nutritionLogs, bodyWeightLog, loggedSessions } = useApp();
  const [modalOpen, setModalOpen] = useState(false);

  const insights = useMemo(
    () =>
      computePerformanceCorrelations(
        garminHealthLogs,
        garminActivities,
        nutritionLogs,
        bodyWeightLog,
        loggedSessions
      ),
    [garminHealthLogs, garminActivities, nutritionLogs, bodyWeightLog, loggedSessions]
  );

  const topInsight = insights[0];

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-purple-950/20 via-zinc-900 to-zinc-900 border border-zinc-800 hover:border-purple-500/40 transition-all cursor-pointer group shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:scale-105 transition-transform">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-zinc-100 group-hover:text-purple-300 transition-colors">
                  Performance-Korrelationen & Trends
                </h3>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  AI Deep Analytics
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Erkenntnisse aus Schlaf, Ernährung & Wattleistung
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-purple-300 transition-colors">
            <span className="font-semibold text-purple-400/90">Details</span>
            <ChevronRight size={15} />
          </div>
        </div>

        {topInsight && (
          <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-200">{topInsight.title}</span>
              <span className="text-[10px] font-bold text-emerald-400">{topInsight.badge}</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              💡 {topInsight.impactStatement}
            </p>
          </div>
        )}
      </div>

      <PerformanceAnalyticsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
