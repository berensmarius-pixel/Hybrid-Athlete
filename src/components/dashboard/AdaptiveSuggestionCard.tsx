"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Zap, ArrowRight, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { analyzeAdaptiveTraining, AdaptiveWorkoutSuggestion } from "@/lib/adaptiveWorkoutEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";

const AdaptivePlanModal = dynamic(() => import("@/components/training/AdaptivePlanModal"), { ssr: false });

export default function AdaptiveSuggestionCard() {
  const { garminHealthLogs, weeklyPlan } = useApp();
  const [selectedSuggestion, setSelectedSuggestion] = useState<AdaptiveWorkoutSuggestion | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];
  const health = garminHealthLogs[todayStr] || getDefaultGarminHealth(todayStr);

  const suggestions = useMemo(
    () => analyzeAdaptiveTraining(health, weeklyPlan),
    [health, weeklyPlan]
  );

  if (suggestions.length === 0) return null;

  const topSuggestion = suggestions[0];

  return (
    <>
      <div className="p-4 rounded-3xl bg-linear-to-r from-amber-500/15 via-zinc-900 to-zinc-900 border border-amber-500/30 shadow-lg shadow-amber-500/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Zap size={16} />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block">
                {topSuggestion.badge}
              </span>
              <h4 className="text-sm font-bold text-zinc-100">{topSuggestion.title}</h4>
            </div>
          </div>
          <button
            onClick={() => setSelectedSuggestion(topSuggestion)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
          >
            <span>Einplanen</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          {topSuggestion.reason}
        </p>
      </div>

      {selectedSuggestion && (
        <AdaptivePlanModal
          isOpen={!!selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
          suggestion={selectedSuggestion}
        />
      )}
    </>
  );
}
