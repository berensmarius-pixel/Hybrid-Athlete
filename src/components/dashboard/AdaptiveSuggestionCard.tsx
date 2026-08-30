"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Zap, ArrowRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { analyzeAdaptiveTraining, AdaptiveWorkoutSuggestion } from "@/lib/adaptiveWorkoutEngine";
import { getDefaultGarminHealth } from "@/lib/garmin/garminService";
import { getLocalDateString } from "@/lib/utils";

const AdaptivePlanModal = dynamic(() => import("@/components/training/AdaptivePlanModal"), { ssr: false });

interface AdaptiveSuggestionCardProps {
  selectedDate?: string;
}

export default function AdaptiveSuggestionCard({ selectedDate }: AdaptiveSuggestionCardProps) {
  const { garminHealthLogs, weeklyPlan } = useApp();
  const [selectedSuggestion, setSelectedSuggestion] = useState<AdaptiveWorkoutSuggestion | null>(null);

  const activeDate = selectedDate || getLocalDateString();
  const health = garminHealthLogs[activeDate] || getDefaultGarminHealth(activeDate);

  const suggestions = useMemo(
    () => analyzeAdaptiveTraining(health, weeklyPlan),
    [health, weeklyPlan]
  );

  if (suggestions.length === 0) return null;

  const topSuggestion = suggestions[0];

  return (
    <>
      <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/[0.08] shadow-2xl space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-zinc-900 text-amber-400 border border-white/10 shrink-0 flex items-center justify-center">
              <Zap size={16} />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-400 block font-mono">
                {topSuggestion.badge}
              </span>
              <h4 className="text-sm font-bold text-zinc-100 truncate">{topSuggestion.title}</h4>
            </div>
          </div>
          <button
            onClick={() => setSelectedSuggestion(topSuggestion)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer active:scale-95"
          >
            <span>Einplanen</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed relative z-10">
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
