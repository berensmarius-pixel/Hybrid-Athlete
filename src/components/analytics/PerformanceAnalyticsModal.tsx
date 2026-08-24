"use client";

import { useState } from "react";
import {
  X,
  TrendingUp,
  BarChart3,
  Sparkles,
  Zap,
  Moon,
  Heart,
  Bike,
  Dumbbell,
  Scale,
  Award,
  ChevronRight,
  Info,
  Activity,
  Layers,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  computePerformanceCorrelations,
  buildMultiMetricTimeline,
  PerformanceCorrelationInsight,
} from "@/lib/analytics/correlationEngine";

interface PerformanceAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PerformanceAnalyticsModal({ isOpen, onClose }: PerformanceAnalyticsModalProps) {
  const { garminHealthLogs, garminActivities, nutritionLogs, bodyWeightLog, loggedSessions } = useApp();

  const insights = computePerformanceCorrelations(
    garminHealthLogs,
    garminActivities,
    nutritionLogs,
    bodyWeightLog,
    loggedSessions
  );

  const timelinePoints = buildMultiMetricTimeline(
    garminHealthLogs,
    bodyWeightLog,
    garminActivities,
    14
  );

  const [activeMetric, setActiveMetric] = useState<"load" | "sleep" | "hrv" | "weight">("load");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-purple-950/20 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <TrendingUp size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-zinc-100 flex items-center gap-2">
                <span>Performance-Korrelationen</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Deep Analytics
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Zusammenhänge zwischen Schlaf, Ernährung, Belastung & sportlicher Leistung
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* ── Correlation Insights Cards ──────────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Sparkles size={14} className="text-purple-400" />
              <span>Ganzheitliche Performance-Zusammenhänge</span>
            </h3>

            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-purple-500/40 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {insight.category === "sleep_power" ? <Bike size={16} /> : insight.category === "protein_muscle" ? <Dumbbell size={16} /> : <Activity size={16} />}
                      </div>
                      <h4 className="text-sm font-bold text-zinc-100">{insight.title}</h4>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${insight.badgeColor}`}>
                      {insight.badge}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-zinc-200 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800/80">
                    💡 {insight.impactStatement}
                  </p>

                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {insight.detailExplanation}
                  </p>

                  <div className="pt-1 flex items-center gap-1.5 text-[11px] text-purple-300 font-medium">
                    <Award size={13} className="text-purple-400 shrink-0" />
                    <span><strong>Empfehlung:</strong> {insight.actionableTip}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 14-Day Multi-Metric Timeline Chart ───────────────────────────── */}
          <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-zinc-100">14-Tage Trend-Verlauf</h4>
                <p className="text-xs text-zinc-400">Verfolge deine Metriken im zeitlichen Verlauf</p>
              </div>

              {/* Metric Selector Tabs */}
              <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveMetric("load")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeMetric === "load" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Belastung
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("sleep")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeMetric === "sleep" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Schlaf
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("hrv")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeMetric === "hrv" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  HRV
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("weight")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeMetric === "weight" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Gewicht
                </button>
              </div>
            </div>

            {/* Visual SVG Multi-Point Curve */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-2">
              <div className="h-28 w-full flex items-end">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 50">
                  <polyline
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={timelinePoints
                      .map((p, idx) => {
                        const x = (idx / (timelinePoints.length - 1)) * 100;
                        const val =
                          activeMetric === "load"
                            ? (p.acuteLoad || 343) / 500
                            : activeMetric === "sleep"
                            ? (p.sleepScore || 90) / 100
                            : activeMetric === "hrv"
                            ? (p.hrvMs || 75) / 120
                            : (p.weightKg || 78) / 100;
                        const y = 45 - val * 35;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                </svg>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-zinc-800/60 pt-2">
                <span>{timelinePoints[0]?.date}</span>
                <span className="text-purple-400 font-bold">14 Tage Historie</span>
                <span>{timelinePoints[timelinePoints.length - 1]?.date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
