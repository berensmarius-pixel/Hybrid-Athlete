"use client";

import {
  CalendarPlus,
  Clock,
  Copy,
  Edit2,
  Eye,
  Flame,
  Gauge,
  Watch,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { LibraryWorkout } from "../types";
import { DISCIPLINE_META, FOCUS_META, STATUS_META } from "./libraryTheme";
import IntervalSparkline from "./IntervalSparkline";

interface WorkoutCardProps {
  workout: LibraryWorkout;
  layout: "grid" | "list";
  onOpenDetails: () => void;
  onAddToCalendar: () => void;
  onSendToGarmin: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}

function intensityLabel(workout: LibraryWorkout): string | null {
  if (workout.ftpPct) {
    const low = Math.round(workout.ftpPct.low * 100);
    const high = Math.round(workout.ftpPct.high * 100);
    return low === high ? `${low}% FTP` : `${low}–${high}% FTP`;
  }
  if (typeof workout.rpeTarget === "number") return `RPE ${workout.rpeTarget}`;
  return null;
}

export default function WorkoutCard({
  workout,
  layout,
  onOpenDetails,
  onAddToCalendar,
  onSendToGarmin,
  onDuplicate,
  onEdit,
}: WorkoutCardProps) {
  const meta = DISCIPLINE_META[workout.discipline];
  const status = STATUS_META[workout.status];
  const Icon = meta.Icon;
  const intensity = intensityLabel(workout);
  const dateLabel =
    workout.date && workout.status !== "planned"
      ? new Date(workout.date).toLocaleDateString("de-DE", {
          weekday: "short",
          day: "numeric",
          month: "short",
        })
      : null;

  if (layout === "list") {
    return (
      <div
        className={cn(
          "group bg-zinc-900/80 border-l-4 rounded-r-2xl rounded-l-sm border-y border-r border-zinc-800/80 p-3 flex items-center gap-3 hover:bg-zinc-900 transition-all cursor-pointer",
          meta.bar
        )}
        onClick={onOpenDetails}
      >
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", meta.bgLight)}>
          <Icon size={16} className={meta.text} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-zinc-100 truncate group-hover:text-cyan-300 transition-colors">
              {workout.title}
            </h3>
            <span className={cn("hidden sm:inline-flex text-[9px] px-1.5 py-0.5 rounded-full border font-bold", status.badge)}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-[10px] text-zinc-500 mt-0.5 font-mono">
            <span className="flex items-center gap-1">
              <Clock size={10} /> {formatDuration(workout.durationSeconds)}
            </span>
            <span className="flex items-center gap-1">
              <Flame size={10} /> {workout.estimatedTss} TSS
            </span>
            {intensity && (
              <span className="flex items-center gap-1">
                <Gauge size={10} /> {intensity}
              </span>
            )}
            {dateLabel && <span className="hidden md:inline">{dateLabel}</span>}
          </div>
        </div>
        <div className="hidden lg:block w-40 shrink-0" onClick={(e) => e.stopPropagation()}>
          <IntervalSparkline segments={workout.sparkline} heightClass="h-8" />
        </div>
        <CardActions
          workout={workout}
          compact
          onOpenDetails={onOpenDetails}
          onAddToCalendar={onAddToCalendar}
          onSendToGarmin={onSendToGarmin}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative bg-zinc-900/90 border border-zinc-800/90 border-l-4 rounded-2xl rounded-bl-sm p-4 sm:p-5 space-y-3.5 transition-all duration-200 cursor-pointer shadow-md overflow-hidden",
        meta.border
      )}
      onClick={onOpenDetails}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0", meta.bgLight)}>
            <Icon size={18} className={meta.text} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-zinc-100 text-sm truncate group-hover:text-cyan-300 transition-colors">
              {workout.title}
            </h3>
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
              {dateLabel && <span className="text-[9px] text-zinc-500 font-mono">{dateLabel}</span>}
            </div>
          </div>
        </div>
      </div>

      <IntervalSparkline segments={workout.sparkline} />

      <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-[11px] font-mono text-zinc-300">
        <StatChip icon={<Clock size={12} className="text-zinc-500" />} value={formatDuration(workout.durationSeconds)} />
        <StatChip icon={<Flame size={12} className="text-orange-400" />} value={`${workout.estimatedTss} TSS`} />
        {intensity && (
          <StatChip icon={<Gauge size={12} className="text-cyan-400" />} value={intensity} />
        )}
        {!intensity && workout.primaryMuscles.length > 0 && (
          <span className="text-zinc-400 truncate max-w-full">{workout.primaryMuscles.slice(0, 2).join(" · ")}</span>
        )}
      </div>

      {workout.focusTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workout.focusTags.map((tag) => (
            <span
              key={tag}
              className={cn("text-[9px] px-1.5 py-0.5 rounded-md border font-bold uppercase tracking-wide", FOCUS_META[tag].badge)}
            >
              {FOCUS_META[tag].label}
            </span>
          ))}
        </div>
      )}

      <CardActions
        workout={workout}
        onOpenDetails={onOpenDetails}
        onAddToCalendar={onAddToCalendar}
        onSendToGarmin={onSendToGarmin}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
      />
    </div>
  );
}

function StatChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {icon}
      {value}
    </span>
  );
}

function CardActions({
  workout,
  compact,
  onOpenDetails,
  onAddToCalendar,
  onSendToGarmin,
  onDuplicate,
  onEdit,
}: {
  workout: LibraryWorkout;
  compact?: boolean;
  onOpenDetails: () => void;
  onAddToCalendar: () => void;
  onSendToGarmin: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const isTemplate =
    workout.origin === "template-gym" || workout.origin === "template-endurance";

  return (
    <div className={cn("flex items-center gap-1.5", !compact && "pt-1")} onClick={stop}>
      <ActionButton title="Zum Kalender hinzufügen" onClick={onAddToCalendar}>
        <CalendarPlus size={13} />
      </ActionButton>
      <ActionButton title="Auf Garmin übertragen" onClick={onSendToGarmin}>
        <Watch size={13} />
      </ActionButton>
      {isTemplate && onDuplicate && (
        <ActionButton title="Duplizieren" onClick={onDuplicate}>
          <Copy size={13} />
        </ActionButton>
      )}
      {isTemplate && onEdit && (
        <ActionButton title="Bearbeiten" onClick={onEdit}>
          <Edit2 size={13} />
        </ActionButton>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetails();
        }}
        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/80 hover:bg-cyan-500/20 hover:border-cyan-500/40 border border-transparent text-[11px] font-bold text-zinc-300 hover:text-cyan-200 transition-all cursor-pointer active:scale-95"
      >
        <Eye size={13} />
        {!compact && <span>Details öffnen</span>}
      </button>
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-cyan-300 transition-all cursor-pointer active:scale-95"
    >
      {children}
    </button>
  );
}
