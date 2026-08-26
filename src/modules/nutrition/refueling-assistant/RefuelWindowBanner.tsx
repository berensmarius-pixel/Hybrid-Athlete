"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Droplets, Timer, Wheat, X, Zap } from "lucide-react";
import { useRefuelingAssistant } from "./useRefuelingAssistant";
import { getRemainingTargets, getWindowProgress } from "./engine";

// ─── Refuel Window Banner ─────────────────────────────────────────────────────
// Hochprioritäres Dashboard-Banner mit 2h-Countdown nach dem Activity-Sync.
// Global gemountet (AppShell) – sichtbar auf allen Views bis Ziel erreicht,
// Fenster abläuft oder der Athlet verwirft.

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

export default function RefuelWindowBanner() {
  const { activePlan, logSuggestion, dismissPlan } = useRefuelingAssistant();

  // Sekundentakt nur solange ein Fenster aktiv ist
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!activePlan) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activePlan]);

  if (!activePlan) return null;

  const progress = getWindowProgress(activePlan, nowMs);
  const remaining = getRemainingTargets(activePlan);
  const { classification } = activePlan;

  const macroRows = [
    {
      key: "carbs",
      icon: <Wheat size={13} className="text-amber-300" />,
      label: "Carbs",
      remainingG: remaining.carbsG,
      targetG: activePlan.targets.carbsG,
      consumedG: activePlan.consumedCarbsG,
      barClass: "bg-linear-to-r from-amber-500 to-orange-400",
    },
    {
      key: "protein",
      icon: <Droplets size={13} className="text-blue-300" />,
      label: "Protein",
      remainingG: remaining.proteinG,
      targetG: activePlan.targets.proteinG,
      consumedG: activePlan.consumedProteinG,
      barClass: "bg-linear-to-r from-blue-500 to-cyan-400",
    },
  ];

  return (
    <div className="fixed inset-x-0 top-16 z-50 px-3 sm:px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="pointer-events-auto mx-auto max-w-xl p-4 rounded-3xl bg-zinc-900/95 backdrop-blur-md border border-amber-500/45 shadow-2xl shadow-amber-500/15 space-y-3 relative overflow-hidden"
      >
        {/* Ambient Glow */}
        <div className="absolute -top-10 -right-10 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header: Priorität + Countdown */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/35 shrink-0">
              <Zap size={16} />
            </div>
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Refuel Window
              </span>
              <h4 className="text-sm font-bold text-zinc-100 truncate leading-tight">
                {classification.headline}
                <span className="text-zinc-500 font-normal"> · {activePlan.activityName}</span>
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="flex items-center gap-1 justify-end text-amber-300 font-mono font-black text-lg leading-none tabular-nums">
                <Timer size={14} className="text-amber-400" />
                {formatCountdown(progress.remainingSeconds)}
              </div>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Fenster übrig</span>
            </div>
            <button
              onClick={() => dismissPlan(activePlan.id)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              aria-label="Refuel-Banner schließen"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Begründung */}
        <p className="text-xs text-zinc-400 leading-relaxed relative z-10">{classification.reason}</p>

        {/* Verbleibende Ziele */}
        <div className="grid grid-cols-2 gap-2 relative z-10">
          {macroRows.map((m) => (
            <div key={m.key} className="p-2.5 rounded-2xl bg-black/50 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-zinc-300">
                  {m.icon}
                  {m.label}
                </span>
                <span className={`font-mono font-bold ${m.remainingG === 0 ? "text-emerald-400" : "text-zinc-100"}`}>
                  {m.remainingG === 0 ? "✓" : `${m.remainingG}g`}
                  <span className="text-zinc-600 font-normal"> / {m.targetG}g</span>
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${Math.min(100, (m.consumedG / m.targetG) * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full"
                >
                  <div className={`h-full w-full rounded-full ${m.barClass}`} />
                </motion.div>
              </div>
            </div>
          ))}
        </div>

        {/* Mahlzeiten-Optionen */}
        <div className="space-y-1.5 relative z-10">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 font-mono">
            Schnelle Optionen ({activePlan.sport === "gym" ? "MPS-Fokus" : "Glykogen-Fokus"})
          </p>
          {activePlan.suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 hover:border-amber-500/25 transition-colors"
            >
              <span className="shrink-0 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 font-mono">
                {s.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-zinc-200 truncate">{s.title}</p>
                <p className="text-[11px] text-zinc-500 truncate">{s.description}</p>
                <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                  {s.carbsG}g C · {s.proteinG}g P · {s.calories} kcal · {s.prepMinutes} min
                  {s.source === "pantry" && <span className="text-emerald-400"> · Vorrat</span>}
                </p>
              </div>
              <button
                onClick={() => logSuggestion(activePlan.id, s)}
                disabled={remaining.carbsG === 0 && remaining.proteinG === 0}
                className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 text-black text-[11px] font-bold hover:from-amber-400 hover:to-orange-400 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                title="Ins Ernährungstagebuch buchen"
              >
                <Check size={13} />
                <span>Gegessen</span>
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
