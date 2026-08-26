"use client";

import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, CalendarClock, SkipForward, Flame } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { cn, generateId, getLocalDateString, getTodayIndex } from "@/lib/utils";
import { getFitnessProfile } from "@/lib/workout/targetEngine";
import {
  scheduleNativeGarminWorkout,
  withIntelligentTargets,
  type GarminWorkoutPayload,
} from "@/lib/garmin/garminService";
import type { DayPlan, EnduranceTemplate, GymTemplate, WorkoutType } from "@/types";
import {
  buildLibrary,
  filterLibrary,
  sortLibrary,
} from "../engine";
import type {
  LibraryFilters,
  LibrarySortMode,
  LibraryWorkout,
} from "../types";
import { DEFAULT_LIBRARY_FILTERS } from "../types";
import LibraryFilterBar from "./LibraryFilterBar";
import WorkoutCard from "./WorkoutCard";
import ScheduleDialog from "./ScheduleDialog";
import WorkoutDetailModal from "./WorkoutDetailModal";

const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

interface LibraryViewProps {
  onEditGymTemplate?: (template: GymTemplate) => void;
  onEditEnduranceTemplate?: (template: EnduranceTemplate) => void;
}

interface ScheduleTarget {
  workout: LibraryWorkout;
  mode: "calendar" | "garmin";
}

function localDateForDayIndex(dayIndex: number): string {
  const today = new Date();
  const jsToday = today.getDay();
  const todayMon = jsToday === 0 ? 6 : jsToday - 1;
  const date = new Date(today);
  date.setDate(date.getDate() + (dayIndex - todayMon));
  return getLocalDateString(date);
}

function disciplineToWorkoutType(discipline: LibraryWorkout["discipline"]): WorkoutType {
  switch (discipline) {
    case "cycling":
      return "cycling";
    case "running":
      return "running";
    case "mobility":
      return "mobility";
    default:
      return "gym";
  }
}

export default function LibraryView({
  onEditGymTemplate,
  onEditEnduranceTemplate,
}: LibraryViewProps) {
  const {
    gymTemplates,
    enduranceTemplates,
    weeklyPlan,
    loggedSessions,
    garminActivities,
    updateWeeklyPlan,
    saveGymTemplate,
    saveEnduranceTemplate,
  } = useApp();

  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);
  const [sortMode, setSortMode] = useState<LibrarySortMode>("newest");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [detailWorkout, setDetailWorkout] = useState<LibraryWorkout | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null);

  const fitnessProfile = useMemo(() => getFitnessProfile(), []);

  const library = useMemo(
    () =>
      buildLibrary({
        gymTemplates,
        enduranceTemplates,
        weeklyPlan,
        loggedSessions,
        garminActivities,
        todayIndex: getTodayIndex(),
        fitnessProfile,
      }),
    [gymTemplates, enduranceTemplates, weeklyPlan, loggedSessions, garminActivities, fitnessProfile]
  );

  const visibleWorkouts = useMemo(
    () => sortLibrary(filterLibrary(library, filters), sortMode),
    [library, filters, sortMode]
  );

  const stats = useMemo(() => {
    let planned = 0;
    let completed = 0;
    let skipped = 0;
    let totalTss = 0;
    for (const workout of library) {
      if (workout.status === "planned") planned += 1;
      else if (workout.status === "completed") {
        completed += 1;
        totalTss += workout.estimatedTss;
      } else skipped += 1;
    }
    return { planned, completed, skipped, totalTss };
  }, [library]);

  function patchFilters(patch: Partial<LibraryFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function findGymTemplate(workout: LibraryWorkout): GymTemplate | undefined {
    return gymTemplates.find((t) => t.id === workout.templateId);
  }

  function findEnduranceTemplate(workout: LibraryWorkout): EnduranceTemplate | undefined {
    return enduranceTemplates.find((t) => t.id === workout.templateId);
  }

  function handleDuplicate(workout: LibraryWorkout) {
    const gymSource = findGymTemplate(workout);
    if (gymSource) {
      saveGymTemplate({
        ...gymSource,
        id: generateId(),
        name: `${gymSource.name} (Kopie)`,
      });
      toast.success(`Vorlage "${gymSource.name}" dupliziert`);
      return;
    }
    const enduranceSource = findEnduranceTemplate(workout);
    if (enduranceSource) {
      saveEnduranceTemplate({
        ...enduranceSource,
        id: generateId(),
        name: `${enduranceSource.name} (Kopie)`,
      });
      toast.success(`Vorlage "${enduranceSource.name}" dupliziert`);
    }
  }

  function handleEdit(workout: LibraryWorkout) {
    const gymSource = findGymTemplate(workout);
    if (gymSource && onEditGymTemplate) {
      onEditGymTemplate(gymSource);
      return;
    }
    const enduranceSource = findEnduranceTemplate(workout);
    if (enduranceSource && onEditEnduranceTemplate) {
      onEditEnduranceTemplate(enduranceSource);
    }
  }

  async function handlePickDay(dayIndex: number) {
    const target = scheduleTarget;
    setScheduleTarget(null);
    if (!target) return;

    if (target.mode === "calendar") {
      applyToWeekPlan(target.workout, dayIndex);
      return;
    }
    await sendToGarmin(target.workout, dayIndex);
  }

  function applyToWeekPlan(workout: LibraryWorkout, dayIndex: number) {
    const nextPlan = weeklyPlan.map((day): DayPlan => {
      if (day.dayIndex !== dayIndex) return day;
      return {
        ...day,
        title: workout.title,
        description: workout.description || day.description,
        workoutType: disciplineToWorkoutType(workout.discipline),
        templateId: workout.templateId,
        isCompleted: false,
      };
    });
    updateWeeklyPlan(nextPlan);
    toast.success(`"${workout.title}" auf ${DAY_NAMES[dayIndex]} geplant`, {
      description: "Die Einheit erscheint jetzt im Wochenplan.",
    });
  }

  function buildGarminPayload(workout: LibraryWorkout): GarminWorkoutPayload {
    if (workout.discipline === "cycling" || workout.discipline === "running") {
      return withIntelligentTargets({
        name: workout.title,
        type: workout.discipline,
        description: workout.description ?? "",
        exercises: [],
      });
    }
    return {
      name: workout.title,
      type: "gym",
      description: workout.description ?? "",
      exercises: workout.steps
        .filter((step) => step.phase === "work")
        .map((step) => ({
          name: step.label.slice(0, 40),
          sets: [{ reps: step.reps ?? 10, weight: 0 }],
        })),
    };
  }

  async function sendToGarmin(workout: LibraryWorkout, dayIndex: number) {
    const dateStr = localDateForDayIndex(dayIndex);
    try {
      const result = await scheduleNativeGarminWorkout(dateStr, buildGarminPayload(workout));
      if (result.success) {
        toast.success(`"${workout.title}" an Garmin übertragen`, {
          description: result.message || `Geplant für ${dateStr}.`,
        });
      } else {
        toast.error("Garmin-Übertragung fehlgeschlagen", {
          description: result.error || "Bitte Garmin-Verbindung prüfen.",
        });
      }
    } catch {
      toast.error("Garmin-Übertragung fehlgeschlagen", {
        description: "Netzwerkfehler – bitte Verbindung prüfen.",
      });
    }
  }

  const cardHandlers = (workout: LibraryWorkout) => ({
    onOpenDetails: () => setDetailWorkout(workout),
    onAddToCalendar: () => setScheduleTarget({ workout, mode: "calendar" as const }),
    onSendToGarmin: () => setScheduleTarget({ workout, mode: "garmin" as const }),
    onDuplicate: () => handleDuplicate(workout),
    onEdit: () => handleEdit(workout),
  });

  return (
    <div className="px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-5 sm:space-y-6 pb-28 md:pb-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-black text-zinc-100 tracking-tight flex items-center gap-2 font-mono uppercase">
            <BookOpen size={18} className="text-cyan-400" />
            <span>Workout-Bibliothek & Archiv</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-500 mt-1">
            Zentrales Repository aller Vorlagen, KI-Sessions und absolvierten Einheiten – durchsuchbar & filterbar.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 max-w-md w-full">
          <StatCard icon={<CalendarClock size={13} />} value={stats.planned} label="Geplant" tone="text-cyan-300" />
          <StatCard icon={<CheckCircle2 size={13} />} value={stats.completed} label="Erledigt" tone="text-emerald-300" />
          <StatCard icon={<SkipForward size={13} />} value={stats.skipped} label="Übersprungen" tone="text-amber-300" />
          <StatCard
            icon={<Flame size={13} />}
            value={`${Math.round(stats.totalTss / Math.max(1, stats.completed))}`}
            label="Ø TSS"
            tone="text-orange-300"
          />
        </div>
      </header>

      <div className="glass-panel rounded-3xl border border-white/10 p-3.5 sm:p-4 space-y-3 bg-zinc-900/60 backdrop-blur-xl">
        <LibraryFilterBar
          filters={filters}
          onChange={patchFilters}
          resultCount={visibleWorkouts.length}
          totalCount={library.length}
          sortMode={sortMode}
          onSortChange={setSortMode}
          layout={layout}
          onLayoutChange={setLayout}
        />
      </div>

      {visibleWorkouts.length === 0 ? (
        <div className="p-10 rounded-3xl bg-zinc-900/40 border border-dashed border-zinc-800 text-center space-y-2">
          <p className="text-sm font-bold text-zinc-300">Keine Workouts gefunden</p>
          <p className="text-xs text-zinc-500">
            Passe Filter oder Suchbegriff an – oder plane eine neue Einheit im Wochenplan.
          </p>
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {visibleWorkouts.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} layout="grid" {...cardHandlers(workout)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleWorkouts.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} layout="list" {...cardHandlers(workout)} />
          ))}
        </div>
      )}

      <div className="hidden md:block h-1" aria-hidden />

      {detailWorkout && (
        <WorkoutDetailModal
          workout={detailWorkout}
          ftpWatts={fitnessProfile.ftpWatts}
          onClose={() => setDetailWorkout(null)}
          onAddToCalendar={() => setScheduleTarget({ workout: detailWorkout, mode: "calendar" })}
          onSendToGarmin={() => setScheduleTarget({ workout: detailWorkout, mode: "garmin" })}
          onDuplicate={() => {
            handleDuplicate(detailWorkout);
            setDetailWorkout(null);
          }}
          onEdit={() => {
            handleEdit(detailWorkout);
            setDetailWorkout(null);
          }}
        />
      )}

      {scheduleTarget && (
        <ScheduleDialog
          workoutTitle={scheduleTarget.workout.title}
          mode={scheduleTarget.mode}
          onClose={() => setScheduleTarget(null)}
          onPickDay={handlePickDay}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: string;
}) {
  return (
    <div className="p-2.5 sm:p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 space-y-0.5 min-w-0">
      <span className={cn("flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider", tone)}>
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="block text-lg font-black font-mono text-zinc-100 leading-none">{value}</span>
    </div>
  );
}
