"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Check,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { cn, formatClockDuration } from "@/lib/utils";
import type { PrehabCategory, PrehabProtocol, PrehabStep } from "../types";

interface PrehabTimerViewProps {
  protocol: PrehabProtocol;
  isOpen: boolean;
  onClose: () => void;
  onStartWorkout?: () => void;
}

const CATEGORY_STYLE: Record<
  PrehabCategory,
  { label: string; badge: string; ring: string }
> = {
  raise: {
    label: "Puls hoch",
    badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
    ring: "#fb923c",
  },
  mobility: {
    label: "Mobilität",
    badge: "bg-pink-500/15 text-pink-300 border border-pink-500/30",
    ring: "#ec4899",
  },
  activation: {
    label: "Aktivierung",
    badge: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
    ring: "#22d3ee",
  },
};

const RING_RADIUS = 86;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatChip(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return formatClockDuration(seconds);
}

export default function PrehabTimerView({
  protocol,
  isOpen,
  onClose,
  onStartWorkout,
}: PrehabTimerViewProps) {
  const steps = protocol.steps;

  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(steps[0]?.durationSeconds ?? 0);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);

  const stepIndexRef = useRef(stepIndex);
  const secondsLeftRef = useRef(secondsLeft);
  const stepsRef = useRef<PrehabStep[]>(steps);
  stepsRef.current = steps;

  useEffect(() => {
    if (!isOpen) return;
    const first = stepsRef.current[0]?.durationSeconds ?? 0;
    stepIndexRef.current = 0;
    secondsLeftRef.current = first;
    setStepIndex(0);
    setSecondsLeft(first);
    setRunning(true);
    setFinished(false);
  }, [isOpen, protocol]);

  const goToStep = (index: number) => {
    const clamped = Math.max(0, Math.min(index, stepsRef.current.length - 1));
    stepIndexRef.current = clamped;
    secondsLeftRef.current = stepsRef.current[clamped].durationSeconds;
    setStepIndex(clamped);
    setSecondsLeft(secondsLeftRef.current);
  };

  const tick = () => {
    const next = secondsLeftRef.current - 1;
    secondsLeftRef.current = next;
    setSecondsLeft(next);
    if (next <= 0) {
      const current = stepIndexRef.current;
      if (current < stepsRef.current.length - 1) {
        goToStep(current + 1);
      } else {
        setFinished(true);
        setRunning(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen || !running || finished) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, running, finished]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const doneBeforeSeconds = useMemo(
    () =>
      steps
        .slice(0, finished ? steps.length : stepIndex)
        .reduce((sum, s) => sum + s.durationSeconds, 0),
    [steps, stepIndex, finished]
  );

  if (!isOpen || steps.length === 0) return null;

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const categoryStyle = CATEGORY_STYLE[currentStep.category];
  const ringFraction = finished
    ? 1
    : secondsLeft / Math.max(1, currentStep.durationSeconds);
  const totalElapsed = finished
    ? protocol.totalSeconds
    : doneBeforeSeconds + (currentStep.durationSeconds - secondsLeft);
  const overallPct = Math.min(
    100,
    Math.round((totalElapsed / Math.max(1, protocol.totalSeconds)) * 100)
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md sm:max-w-lg max-h-[94vh] overflow-y-auto rounded-3xl glass-panel border border-white/10 bg-zinc-950/90 shadow-2xl shadow-black/60"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-transparent" />

        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono mb-0.5">
                Pre-Workout Guide · {overallPct}%
              </p>
              <h2 className="text-base sm:text-lg font-black text-zinc-100 leading-tight tracking-tight">
                {protocol.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Overall progress */}
          <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden mb-5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>

          {finished ? (
            /* ── Completion ── */
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center py-6"
            >
              <CheckCircle2 size={72} className="text-emerald-400 mb-4" strokeWidth={1.6} />
              <h3 className="text-2xl font-black text-zinc-100 mb-1">Warmup abgeschlossen!</h3>
              <p className="text-sm text-zinc-400 mb-1">
                {steps.length} Drills · {formatClockDuration(protocol.totalSeconds)} vorbereitet
              </p>
              <p className="text-xs text-zinc-500 mb-6 max-w-[280px] leading-relaxed">
                Körper ist auf Temperatur – jetzt sauber in das Training einsteigen und die erste Übung bewusst langsam aufbauen.
              </p>
              <div className="flex items-center gap-2.5 w-full max-w-xs">
                <button
                  onClick={() => {
                    onClose();
                    onStartWorkout?.();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Sparkles size={16} />
                  Zum Training
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-2xl text-sm font-bold bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 border border-white/10 transition-colors cursor-pointer"
                >
                  Schließen
                </button>
              </div>
            </motion.div>
          ) : (
            <>
              {/* ── Ring + active drill ── */}
              <div className="flex flex-col items-center">
                <div className="relative w-[210px] h-[210px] mb-4">
                  <svg viewBox="0 0 210 210" className="w-full h-full -rotate-90">
                    <circle
                      cx="105"
                      cy="105"
                      r={RING_RADIUS}
                      fill="none"
                      stroke="rgba(255,255,255,0.07)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="105"
                      cy="105"
                      r={RING_RADIUS}
                      fill="none"
                      stroke={categoryStyle.ring}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - ringFraction)}
                      className="transition-all duration-1000 ease-linear"
                      style={{ filter: `drop-shadow(0 0 8px ${categoryStyle.ring}66)` }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-mono mb-1">
                      Drill {stepIndex + 1}/{steps.length}
                    </span>
                    <span
                      className={cn(
                        "text-4xl sm:text-5xl font-black font-mono tabular-nums tracking-tight",
                        secondsLeft <= 5 ? "text-rose-400" : "text-zinc-100"
                      )}
                    >
                      {formatClockDuration(secondsLeft)}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide",
                        categoryStyle.badge
                      )}
                    >
                      {categoryStyle.label}
                    </span>
                  </div>
                </div>

                <motion.div
                  key={currentStep.id + stepIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-center space-y-2 min-h-[150px]"
                >
                  <div className="text-5xl" aria-hidden>
                    {currentStep.icon}
                  </div>
                  <h3 className="text-xl font-black text-zinc-100 leading-tight">
                    {currentStep.name}
                  </h3>
                  <p className={cn("text-xs font-bold font-mono", {
                    "text-orange-300": currentStep.category === "raise",
                    "text-pink-300": currentStep.category === "mobility",
                    "text-cyan-300": currentStep.category === "activation",
                  })}>
                    ▸ {currentStep.cue}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-[340px] mx-auto">
                    {currentStep.description}
                  </p>
                  {currentStep.isSorenessBoost && currentStep.reason && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      ⚡ {currentStep.reason}
                    </span>
                  )}
                </motion.div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4 mt-5">
                  <button
                    onClick={() => goToStep(stepIndex - 1)}
                    disabled={stepIndex === 0}
                    className="w-11 h-11 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Zurück"
                  >
                    <SkipBack size={17} />
                  </button>
                  <button
                    onClick={() => setRunning((r) => !r)}
                    className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-black flex items-center justify-center shadow-lg shadow-orange-500/30 transition-transform active:scale-95 cursor-pointer"
                    title={running ? "Pause" : "Weiter"}
                  >
                    {running ? (
                      <Pause size={26} className="fill-current" />
                    ) : (
                      <Play size={26} className="fill-current ml-1" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (stepIndex < steps.length - 1) goToStep(stepIndex + 1);
                      else {
                        setFinished(true);
                        setRunning(false);
                      }
                    }}
                    className="w-11 h-11 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-300 transition-all cursor-pointer"
                    title="Überspringen"
                  >
                    <SkipForward size={17} />
                  </button>
                  <button
                    onClick={() => {
                      goToStep(0);
                      setRunning(true);
                      setFinished(false);
                    }}
                    className="w-11 h-11 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-400 transition-all cursor-pointer"
                    title="Neu starten"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {/* Step list */}
              <div className="mt-6 pt-4 border-t border-white/[0.07]">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider font-mono mb-2">
                  Ablauf ({steps.length} Drills · ≈{Math.round(protocol.totalSeconds / 60)} Min)
                </p>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {steps.map((step, i) => (
                    <button
                      key={`${step.id}-${i}`}
                      onClick={() => goToStep(i)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer",
                        i === stepIndex
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "border border-transparent hover:bg-white/[0.04]",
                        i < stepIndex && "opacity-45"
                      )}
                    >
                      <span className="w-5 shrink-0 flex items-center justify-center">
                        {i < stepIndex ? (
                          <Check size={13} className="text-emerald-400" strokeWidth={3} />
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-500">{i + 1}</span>
                        )}
                      </span>
                      <span aria-hidden>{step.icon}</span>
                      <span
                        className={cn(
                          "flex-1 truncate text-xs font-semibold",
                          i === stepIndex ? "text-amber-200" : "text-zinc-300"
                        )}
                      >
                        {step.name}
                        {step.isSorenessBoost && (
                          <span className="ml-1.5 text-amber-400">⚡</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] font-mono text-zinc-500">
                        {formatChip(step.durationSeconds)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
