"use client";

import { useMemo } from "react";
import { CalendarPlus, Copy, Edit2, X } from "lucide-react";
import { cn, formatClockDuration, formatDuration } from "@/lib/utils";
import type { LibraryStep, LibraryStepPhase, LibraryWorkout } from "../types";
import { DISCIPLINE_META, FOCUS_META, PHASE_META, STATUS_META } from "./libraryTheme";
import IntervalSparkline from "./IntervalSparkline";
import ComplianceChart from "./ComplianceChart";

interface WorkoutDetailModalProps {
  workout: LibraryWorkout;
  ftpWatts: number;
  onClose: () => void;
  onAddToCalendar: () => void;
  onSendToGarmin: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}

export default function WorkoutDetailModal({
  workout,
  ftpWatts,
  onClose,
  onAddToCalendar,
  onSendToGarmin,
  onDuplicate,
  onEdit,
}: WorkoutDetailModalProps) {
  const meta = DISCIPLINE_META[workout.discipline];
  const status = STATUS_META[workout.status];
  const Icon = meta.Icon;
  const groupedSteps = useMemo(() => groupByPhase(workout.steps), [workout.steps]);
  const isTemplate = workout.origin === "template-gym" || workout.origin === "template-endurance";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-zinc-800/80 space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", meta.bgLight)}>
                <Icon size={20} className={meta.text} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-zinc-100 truncate">{workout.title}</h3>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-bold", meta.badge)}>
                    {meta.label}
                  </span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-bold", status.badge)}>
                    {status.label}
                  </span>
                  {workout.sourceLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold">
                      {workout.sourceLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              aria-label="Schließen"
            >
              <X size={18} />
            </button>
          </div>

          <IntervalSparkline segments={workout.sparkline} heightClass="h-14" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Dauer" value={formatDuration(workout.durationSeconds)} />
            <Stat label="Load" value={`${workout.estimatedTss} TSS`} accent="text-orange-300" />
            <Stat label="Intensität" value={intensityText(workout)} accent="text-cyan-300" />
            <Stat
              label={workout.primaryMuscles.length > 0 ? "Muskeln" : "Fokus"}
              value={
                workout.primaryMuscles.length > 0
                  ? workout.primaryMuscles.slice(0, 2).join(", ")
                  : workout.focusTags.length > 0
                    ? FOCUS_META[workout.focusTags[0]].label
                    : "—"
              }
              small
            />
          </div>

          {workout.description && (
            <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-950/60 border border-zinc-800/70 rounded-2xl p-3">
              {workout.description}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          <section className="space-y-3">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
              Intervall-Breakdown
            </h4>
            {workout.steps.length === 0 && (
              <p className="text-xs text-zinc-500 bg-zinc-950/60 border border-dashed border-zinc-800 rounded-2xl p-4 text-center">
                Keine strukturierten Schritte vorhanden.
              </p>
            )}
            {(Object.keys(groupedSteps) as Array<keyof typeof groupedSteps>).map((phase) => {
              if (groupedSteps[phase].length === 0) return null;
              return (
                <div key={phase} className="space-y-1.5">
                  <div className="flex items-center gap-2 sticky top-0 bg-zinc-900 py-1 z-[1]">
                    <span className={cn("w-2 h-2 rounded-full", PHASE_META[phase].dot)} />
                    <span className={cn("text-[10px] font-extrabold uppercase tracking-wider", PHASE_META[phase].chip)}>
                      {PHASE_META[phase].label}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-mono">
                      {groupedSteps[phase].length} Schritt{groupedSteps[phase].length !== 1 ? "e" : ""}
                    </span>
                  </div>
                  {groupedSteps[phase].map((step) => (
                    <StepRow key={step.id} step={step} ftpWatts={ftpWatts} />
                  ))}
                </div>
              );
            })}
          </section>

          {workout.compliance && (
            <section className="pt-4 border-t border-zinc-800/80">
              <ComplianceChart data={workout.compliance} />
            </section>
          )}
        </div>

        <div className="p-4 sm:px-6 sm:py-4 border-t border-zinc-800/80 flex flex-wrap items-center gap-2 shrink-0 bg-zinc-950/40">
          <button
            onClick={onAddToCalendar}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md shadow-cyan-500/20"
          >
            <CalendarPlus size={14} /> Zum Kalender hinzufügen
          </button>
          <button
            onClick={onSendToGarmin}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition-all active:scale-95 cursor-pointer border border-zinc-700"
          >
            Auf Garmin übertragen
          </button>
          {isTemplate && onDuplicate && (
            <button
              onClick={onDuplicate}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="Duplizieren"
            >
              <Copy size={13} /> Duplizieren
            </button>
          )}
          {isTemplate && onEdit && (
            <button
              onClick={onEdit}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="Bearbeiten"
            >
              <Edit2 size={13} /> Bearbeiten
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function intensityText(workout: LibraryWorkout): string {
  if (workout.ftpPct) {
    const low = Math.round(workout.ftpPct.low * 100);
    const high = Math.round(workout.ftpPct.high * 100);
    return low === high ? `${low}% FTP` : `${low}–${high}% FTP`;
  }
  if (typeof workout.rpeTarget === "number") return `RPE ${workout.rpeTarget}`;
  return "—";
}

function Stat({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/70 space-y-0.5">
      <span className="block text-[9px] font-extrabold uppercase tracking-wider text-zinc-500">{label}</span>
      <span
        className={cn(
          "font-mono font-bold text-zinc-100 block truncate",
          small ? "text-[11px]" : "text-sm",
          accent
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StepRow({ step, ftpWatts }: { step: LibraryStep; ftpWatts: number }) {
  const phase = PHASE_META[step.phase];
  const watts =
    step.watts ??
    (step.ftpPct && ftpWatts > 0
      ? { min: Math.round(ftpWatts * step.ftpPct.low), max: Math.round(ftpWatts * step.ftpPct.high) }
      : undefined);
  const chips: string[] = [];
  if (watts) chips.push(`${watts.min}–${watts.max} W`);
  if (step.cadence) chips.push(`${step.cadence.min}–${step.cadence.max} rpm`);
  if (step.bpm) chips.push(`${step.bpm.min}–${step.bpm.max} bpm`);
  if (step.sets) chips.push(step.reps ? `${step.sets}×${step.reps}` : `${step.sets} Sätze`);
  if (step.distanceMeters) chips.push(`${(step.distanceMeters / 1000).toFixed(step.distanceMeters >= 1000 ? 1 : 2)} km`);

  return (
    <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/60 flex items-start gap-3 hover:border-zinc-700 transition-colors">
      <span className={cn("mt-1.5 w-1.5 h-8 rounded-full shrink-0", phase.bar)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-200 truncate">{step.label}</span>
          {step.durationSeconds ? (
            <span className="text-[11px] font-mono text-zinc-400 shrink-0">
              {formatClockDuration(step.durationSeconds)}
            </span>
          ) : null}
        </div>
        {(chips.length > 0 || step.notes) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {chips.map((chip) => (
              <span key={chip} className="text-[10px] font-mono font-bold text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/20 rounded-md px-1.5 py-0.5">
                {chip}
              </span>
            ))}
            {step.notes && <span className="text-[10px] text-zinc-500 leading-snug">{step.notes}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function groupByPhase(steps: LibraryStep[]): Record<LibraryStepPhase, LibraryStep[]> {
  const grouped: Record<LibraryStepPhase, LibraryStep[]> = {
    warmup: [],
    work: [],
    rest: [],
    cooldown: [],
  };
  for (const step of steps) {
    grouped[step.phase].push(step);
  }
  return grouped;
}
