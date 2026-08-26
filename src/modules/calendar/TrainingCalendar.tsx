"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlarmClock,
  AlertTriangle,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Dumbbell,
  Flame,
  GripVertical,
  ListChecks,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  WORKOUT_COLORS,
  WORKOUT_TYPE_LABELS,
  cn,
  getLocalDateString,
} from "@/lib/utils";
import type {
  DayPlan,
  GarminActivity,
  GymSession,
  LoggedSession,
  WorkoutType,
} from "@/types";
import {
  addMinutesToTime,
  zonedDateString,
  zonedTimeString,
  zonedToUtcMs,
} from "@/lib/calendar/gcal/timezone";
import type { BusyInterval, ScheduledGoogleWorkout } from "@/lib/calendar/gcal/types";
import {
  getStoredCalendarEvents,
  type CalendarEvent,
} from "@/lib/calendar/googleCalendarService";

type ViewMode = "month" | "week" | "day";

interface CalWorkout {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  title: string;
  description?: string;
  workoutType: WorkoutType;
  templateId?: string;
  sourceDayIndex: number;
  isRest: boolean;
}

interface CompletionInfo {
  tss: number;
  minutes: number;
}

interface CompletionIndex {
  byWorkoutId: Map<string, CompletionInfo>;
  consumedGarminIds: Set<string>;
}

interface ConflictInfo {
  id: string;
  severity: "red" | "amber";
  date: string;
  gapMin: number;
  reason: string;
}

interface BusyBlock {
  start: string;
  end: string;
  title: string;
  source: "google" | "local";
}

interface ScheduleOverride {
  date: string;
  startTime: string;
}

const OVERRIDES_KEY = "hybrid-athlete-calendar-overrides";

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const DAY_WINDOW_START_MIN = 6 * 60;
const DAY_WINDOW_END_MIN = 23 * 60;
const PX_PER_MIN = 64 / 60;
const SNAP_MIN = 15;
const WEEK_COL_HEADER_PX = 26;

const AGENDA_START_MIN = 5 * 60;
const AGENDA_END_MIN = 23 * 60;
const AGENDA_ROW_PX = 44;

const TYPE_DURATION_MIN: Record<WorkoutType, number> = {
  gym: 90,
  cycling: 90,
  running: 60,
  swimming: 60,
  stretching: 30,
  warmup: 20,
  mobility: 20,
  rest: 0,
};

const TSS_PER_MIN: Record<WorkoutType, number> = {
  gym: 0.65,
  cycling: 0.8,
  running: 0.95,
  swimming: 0.75,
  stretching: 0.25,
  warmup: 0.25,
  mobility: 0.25,
  rest: 0,
};

const DEFAULT_STARTS: Record<WorkoutType, string> = {
  gym: "17:30",
  cycling: "17:00",
  running: "17:30",
  swimming: "16:00",
  stretching: "19:30",
  warmup: "07:00",
  mobility: "19:30",
  rest: "09:00",
};

const LEG_RE = /(unterk|beine|lower|\bleg|kniebeug|kreuzheben|deadlift|squat|hip thrust|waden)/i;
const UPPER_RE = /(oberk|rücken|bank|bench|push|pull|schulter|brust|bizeps|trizeps|rudern|klimm)/i;
const HIGH_INTENSITY_RE = /(vo2|intervall|schwellen|threshold|sprint|4\s*x\s*4|hiit|tempo|anaerob)/i;
const RECOVERY_RE = /(recovery|regener|zone\s*2|grundlage|locker)/i;

function strToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToStr(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapToStep(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  return getLocalDateString(d);
}

function isoAddDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

function mondayOf(d: Date): string {
  const diff = (d.getDay() + 6) % 7;
  return dateToIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff));
}

function formatDayLong(iso: string): string {
  return isoToDate(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDayShort(iso: string): string {
  return isoToDate(iso).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function defaultStartTime(type: WorkoutType, dayIndex: number): string {
  if (dayIndex >= 5 && type === "cycling") return "09:30";
  if (dayIndex >= 5 && type === "running") return "09:00";
  return DEFAULT_STARTS[type];
}

function buildWeekWorkouts(
  weekStart: string,
  plan: DayPlan[],
  overrides: Record<string, ScheduleOverride>
): CalWorkout[] {
  return plan.map((p) => {
    const id = `${weekStart}#${p.dayIndex}`;
    const ov = overrides[id];
    const isRest = p.workoutType === "rest";
    const durationMin = isRest ? 0 : TYPE_DURATION_MIN[p.workoutType];
    const startTime = ov?.startTime ?? defaultStartTime(p.workoutType, p.dayIndex);
    const date = ov?.date ?? isoAddDays(weekStart, p.dayIndex);
    return {
      id,
      date,
      startTime,
      endTime: isRest ? startTime : addMinutesToTime(startTime, durationMin),
      durationMin,
      title: p.title,
      description: p.description,
      workoutType: p.workoutType,
      templateId: p.templateId,
      sourceDayIndex: p.dayIndex,
      isRest,
    };
  });
}

function plannedTss(w: CalWorkout): number {
  if (w.isRest) return 0;
  return Math.round(w.durationMin * TSS_PER_MIN[w.workoutType]);
}

function estimateTss(minutes: number, type: "cycling" | "running" | "swimming"): number {
  return Math.round(minutes * TSS_PER_MIN[type]);
}

function parseDurationToMinutes(raw: string): number {
  const parts = raw.split(":").map((v) => Number(v.trim()));
  if (parts.some((v) => !Number.isFinite(v))) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

type SessionCategory = "gym" | "bike" | "run";

function sessionCategory(s: LoggedSession): SessionCategory | null {
  if (s.kind === "endurance") return s.activityType === "cycling" ? "bike" : "run";
  if (s.kind === "gym") return "gym";
  return null;
}

function garminCategory(a: GarminActivity): SessionCategory | null {
  if (a.type === "cycling") return "bike";
  if (a.type === "running") return "run";
  if (a.type === "gym") return "gym";
  return null;
}

function gymTonnageKg(s: GymSession): number {
  let tonnage = 0;
  for (const ex of s.entries) {
    for (const set of ex.sets) {
      if (set.isCompleted === false) continue;
      const weight = typeof set.weight === "number" ? set.weight : Number(set.weight) || 0;
      const reps = typeof set.reps === "number" ? set.reps : Number(set.reps) || 0;
      tonnage += weight * reps;
    }
  }
  return tonnage;
}

function workoutDemand(w: CalWorkout): "high" | "moderate" | "low" {
  if (w.isRest) return "low";
  if (
    w.workoutType === "stretching" ||
    w.workoutType === "mobility" ||
    w.workoutType === "warmup"
  ) {
    return "low";
  }
  if (HIGH_INTENSITY_RE.test(w.title)) return "high";
  if (w.workoutType === "gym" && LEG_RE.test(w.title)) return "high";
  if (RECOVERY_RE.test(w.title)) return "low";
  return "moderate";
}

function workoutSystem(w: CalWorkout): "legs" | "upper" | "cardio" | "full" {
  if (LEG_RE.test(w.title)) return "legs";
  if (w.workoutType === "gym" && UPPER_RE.test(w.title)) return "upper";
  if (w.workoutType === "cycling" || w.workoutType === "running") return "cardio";
  return "full";
}

function gapLabel(gapMin: number): string {
  if (gapMin < 60) return `${gapMin} min`;
  const h = Math.floor(gapMin / 60);
  const m = gapMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function detectInterferenceConflicts(workouts: CalWorkout[]): ConflictInfo[] {
  const active = workouts
    .filter((w) => !w.isRest)
    .map((w) => ({
      w,
      startMs: zonedToUtcMs(w.date, w.startTime),
      endMs: zonedToUtcMs(w.date, w.endTime),
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const conflicts: ConflictInfo[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const gapMin = Math.round((b.startMs - a.endMs) / 60_000);
      if (gapMin >= 360) break;

      const demandA = workoutDemand(a.w);
      const demandB = workoutDemand(b.w);
      const sysA = workoutSystem(a.w);
      const sysB = workoutSystem(b.w);

      let severity: "red" | "amber" | null = null;
      let reason = "";

      const legCardioClash =
        demandA === "high" &&
        demandB === "high" &&
        ((sysA === "legs" && sysB === "cardio") || (sysA === "cardio" && sysB === "legs"));

      if (legCardioClash) {
        severity = "red";
        reason = `Interferenz: Beinschwerpunkt trifft auf hochintensives Cardio – nur ${gapLabel(Math.max(gapMin, 0))} Abstand (<6 h). Lokale Beinermüdung gefährdet die Intensitätseinheit.`;
      } else if (demandA === "high" && demandB === "high") {
        severity = "amber";
        reason = `Zwei fordernde Sessions nur ${gapLabel(Math.max(gapMin, 0))} auseinander – Erholungsfenster unter 6 h.`;
      } else if (gapMin < 0) {
        severity = "amber";
        reason = `„${a.w.title}“ und „${b.w.title}“ überlappen zeitlich.`;
      } else if (demandA !== "low" && demandB !== "low" && gapMin < 180) {
        severity = "amber";
        reason = `Nur ${gapLabel(gapMin)} zwischen „${a.w.title}“ und „${b.w.title}“ – Puffer für Regeneration & Fuelling einplanen.`;
      }

      if (severity) {
        conflicts.push({
          id: `${a.w.id}__${b.w.id}`,
          severity,
          date: b.w.date,
          gapMin,
          reason,
        });
      }
    }
  }

  return conflicts;
}

function busyBlocksForDate(
  googleBusy: BusyInterval[],
  localEvents: CalendarEvent[],
  date: string
): BusyBlock[] {
  const dayStartMs = zonedToUtcMs(date, "00:00");
  const dayEndMs = zonedToUtcMs(isoAddDays(date, 1), "00:00");
  const blocks: BusyBlock[] = [];

  for (const b of googleBusy) {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    const cs = Math.max(s, dayStartMs);
    const ce = Math.min(e, dayEndMs);
    if (ce > cs) {
      blocks.push({
        start: zonedTimeString(cs),
        end: zonedTimeString(ce),
        title: "Belegt (Google)",
        source: "google",
      });
    }
  }

  for (const ev of localEvents) {
    if (ev.date !== date) continue;
    blocks.push({
      start: ev.startTime,
      end: ev.endTime,
      title: ev.title,
      source: ev.source === "google" ? "google" : "local",
    });
  }

  return blocks.sort((x, y) => strToMin(x.start) - strToMin(y.start));
}

function overlapsGoogleBusy(w: CalWorkout, blocks: BusyBlock[]): boolean {
  if (w.isRest) return false;
  const s = strToMin(w.startTime);
  const e = strToMin(w.endTime);
  return blocks.some((b) => {
    if (b.source !== "google") return false;
    return s < strToMin(b.end) && e > strToMin(b.start);
  });
}

interface FuelAlarm {
  time: string;
  label: string;
}

function fuelingAlarms(w: CalWorkout): FuelAlarm[] {
  if (w.isRest || (w.workoutType !== "cycling" && w.workoutType !== "running")) return [];
  if (w.durationMin < 75) return [];
  const startMin = strToMin(w.startTime);
  const alarms: FuelAlarm[] = [
    {
      time: minToStr(startMin - 60),
      label: `Pre-Fuel: 60–90 g Kohlenhydrate + 500 ml Flüssigkeit (${WORKOUT_TYPE_LABELS[w.workoutType]} in 1 h)`,
    },
  ];
  for (let m = 45; m < w.durationMin; m += 45) {
    alarms.push({
      time: minToStr(startMin + m),
      label: `Intra-Fuel: 30–60 g KH/h (${Math.floor(m / 60)} h ${m % 60} min unterwegs)`,
    });
  }
  if (w.durationMin >= 90) {
    alarms.push({
      time: addMinutesToTime(w.endTime, 20),
      label: "Recovery-Fenster: ~40 g Protein + Elektrolyte",
    });
  }
  return alarms;
}

function needsWarmupBlock(w: CalWorkout): boolean {
  return !w.isRest && workoutDemand(w) !== "low";
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function fmtHours(minutes: number): string {
  return `${fmtNum(minutes / 60, 1)} h`;
}

function validateOverrides(raw: unknown): Record<string, ScheduleOverride> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, ScheduleOverride> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = v as Partial<ScheduleOverride>;
    if (
      typeof o?.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(o.date) &&
      typeof o?.startTime === "string" &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(o.startTime)
    ) {
      out[k] = { date: o.date, startTime: o.startTime };
    }
  }
  return out;
}

function SyncBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border",
        connected
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
          : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-zinc-500")} />
      <CloudUpload size={12} />
      <span>{connected ? "Google Sync aktiv" : "Nur lokal"}</span>
    </span>
  );
}

function ViewSwitcher({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const options: { key: ViewMode; label: string }[] = [
    { key: "month", label: "Monat" },
    { key: "week", label: "Woche" },
    { key: "day", label: "Tag" },
  ];
  return (
    <div className="inline-flex rounded-xl bg-zinc-900 border border-zinc-800 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
            mode === o.key
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          <CalendarDays size={13} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RollupCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <span className="text-lg font-extrabold text-zinc-100 leading-tight">{value}</span>
      <span className="text-[10px] text-zinc-500">{sub}</span>
    </div>
  );
}

function ConflictBadge({ severity }: { severity: "red" | "amber" }) {
  return (
    <span
      role="img"
      aria-label={severity === "red" ? "Konflikt: Hybrid-Interferenz" : "Warnung: knapper Übergang"}
      title={severity === "red" ? "Hybrid-Interferenz (<6 h)" : "Knapper Übergang"}
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 font-black text-[9px]",
        severity === "red" ? "bg-rose-500 text-white animate-pulse" : "bg-amber-400 text-zinc-950"
      )}
    >
      !
    </span>
  );
}

function DraggableChipMonth({ workout }: { workout: CalWorkout }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workout.id,
    data: { durationMin: workout.durationMin },
  });
  const colors = WORKOUT_COLORS[workout.workoutType];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex items-center gap-1 rounded-lg px-1.5 py-1 border cursor-grab active:cursor-grabbing",
        colors.bgLight,
        colors.border.replace("border-", "border-l-"),
        isDragging && "opacity-30"
      )}
    >
      <GripVertical size={10} className={cn("shrink-0 opacity-50", colors.text)} />
      <span className={cn("truncate font-bold text-[9px]", colors.text)}>{workout.title}</span>
    </div>
  );
}

function MonthCell({
  iso,
  workouts,
  tss,
  minutes,
  conflict,
  isToday,
  isSelected,
  dimmed,
  onOpen,
}: {
  iso: string;
  workouts: CalWorkout[];
  tss: number;
  minutes: number;
  conflict?: "red" | "amber";
  isToday: boolean;
  isSelected: boolean;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${iso}` });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      className={cn(
        "flex flex-col gap-1 p-1.5 rounded-xl border text-left min-h-[104px] transition-all",
        isToday
          ? "border-blue-500/70 bg-blue-600/10"
          : isSelected
            ? "border-zinc-500/60 bg-zinc-800/40"
            : "border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700",
        isOver && "ring-2 ring-blue-400/60 bg-blue-500/10",
        dimmed && "opacity-40"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-bold", isToday ? "text-blue-300" : "text-zinc-300")}>
          {isoToDate(iso).getDate()}
        </span>
        {conflict && <ConflictBadge severity={conflict} />}
      </div>

      <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
        {workouts.slice(0, 3).map((w) => (
          <DraggableChipMonth key={w.id} workout={w} />
        ))}
        {workouts.length > 3 && (
          <span className="text-[9px] text-zinc-500 px-1">+{workouts.length - 3}</span>
        )}
      </div>

      {tss > 0 && (
        <span className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
          {tss} TSS · {fmtHours(minutes)}
        </span>
      )}
    </button>
  );
}

function MonthView({
  weekStarts,
  workoutsByDate,
  tssByDate,
  minutesByDate,
  conflictDates,
  todayIso,
  focusIso,
  onOpenDay,
}: {
  weekStarts: string[];
  workoutsByDate: Map<string, CalWorkout[]>;
  tssByDate: Map<string, number>;
  minutesByDate: Map<string, number>;
  conflictDates: Map<string, "red" | "amber">;
  todayIso: string;
  focusIso: string;
  onOpenDay: (iso: string) => void;
}) {
  const focusMonth = isoToDate(focusIso).getMonth();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-extrabold uppercase tracking-wider text-zinc-500"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {weekStarts.flatMap((weekStart) =>
          Array.from({ length: 7 }, (_, i) => {
            const iso = isoAddDays(weekStart, i);
            const workouts = (workoutsByDate.get(iso) ?? []).filter((w) => !w.isRest);
            return (
              <MonthCell
                key={iso}
                iso={iso}
                workouts={workouts}
                tss={tssByDate.get(iso) ?? 0}
                minutes={minutesByDate.get(iso) ?? 0}
                conflict={conflictDates.get(iso)}
                isToday={iso === todayIso}
                isSelected={iso === focusIso}
                dimmed={isoToDate(iso).getMonth() !== focusMonth}
                onOpen={() => onOpenDay(iso)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function BusyBlockView({
  block,
  topPx,
  heightPx,
}: {
  block: BusyBlock;
  topPx: number;
  heightPx: number;
}) {
  return (
    <div
      className="absolute left-8 right-1 rounded-md border border-zinc-600/50 overflow-hidden pointer-events-none"
      style={{
        top: topPx,
        height: Math.max(heightPx, 14),
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(113,113,122,.22) 0 6px, transparent 6px 12px)",
      }}
      title={`${block.title} · ${block.start}–${block.end}`}
    >
      <div className="px-1.5 pt-0.5">
        <span className="text-[9px] font-bold text-zinc-400 truncate block leading-tight">
          {block.title}
        </span>
        <span className="text-[8px] font-mono text-zinc-500 block leading-tight">{block.start}</span>
      </div>
    </div>
  );
}

function RecoveryBand({ topPx, heightPx }: { topPx: number; heightPx: number }) {
  return (
    <div
      className="absolute left-8 right-1 rounded-md border-l-2 border-emerald-500/40 pointer-events-none"
      style={{
        top: topPx,
        height: heightPx,
        backgroundImage:
          "repeating-linear-gradient(-45deg, rgba(16,185,129,.08) 0 8px, transparent 8px 16px)",
      }}
      title="Erholungsfenster nach fordernder Session"
    >
      <span className="absolute top-0.5 left-1.5 text-[8px] font-extrabold uppercase tracking-wide text-emerald-400/70">
        Regeneration
      </span>
    </div>
  );
}

function WeekWorkoutBlock({
  workout,
  busyOverlap,
  conflictSeverity,
  completed,
  syncState,
  onOpen,
}: {
  workout: CalWorkout;
  busyOverlap: boolean;
  conflictSeverity?: "red" | "amber";
  completed: boolean;
  syncState?: "pending" | "synced" | "error";
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workout.id,
    data: { durationMin: workout.durationMin },
  });
  const colors = WORKOUT_COLORS[workout.workoutType];

  const didDragRef = useRef(false);

  useEffect(() => {
    if (isDragging) {
      didDragRef.current = true;
      return;
    }
    if (!didDragRef.current) return;
    const t = setTimeout(() => {
      didDragRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  }, [isDragging]);

  const topMin = Math.max(strToMin(workout.startTime), DAY_WINDOW_START_MIN);
  const topPx = (topMin - DAY_WINDOW_START_MIN) * PX_PER_MIN;
  const heightPx = Math.max(workout.durationMin * PX_PER_MIN, 34);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ top: topPx, height: heightPx, transform: CSS.Translate.toString(transform) }}
      onClick={() => {
        if (!didDragRef.current) onOpen();
      }}
      className={cn(
        "absolute left-1 right-1 rounded-lg border border-l-4 px-1.5 py-1 overflow-hidden cursor-grab active:cursor-grabbing",
        colors.bgLight,
        colors.border,
        isDragging ? "opacity-30 z-0" : "hover:shadow-lg hover:z-10 z-[1]",
        syncState === "error" && "border-rose-500/60"
      )}
    >
      <div className="flex items-center gap-1">
        <span className={cn("font-mono text-[9px]", colors.text)}>
          {workout.startTime}–{workout.endTime}
        </span>
        {completed && <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
        {syncState === "pending" && (
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Sync läuft…" />
        )}
        {syncState === "synced" && (
          <span className="shrink-0 flex" title="Im Google Kalender aktualisiert">
            <CloudUpload size={11} className="text-emerald-400" />
          </span>
        )}
        {syncState === "error" && (
          <span className="shrink-0 flex" title="Google-Sync fehlgeschlagen">
            <AlertTriangle size={11} className="text-rose-400" />
          </span>
        )}
        {busyOverlap && (
          <span className="shrink-0 flex" title="Überschneidung mit Google-Termin">
            <AlertTriangle size={11} className="text-orange-400" />
          </span>
        )}
        {conflictSeverity && <ConflictBadge severity={conflictSeverity} />}
      </div>
      <div className={cn("font-bold text-[11px] leading-tight truncate mt-0.5", colors.text)}>
        {workout.title}
      </div>
      <div className="text-[9px] text-zinc-400 font-mono">
        {workout.durationMin} Min · {plannedTss(workout)} TSS
      </div>
    </div>
  );
}

function WeekColumn({
  date,
  isToday,
  workouts,
  busy,
  completions,
  conflictsByWorkoutId,
  syncStates,
  registerColRef,
  onOpenDay,
}: {
  date: string;
  isToday: boolean;
  workouts: CalWorkout[];
  busy: BusyBlock[];
  completions: Map<string, CompletionInfo>;
  conflictsByWorkoutId: Map<string, "red" | "amber">;
  syncStates: Record<string, "pending" | "synced" | "error">;
  registerColRef: (iso: string, el: HTMLDivElement | null) => void;
  onOpenDay: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${date}` });

  const windowMin = DAY_WINDOW_END_MIN - DAY_WINDOW_START_MIN;
  const totalHeight = windowMin * PX_PER_MIN;
  const hours = Array.from(
    { length: Math.floor(windowMin / 60) + 1 },
    (_, i) => DAY_WINDOW_START_MIN + i * 60
  );

  const demanding = workouts.filter((w) => !w.isRest && workoutDemand(w) !== "low");

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerColRef(date, el);
      }}
      className={cn(
        "relative flex-1 min-w-0 rounded-xl border transition-colors",
        isToday ? "border-blue-500/50 bg-blue-950/10" : "border-zinc-800/60 bg-zinc-950/40",
        isOver && "bg-blue-500/5 ring-1 ring-blue-400/50"
      )}
    >
      <button
        type="button"
        onClick={onOpenDay}
        className={cn(
          "sticky top-0 z-20 w-full py-1.5 text-center text-[11px] font-extrabold border-b backdrop-blur-sm rounded-t-xl cursor-pointer",
          isToday
            ? "text-blue-300 bg-blue-950/70 border-blue-500/30"
            : "text-zinc-400 bg-zinc-950/85 border-zinc-800/60 hover:text-zinc-200"
        )}
      >
        {formatDayShort(date)}
      </button>

      <div className="relative" style={{ height: totalHeight }}>
        {hours.map((m) => (
          <div
            key={m}
            className="absolute left-0 right-0 border-t border-zinc-800/40 pointer-events-none"
            style={{ top: (m - DAY_WINDOW_START_MIN) * PX_PER_MIN }}
          >
            {(m % 120 === 0 || m === DAY_WINDOW_START_MIN) && (
              <span className="absolute -top-1 left-1 text-[8px] font-mono text-zinc-600">
                {minToStr(m)}
              </span>
            )}
          </div>
        ))}

        {busy.map((b) => {
          const s = Math.max(strToMin(b.start), DAY_WINDOW_START_MIN);
          const e = Math.min(strToMin(b.end), DAY_WINDOW_END_MIN);
          if (e <= s) return null;
          return (
            <BusyBlockView
              key={`${b.source}-${b.title}-${b.start}`}
              block={b}
              topPx={(s - DAY_WINDOW_START_MIN) * PX_PER_MIN}
              heightPx={(e - s) * PX_PER_MIN}
            />
          );
        })}

        {demanding.map((w) => (
          <RecoveryBand
            key={`rec-${w.id}`}
            topPx={(strToMin(w.endTime) - DAY_WINDOW_START_MIN) * PX_PER_MIN}
            heightPx={4 * 60 * PX_PER_MIN}
          />
        ))}

        {workouts.map((w) =>
          w.isRest ? (
            <div
              key={w.id}
              className="absolute left-1 right-1 bottom-1 rounded-lg border border-dashed border-zinc-700/60 bg-zinc-900/50 py-1 text-center"
            >
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Ruhetag</span>
            </div>
          ) : (
            <WeekWorkoutBlock
              key={w.id}
              workout={w}
              busyOverlap={overlapsGoogleBusy(w, busy)}
              conflictSeverity={conflictsByWorkoutId.get(w.id)}
              completed={completions.has(w.id)}
              syncState={syncStates[w.id]}
              onOpen={onOpenDay}
            />
          )
        )}
      </div>
    </div>
  );
}

function WeekView(props: {
  focusWeekStart: string;
  workoutsByDate: Map<string, CalWorkout[]>;
  busyByDate: Map<string, BusyBlock[]>;
  completions: Map<string, CompletionInfo>;
  conflictsByWorkoutId: Map<string, "red" | "amber">;
  syncStates: Record<string, "pending" | "synced" | "error">;
  todayIso: string;
  registerColRef: (iso: string, el: HTMLDivElement | null) => void;
  onOpenDay: (iso: string) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => isoAddDays(props.focusWeekStart, i));

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 min-h-[560px]">
      {dates.map((date) => (
        <WeekColumn
          key={date}
          date={date}
          isToday={date === props.todayIso}
          workouts={props.workoutsByDate.get(date) ?? []}
          busy={props.busyByDate.get(date) ?? []}
          completions={props.completions}
          conflictsByWorkoutId={props.conflictsByWorkoutId}
          syncStates={props.syncStates}
          registerColRef={props.registerColRef}
          onOpenDay={() => props.onOpenDay(date)}
        />
      ))}
    </div>
  );
}

function AgendaSlot({ date, mins }: { date: string; mins: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${date}:${mins}` });
  return (
    <div
      ref={setNodeRef}
      className={cn("absolute left-0 right-0 rounded", isOver && "bg-blue-500/10 ring-1 ring-blue-400/40")}
      style={{ top: ((mins - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX, height: (30 / 60) * AGENDA_ROW_PX }}
    />
  );
}

function AgendaWorkoutBlock({
  workout,
  completion,
  conflictSeverity,
  syncState,
}: {
  workout: CalWorkout;
  completion?: CompletionInfo;
  conflictSeverity?: "red" | "amber";
  syncState?: "pending" | "synced" | "error";
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workout.id,
    data: { durationMin: workout.durationMin },
  });
  const colors = WORKOUT_COLORS[workout.workoutType];
  const warmup = needsWarmupBlock(workout);
  const warmupTop = ((strToMin(workout.startTime) - 15 - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX;

  return (
    <div>
      {warmup && strToMin(workout.startTime) - 15 >= AGENDA_START_MIN && (
        <div
          className="absolute left-0 right-2 rounded-t-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-2 flex items-center gap-1.5 pointer-events-none"
          style={{ top: warmupTop, height: (15 / 60) * AGENDA_ROW_PX }}
        >
          <Flame size={10} className="text-amber-400" />
          <span className="text-[9px] font-bold text-amber-300/90 uppercase tracking-wide">
            Aufwärmen & Mobilität ({minToStr(strToMin(workout.startTime) - 15)})
          </span>
        </div>
      )}
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        style={{
          top: ((strToMin(workout.startTime) - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX,
          minHeight: Math.max((workout.durationMin / 60) * AGENDA_ROW_PX, 56),
          transform: CSS.Translate.toString(transform),
        }}
        className={cn(
          "absolute left-0 right-2 rounded-lg border border-l-4 px-3 py-2 shadow-md cursor-grab active:cursor-grabbing",
          colors.bgLight,
          colors.border,
          isDragging && "opacity-30",
          syncState === "error" && "border-rose-500/60"
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("font-mono text-[10px] font-bold", colors.text)}>
            {workout.startTime}–{workout.endTime}
          </span>
          <span className={cn("text-[10px] font-extrabold uppercase tracking-wide", colors.text)}>
            {WORKOUT_TYPE_LABELS[workout.workoutType]}
          </span>
          {completion && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Erledigt · {completion.tss} TSS
            </span>
          )}
          {syncState === "pending" && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Sync läuft…" />
          )}
          {syncState === "synced" && (
            <span className="flex" title="Im Google Kalender aktualisiert">
              <CloudUpload size={11} className="text-emerald-400" />
            </span>
          )}
          {syncState === "error" && (
            <span className="flex" title="Google-Sync fehlgeschlagen">
              <AlertTriangle size={11} className="text-rose-400" />
            </span>
          )}
          {conflictSeverity && <ConflictBadge severity={conflictSeverity} />}
          <span className="ml-auto text-[10px] font-mono text-zinc-400">
            {completion?.tss ?? plannedTss(workout)} TSS
          </span>
        </div>
        <h4 className="text-sm font-bold text-zinc-100 mt-0.5">{workout.title}</h4>
        {workout.description && (
          <p className="text-[11px] text-zinc-400 leading-relaxed mt-1 line-clamp-3">{workout.description}</p>
        )}
      </div>
    </div>
  );
}

function ExecutionChecklist({
  workout,
  exercises,
  checkedItems,
  onToggleItem,
}: {
  workout: CalWorkout;
  exercises: { name: string; sets: number }[];
  checkedItems: Record<string, boolean>;
  onToggleItem: (key: string) => void;
}) {
  const doneCount = exercises.filter((_, i) => checkedItems[`${workout.id}:${i}`]).length;

  const bullets =
    exercises.length > 0
      ? []
      : (workout.description ?? "")
          .split(/(?<=[.!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ListChecks size={14} className="text-blue-400" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            Execution Checklist
          </span>
        </div>
        {exercises.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-500">
            {doneCount}/{exercises.length}
          </span>
        )}
      </div>

      {exercises.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {exercises.map((ex, i) => {
            const key = `${workout.id}:${i}`;
            const done = Boolean(checkedItems[key]);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleItem(key)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[11px] transition-colors",
                  done
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-zinc-950/60 text-zinc-300 hover:bg-zinc-800/60"
                )}
              >
                {done ? (
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                ) : (
                  <span className="w-[13px] h-[13px] rounded border border-zinc-600 shrink-0" />
                )}
                <span className="truncate font-semibold">{ex.name}</span>
                <span className="ml-auto text-[9px] font-mono text-zinc-500 shrink-0">{ex.sets} Sätze</span>
              </button>
            );
          })}
        </div>
      ) : bullets.length > 0 ? (
        <ul className="space-y-1 list-disc list-inside text-[11px] text-zinc-400">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-zinc-500">Keine Struktur hinterlegt – freies Training.</p>
      )}
    </div>
  );
}

function DayAgenda({
  date,
  workouts,
  busy,
  completions,
  conflictsByWorkoutId,
  syncStates,
  checklistExercises,
  checkedItems,
  onToggleItem,
}: {
  date: string;
  workouts: CalWorkout[];
  busy: BusyBlock[];
  completions: Map<string, CompletionInfo>;
  conflictsByWorkoutId: Map<string, "red" | "amber">;
  syncStates: Record<string, "pending" | "synced" | "error">;
  checklistExercises: { name: string; sets: number }[];
  checkedItems: Record<string, boolean>;
  onToggleItem: (key: string) => void;
}) {
  const totalHeight = ((AGENDA_END_MIN - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX;
  const hours = Array.from(
    { length: (AGENDA_END_MIN - AGENDA_START_MIN) / 60 + 1 },
    (_, i) => AGENDA_START_MIN + i * 60
  );
  const slots: number[] = [];
  for (let m = AGENDA_START_MIN; m < AGENDA_END_MIN; m += 30) slots.push(m);

  const activeWorkouts = workouts.filter((w) => !w.isRest);
  const restDay = workouts.length > 0 && activeWorkouts.length === 0;
  const alarms = workouts.flatMap((w) => fuelingAlarms(w));
  const dayTss = workouts.reduce(
    (sum, w) => sum + (completions.get(w.id)?.tss ?? plannedTss(w)),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-zinc-100">{formatDayLong(date)}</h3>
          <span className="text-xs text-zinc-500">
            Tages-TSS {dayTss} · {alarms.length} Fueling-Alarme
          </span>
        </div>
        {restDay && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">
            Ruhetag & Regeneration
          </span>
        )}
      </div>

      <div className="relative rounded-2xl border border-zinc-800/60 bg-zinc-950/40 ml-12 mr-1">
        {hours.map((m) => (
          <div key={m}>
            <div
              className="absolute left-0 right-0 border-t border-zinc-800/40 pointer-events-none"
              style={{ top: ((m - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX }}
            />
            <div
              className="absolute -left-12 text-[9px] font-mono text-zinc-600 pointer-events-none pr-2"
              style={{ top: ((m - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX + 2 }}
            >
              {minToStr(m)}
            </div>
          </div>
        ))}

        <div className="relative" style={{ height: totalHeight }}>
          {slots.map((m) => (
            <AgendaSlot key={m} date={date} mins={m} />
          ))}

          {busy.map((b) => {
            const s = Math.max(strToMin(b.start), AGENDA_START_MIN);
            const e = Math.min(strToMin(b.end), AGENDA_END_MIN);
            if (e <= s) return null;
            return (
              <div
                key={`busy-${b.title}-${b.start}`}
                className="absolute left-0 right-2 rounded-lg border border-zinc-600/50 px-2 py-1 overflow-hidden pointer-events-none z-[1]"
                style={{
                  top: ((s - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX,
                  height: Math.max(((e - s) / 60) * AGENDA_ROW_PX, 18),
                  backgroundImage:
                    "repeating-linear-gradient(45deg, rgba(113,113,122,.22) 0 6px, transparent 6px 12px)",
                }}
                title={`${b.title} · ${b.start}–${b.end}`}
              >
                <span className="text-[10px] font-bold text-zinc-400 truncate block">{b.title}</span>
              </div>
            );
          })}

          {alarms.map((a) => {
            const t = strToMin(a.time);
            if (t < AGENDA_START_MIN || t > AGENDA_END_MIN) return null;
            return (
              <div
                key={`alarm-${a.time}`}
                className="absolute left-0 right-2 flex items-center gap-2 px-2 pointer-events-none z-[2]"
                style={{ top: ((t - AGENDA_START_MIN) / 60) * AGENDA_ROW_PX - 8 }}
              >
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 backdrop-blur-sm">
                  <AlarmClock size={10} className="text-amber-300" />
                  <span className="text-[9px] font-mono font-bold text-amber-300">{a.time}</span>
                </span>
                <span className="text-[10px] text-amber-200/80 truncate">{a.label}</span>
              </div>
            );
          })}

          {activeWorkouts.map((w) => (
            <AgendaWorkoutBlock
              key={w.id}
              workout={w}
              completion={completions.get(w.id)}
              conflictSeverity={conflictsByWorkoutId.get(w.id)}
              syncState={syncStates[w.id]}
            />
          ))}
        </div>
      </div>

      {activeWorkouts[0] && (
        <ExecutionChecklist
          workout={activeWorkouts[0]}
          exercises={checklistExercises}
          checkedItems={checkedItems}
          onToggleItem={onToggleItem}
        />
      )}

      {alarms.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlarmClock size={13} className="text-amber-300" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              Fueling-Alarms für diesen Tag
            </span>
          </div>
          {alarms.map((a) => (
            <div key={`list-${a.time}`} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-amber-300 shrink-0">{a.time}</span>
              <span className="text-amber-100/80">{a.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrainingCalendar() {
  const { weeklyPlan, loggedSessions, garminActivities, gymTemplates } = useApp();

  const [mode, setMode] = useState<ViewMode>("week");
  const [anchorIso, setAnchorIso] = useState(() => getLocalDateString(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString(new Date()));

  const [overrides, setOverrides] = usePersistentState<Record<string, ScheduleOverride>>(
    OVERRIDES_KEY,
    {},
    { validate: validateOverrides }
  );

  const [gcalConnected, setGcalConnected] = useState(false);
  const [googleBusy, setGoogleBusy] = useState<BusyInterval[]>([]);
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const gcalScheduledRef = useRef<ScheduledGoogleWorkout[]>([]);
  const [syncStates, setSyncStates] = useState<Record<string, "pending" | "synced" | "error">>({});
  const [draggingWorkout, setDraggingWorkout] = useState<CalWorkout | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const registerColRef = useCallback((iso: string, el: HTMLDivElement | null) => {
    if (el) colRefs.current.set(iso, el);
    else colRefs.current.delete(iso);
  }, []);

  const todayIso = getLocalDateString(new Date());

  const range = useMemo((): { weekStarts: string[]; focusWeekStart: string; focusDate: string } => {
    const anchorDate = isoToDate(anchorIso);
    if (mode === "month") {
      const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const firstWeek = mondayOf(firstOfMonth);
      const daysInMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate();
      const offset = (firstOfMonth.getDay() + 6) % 7;
      const weekCount = Math.ceil((offset + daysInMonth) / 7);
      const weekStarts = Array.from({ length: weekCount }, (_, i) => isoAddDays(firstWeek, i * 7));
      return { weekStarts, focusWeekStart: firstWeek, focusDate: anchorIso };
    }
    if (mode === "week") {
      const ws = mondayOf(anchorDate);
      return { weekStarts: [ws], focusWeekStart: ws, focusDate: anchorIso };
    }
    const ws = mondayOf(isoToDate(selectedDate));
    return { weekStarts: [ws], focusWeekStart: ws, focusDate: selectedDate };
  }, [mode, anchorIso, selectedDate]);

  const workouts = useMemo(
    () => range.weekStarts.flatMap((ws) => buildWeekWorkouts(ws, weeklyPlan, overrides)),
    [range.weekStarts, weeklyPlan, overrides]
  );

  const workoutsById = useMemo(() => {
    const map = new Map<string, CalWorkout>();
    for (const w of workouts) map.set(w.id, w);
    return map;
  }, [workouts]);

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, CalWorkout[]>();
    for (const w of workouts) {
      const list = map.get(w.date) ?? [];
      list.push(w);
      map.set(w.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => strToMin(a.startTime) - strToMin(b.startTime));
    }
    return map;
  }, [workouts]);

  const completions = useMemo((): CompletionIndex => {
    interface PoolEntry {
      category: SessionCategory;
      info: CompletionInfo;
      garminId?: string;
    }
    const pools = new Map<string, PoolEntry[]>();
    const byWorkoutId = new Map<string, CompletionInfo>();
    const consumedGarminIds = new Set<string>();

    for (const a of garminActivities) {
      const category = garminCategory(a);
      if (!category) continue;
      const date = zonedDateString(new Date(a.startTime).getTime());
      const minutes = Math.round((a.durationSeconds || a.movingDurationSeconds || 0) / 60);
      const tss = a.tss ?? estimateTss(minutes, category === "run" ? "running" : "cycling");
      const list = pools.get(date) ?? [];
      list.push({
        category,
        garminId: a.id,
        info: {
          tss: category === "gym" ? Math.min(140, Math.max(20, Math.round(minutes * 0.65))) : tss,
          minutes,
        },
      });
      pools.set(date, list);
    }

    for (const s of loggedSessions) {
      const category = sessionCategory(s);
      if (!category) continue;
      const date = s.date.slice(0, 10);
      const list = pools.get(date) ?? [];
      if (list.some((e) => e.category === category)) continue;
      if (category === "gym") {
        if (s.kind !== "gym") continue;
        const tonnage = gymTonnageKg(s);
        const totalSets = s.entries.reduce((n, ex) => n + ex.sets.filter((st) => st.isCompleted !== false).length, 0);
        list.push({
          category,
          info: {
            tss: Math.min(140, Math.max(15, Math.round(tonnage / 350))),
            minutes: Math.min(120, Math.max(30, Math.round(totalSets * 3.5))),
          },
        });
      } else if (s.kind === "endurance") {
        const minutes = Math.round(parseDurationToMinutes(s.duration));
        if (minutes <= 0) continue;
        list.push({
          category,
          info: { tss: estimateTss(minutes, s.activityType), minutes },
        });
      }
      pools.set(date, list);
    }

    for (const w of workouts) {
      if (w.isRest) continue;
      const category: SessionCategory | null =
        w.workoutType === "gym"
          ? "gym"
          : w.workoutType === "cycling"
            ? "bike"
            : w.workoutType === "running"
              ? "run"
              : null;
      if (!category) continue;
      const pool = pools.get(w.date);
      if (!pool) continue;
      const idx = pool.findIndex((e) => e.category === category);
      if (idx === -1) continue;
      const [entry] = pool.splice(idx, 1);
      byWorkoutId.set(w.id, entry.info);
      if (entry.garminId) consumedGarminIds.add(entry.garminId);
    }

    return { byWorkoutId, consumedGarminIds };
  }, [workouts, garminActivities, loggedSessions]);

  const conflicts = useMemo(() => detectInterferenceConflicts(workouts), [workouts]);

  const conflictsByWorkoutId = useMemo(() => {
    const map = new Map<string, "red" | "amber">();
    for (const c of conflicts) {
      for (const part of c.id.split("__")) {
        if (workoutsById.has(part) && map.get(part) !== "red") map.set(part, c.severity);
      }
    }
    return map;
  }, [conflicts, workoutsById]);

  const conflictDates = useMemo(() => {
    const map = new Map<string, "red" | "amber">();
    for (const c of conflicts) {
      if (map.get(c.date) !== "red") map.set(c.date, c.severity);
    }
    return map;
  }, [conflicts]);

  const tssByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workouts) {
      const effective = completions.byWorkoutId.get(w.id)?.tss ?? plannedTss(w);
      map.set(w.date, (map.get(w.date) ?? 0) + effective);
    }
    return map;
  }, [workouts, completions]);

  const minutesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workouts) {
      if (w.isRest) continue;
      const effective = completions.byWorkoutId.get(w.id)?.minutes ?? w.durationMin;
      map.set(w.date, (map.get(w.date) ?? 0) + effective);
    }
    return map;
  }, [workouts, completions]);

  const busyByDate = useMemo(() => {
    const map = new Map<string, BusyBlock[]>();
    const dates = new Set<string>([...workouts.map((w) => w.date), ...localEvents.map((e) => e.date)]);
    for (const d of dates) map.set(d, busyBlocksForDate(googleBusy, localEvents, d));
    return map;
  }, [workouts, googleBusy, localEvents]);

  const rollupWeekStart = mode === "day" ? mondayOf(isoToDate(selectedDate)) : mode === "week" ? range.focusWeekStart : mondayOf(new Date());
  const rollupWorkouts = useMemo(
    () => buildWeekWorkouts(rollupWeekStart, weeklyPlan, overrides),
    [rollupWeekStart, weeklyPlan, overrides]
  );

  const rollup = useMemo(() => {
    let effectiveMinutes = 0;
    let plannedTssTotal = 0;
    let completedTss = 0;

    for (const w of rollupWorkouts) {
      if (w.isRest) continue;
      plannedTssTotal += plannedTss(w);
      const c = completions.byWorkoutId.get(w.id);
      if (c) {
        completedTss += c.tss;
        effectiveMinutes += c.minutes;
      } else {
        effectiveMinutes += w.durationMin;
      }
    }

    const wsMs = zonedToUtcMs(rollupWeekStart, "00:00");
    const weMs = zonedToUtcMs(isoAddDays(rollupWeekStart, 7), "00:00");

    let bikeKm = 0;
    let bikeKj = 0;
    let tonnageKg = 0;
    let extraMinutes = 0;

    for (const a of garminActivities) {
      const startMs = new Date(a.startTime).getTime();
      if (startMs < wsMs || startMs >= weMs) continue;
      if (!completions.consumedGarminIds.has(a.id)) {
        extraMinutes += Math.round((a.durationSeconds || a.movingDurationSeconds || 0) / 60);
      }
      if (a.type === "cycling") {
        bikeKm += a.distanceMeters / 1000;
        bikeKj += a.workKJ ?? 0;
      }
    }

    for (const s of loggedSessions) {
      if (s.kind !== "gym") continue;
      const dMs = zonedToUtcMs(s.date.slice(0, 10), "12:00");
      if (dMs < wsMs || dMs >= weMs) continue;
      tonnageKg += gymTonnageKg(s);
    }

    return {
      totalTimeMin: effectiveMinutes + extraMinutes,
      bikeKm,
      bikeKj,
      tonnageKg,
      plannedTss: plannedTssTotal,
      completedTss,
    };
  }, [rollupWorkouts, rollupWeekStart, completions, garminActivities, loggedSessions]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/google/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (cancelled) return;
        const connected = Boolean(d?.connected);
        setGcalConnected(connected);
        if (!connected) return;
        const [busyRes, schedRes] = await Promise.all([
          fetch("/api/calendar/google/busy?days=21").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/calendar/google/scheduled").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (cancelled) return;
        if (busyRes?.success && Array.isArray(busyRes.busy)) setGoogleBusy(busyRes.busy);
        if (schedRes?.success && Array.isArray(schedRes.items)) {
          gcalScheduledRef.current = schedRes.items as ScheduledGoogleWorkout[];
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadLocal = () => setLocalEvents(getStoredCalendarEvents());
    loadLocal();
    window.addEventListener("focus", loadLocal);
    return () => window.removeEventListener("focus", loadLocal);
  }, []);

  const pushGoogleSync = useCallback(async (workout: CalWorkout, target: ScheduleOverride) => {
    const link = gcalScheduledRef.current.find(
      (g) => g.sourceDayIndex === workout.sourceDayIndex && g.title === workout.title
    );
    if (!link) return;

    setSyncStates((prev) => ({ ...prev, [workout.id]: "pending" }));
    try {
      const res = await fetch("/api/calendar/google/scheduled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id, date: target.date, startTime: target.startTime }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.success && data.item) {
        gcalScheduledRef.current = gcalScheduledRef.current.map((g) =>
          g.id === link.id ? { ...g, ...data.item } : g
        );
      }
      if (mountedRef.current) {
        setSyncStates((prev) => ({ ...prev, [workout.id]: "synced" }));
        toast.success("Google Kalender aktualisiert", {
          description: `${workout.title} → ${formatDayShort(target.date)}, ${target.startTime}`,
        });
      }
    } catch {
      if (mountedRef.current) {
        setSyncStates((prev) => ({ ...prev, [workout.id]: "error" }));
        toast.error("Google-Sync fehlgeschlagen", {
          description: "Änderung ist lokal gespeichert und wird beim nächsten Sync nachgezogen.",
        });
      }
    }
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const lastDragEndAtRef = useRef(0);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setDraggingWorkout(workoutsById.get(String(event.active.id)) ?? null);
    },
    [workoutsById]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingWorkout(null);
      lastDragEndAtRef.current = Date.now();
      const wid = String(event.active.id);
      const workout = workoutsById.get(wid);
      if (!workout || workout.isRest) return;

      const overId = event.over ? String(event.over.id) : "";
      if (!overId) return;

      let date = workout.date;
      let startTime = workout.startTime;

      if (overId.startsWith("col:")) {
        date = overId.slice(4);
        const colEl = colRefs.current.get(date);
        const activator = event.activatorEvent as PointerEvent | undefined;
        if (colEl && activator && typeof activator.clientY === "number") {
          const rect = colEl.getBoundingClientRect();
          const relY = activator.clientY + event.delta.y - rect.top - WEEK_COL_HEADER_PX;
          let mins = snapToStep(DAY_WINDOW_START_MIN + relY / PX_PER_MIN);
          mins = Math.max(DAY_WINDOW_START_MIN, Math.min(mins, DAY_WINDOW_END_MIN - workout.durationMin));
          startTime = minToStr(mins);
        }
      } else if (overId.startsWith("cell:")) {
        date = overId.slice(5);
      } else if (overId.startsWith("slot:")) {
        const [, slotDate, slotMinRaw] = overId.split(":");
        date = slotDate;
        startTime = minToStr(snapToStep(Number(slotMinRaw)));
      } else {
        return;
      }

      if (date === workout.date && startTime === workout.startTime) return;

      const target = { date, startTime };
      setOverrides((prev) => ({ ...prev, [wid]: target }));

      const othersTss = workouts
        .filter((w) => w.date === date && w.id !== wid)
        .reduce((sum, w) => sum + (completions.byWorkoutId.get(w.id)?.tss ?? plannedTss(w)), 0);

      toast.success(`„${workout.title}" verschoben`, {
        description: `${formatDayShort(date)} · ${startTime} Uhr · Tag neu: ${othersTss + plannedTss(workout)} TSS`,
      });

      void pushGoogleSync(workout, target);
    },
    [workoutsById, workouts, completions, setOverrides, pushGoogleSync]
  );

  const navigate = useCallback(
    (dir: 1 | -1) => {
      if (mode === "month") {
        const d = isoToDate(anchorIso);
        setAnchorIso(dateToIso(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
      } else if (mode === "week") {
        setAnchorIso(isoAddDays(anchorIso, dir * 7));
      } else {
        setSelectedDate(isoAddDays(selectedDate, dir));
      }
    },
    [mode, anchorIso, selectedDate]
  );

  const goToday = useCallback(() => {
    setAnchorIso(todayIso);
    setSelectedDate(todayIso);
  }, [todayIso]);

  const periodLabel = useMemo(() => {
    if (mode === "month") {
      return isoToDate(anchorIso).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    }
    if (mode === "week") {
      const ws = range.focusWeekStart;
      const we = isoAddDays(ws, 6);
      const sameMonth = ws.slice(0, 7) === we.slice(0, 7);
      const from = isoToDate(ws).toLocaleDateString("de-DE", {
        day: "numeric",
        ...(sameMonth ? {} : { month: "short" }),
      });
      const to = isoToDate(we).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
      return `${from}.–${to}`;
    }
    return formatDayShort(selectedDate);
  }, [mode, anchorIso, range.focusWeekStart, selectedDate]);

  const openDay = useCallback((iso: string) => {
    if (Date.now() - lastDragEndAtRef.current < 250) return;
    setSelectedDate(iso);
    setAnchorIso(iso);
    setMode("day");
  }, []);

  const toggleChecklistItem = useCallback((key: string) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectedDayWorkouts = useMemo(() => {
    const direct = workoutsByDate.get(selectedDate);
    if (direct) return direct;
    return buildWeekWorkouts(mondayOf(isoToDate(selectedDate)), weeklyPlan, overrides).filter(
      (w) => w.date === selectedDate
    );
  }, [workoutsByDate, selectedDate, weeklyPlan, overrides]);

  const checklistExercises = useMemo(() => {
    if (mode !== "day") return [];
    const workout = selectedDayWorkouts.find((w) => !w.isRest && w.templateId);
    if (!workout?.templateId) return [];
    const tpl = gymTemplates.find((t) => t.id === workout.templateId);
    if (!tpl || tpl.exercises.length === 0) return [];
    return tpl.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets?.length || ex.targetSets || 1,
    }));
  }, [mode, selectedDayWorkouts, gymTemplates]);

  const tssProgress =
    rollup.plannedTss > 0
      ? Math.min(100, Math.round((rollup.completedTss / rollup.plannedTss) * 100))
      : 0;

  return (
    <div className="w-full flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-lg sm:text-xl font-extrabold text-zinc-100 flex items-center gap-2 flex-wrap">
            Trainingskalender
            <SyncBadge connected={gcalConnected} />
          </h2>
          <p className="text-xs text-zinc-500">
            Drag & Drop zum Umsplanen · TSS & Konflikte werden live neu berechnet
          </p>
        </div>
        <ViewSwitcher mode={mode} onChange={setMode} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Zurück"
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="Weiter"
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="text-sm font-bold text-zinc-300 min-w-[120px] text-right">{periodLabel}</span>
      </header>

      <aside className="order-first xl:order-last xl:w-80 xl:self-end grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-1 gap-3">
        <RollupCard
          icon={<Timer size={15} />}
          tone="text-blue-400"
          label="Gesamtzeit"
          value={fmtHours(rollup.totalTimeMin)}
          sub="Diese Woche (geplant + erledigt)"
        />
        <RollupCard
          icon={<Bike size={15} />}
          tone="text-orange-400"
          label="Rad"
          value={`${fmtNum(rollup.bikeKm, 1)} km`}
          sub={`${fmtNum(rollup.bikeKj)} kJ · Garmin`}
        />
        <RollupCard
          icon={<Dumbbell size={15} />}
          tone="text-purple-400"
          label="Kraft-Tonnage"
          value={`${fmtNum(rollup.tonnageKg)} kg`}
          sub="Gewicht × Wdh. (abgeschlossen)"
        />
        <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">TSS</span>
            <Flame size={15} className="text-rose-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold text-zinc-100">{rollup.completedTss}</span>
            <span className="text-xs text-zinc-500">/ {rollup.plannedTss} geplant</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-rose-500 to-orange-400 transition-all"
              style={{ width: `${tssProgress}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-500">{tssProgress} % erfüllt</span>
        </div>

        <div className="col-span-2 lg:col-span-4 xl:col-span-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
              Hybrid-Konflikte (&lt; 6 h)
            </span>
            {conflicts.length > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                {conflicts.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                Sauber
              </span>
            )}
          </div>
          {conflicts.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              Keine Interferenz-Verletzungen im Zeitraum – Beinschwerpunkt & intensives Cardio sauber getrennt.
            </p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {conflicts.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openDay(c.date)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-xl border space-y-1 transition-colors",
                    c.severity === "red"
                      ? "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10"
                      : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <ConflictBadge severity={c.severity} />
                    <span className="text-[10px] font-bold text-zinc-300">
                      {formatDayShort(c.date)} · Δ {gapLabel(Math.max(c.gapMin, 0))}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 leading-relaxed">{c.reason}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingWorkout(null)}
        >
          {mode === "month" && (
            <MonthView
              weekStarts={range.weekStarts}
              workoutsByDate={workoutsByDate}
              tssByDate={tssByDate}
              minutesByDate={minutesByDate}
              conflictDates={conflictDates}
              todayIso={todayIso}
              focusIso={anchorIso}
              onOpenDay={openDay}
            />
          )}

          {mode === "week" && (
            <WeekView
              focusWeekStart={range.focusWeekStart}
              workoutsByDate={workoutsByDate}
              busyByDate={busyByDate}
              completions={completions.byWorkoutId}
              conflictsByWorkoutId={conflictsByWorkoutId}
              syncStates={syncStates}
              todayIso={todayIso}
              registerColRef={registerColRef}
              onOpenDay={openDay}
            />
          )}

          {mode === "day" && (
            <DayAgenda
              date={selectedDate}
              workouts={selectedDayWorkouts}
              busy={busyByDate.get(selectedDate) ?? []}
              completions={completions.byWorkoutId}
              conflictsByWorkoutId={conflictsByWorkoutId}
              syncStates={syncStates}
              checklistExercises={checklistExercises}
              checkedItems={checkedItems}
              onToggleItem={toggleChecklistItem}
            />
          )}

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.9,.4,1)" }}>
            {draggingWorkout && !draggingWorkout.isRest && (
              <div
                className={cn(
                  "rounded-lg border border-l-4 px-2 py-1.5 shadow-2xl rotate-2 scale-105 pointer-events-none bg-zinc-900/95",
                  WORKOUT_COLORS[draggingWorkout.workoutType].border
                )}
              >
                <span className="font-mono text-[9px] text-zinc-400">
                  {draggingWorkout.startTime} · {plannedTss(draggingWorkout)} TSS
                </span>
                <div
                  className={cn(
                    "font-bold text-[11px] leading-tight",
                    WORKOUT_COLORS[draggingWorkout.workoutType].text
                  )}
                >
                  {draggingWorkout.title}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </section>
    </div>
  );
}
