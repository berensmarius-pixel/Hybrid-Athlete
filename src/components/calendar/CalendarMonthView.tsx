"use client";

import { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Filter,
  Plus,
  Dumbbell,
  Bike,
  Activity,
  Waves,
  Sparkles,
  CheckCircle2,
  Clock,
  Flame,
  Watch,
  X,
  Layers,
  ArrowUpRight,
  Share2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useStrava } from "@/context/StravaContext";
import { cn, getLocalDateString, generateId } from "@/lib/utils";
import type { WorkoutType, DayPlan, GymTemplate, EnduranceTemplate } from "@/types";
import { motion, AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import { scheduleNativeGarminWorkout } from "@/lib/garmin/garminService";

const ScheduleDialog = dynamic(
  () => import("@/modules/workouts/library/components/ScheduleDialog"),
  { ssr: false }
);

type ColorMode = "sport" | "intensity" | "status";
type SportFilter = "all" | "running" | "cycling" | "swimming" | "gym";

interface DayCellData {
  dateStr: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0 = Mon ... 6 = Sun
  plannedWorkouts: Array<{
    id: string;
    type: WorkoutType;
    title: string;
    description?: string;
    durationMinutes?: number;
    distanceKm?: number;
    load?: number;
    isCompleted?: boolean;
  }>;
  doneActivities: Array<{
    id: string;
    type: WorkoutType;
    title: string;
    durationMinutes: number;
    distanceKm?: number;
    elevationM?: number;
    load?: number;
    source: "strava" | "garmin" | "manual";
  }>;
}

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const WEEK_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function CalendarMonthView() {
  const {
    weeklyPlan,
    updateWeeklyPlan,
    gymTemplates,
    enduranceTemplates,
    garminActivities,
  } = useApp();
  const { activities: stravaActivities } = useStrava();

  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed

  // Filters & display modes
  const [colorMode, setColorMode] = useState<ColorMode>("sport");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");

  // Modals & Drawers
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [addWorkoutDate, setAddWorkoutDate] = useState<string | null>(null);

  // Month Navigation
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Build Calendar Weeks Grid
  const calendarWeeks = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Monday-based day of week: 0 = Mon ... 6 = Sun
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();

    const todayStr = getLocalDateString(today);

    const cells: DayCellData[] = [];

    // Previous month padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = getLocalDateString(prevDate);
      const dayOfWeek = prevDate.getDay() === 0 ? 6 : prevDate.getDay() - 1;

      cells.push({
        dateStr,
        dayOfMonth: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        dayOfWeek,
        plannedWorkouts: [],
        doneActivities: [],
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = getLocalDateString(date);
      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;

      cells.push({
        dateStr,
        dayOfMonth: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        dayOfWeek,
        plannedWorkouts: [],
        doneActivities: [],
      });
    }

    // Next month padding days to fill the final week
    const totalCells = Math.ceil(cells.length / 7) * 7;
    let nextMonthDay = 1;
    while (cells.length < totalCells) {
      const nextDate = new Date(currentYear, currentMonth + 1, nextMonthDay);
      const dateStr = getLocalDateString(nextDate);
      const dayOfWeek = nextDate.getDay() === 0 ? 6 : nextDate.getDay() - 1;

      cells.push({
        dateStr,
        dayOfMonth: nextMonthDay,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        dayOfWeek,
        plannedWorkouts: [],
        doneActivities: [],
      });
      nextMonthDay++;
    }

    // Populate workouts & activities for each cell
    cells.forEach((cell) => {
      // 1. Planned workouts from weekly plan (mapped by dayOfWeek)
      const dayPlan = weeklyPlan.find((p) => p.dayIndex === cell.dayOfWeek);
      if (dayPlan && dayPlan.workoutType !== "rest") {
        const estDuration = dayPlan.workoutType === "gym" ? 60 : 45;
        const estLoad = dayPlan.workoutType === "gym" ? 55 : dayPlan.workoutType === "cycling" ? 65 : 70;
        const estDist = dayPlan.workoutType === "running" ? 8 : dayPlan.workoutType === "cycling" ? 25 : undefined;

        cell.plannedWorkouts.push({
          id: `plan-${cell.dateStr}-${dayPlan.dayIndex}`,
          type: dayPlan.workoutType,
          title: dayPlan.title || (dayPlan.workoutType === "gym" ? "Krafttraining" : "Ausdauertraining"),
          description: dayPlan.description,
          durationMinutes: estDuration,
          distanceKm: estDist,
          load: estLoad,
          isCompleted: dayPlan.isCompleted,
        });

        // Add additional sessions if any
        if (dayPlan.sessions && dayPlan.sessions.length > 0) {
          dayPlan.sessions.forEach((s) => {
            cell.plannedWorkouts.push({
              id: s.id,
              type: s.workoutType,
              title: s.title,
              description: s.description,
              durationMinutes: 45,
              load: 50,
              isCompleted: s.isCompleted,
            });
          });
        }
      }

      // 2. Completed Strava Activities on this date
      const stravaOnDay = (stravaActivities || []).filter((a: any) => {
        if (!a.start_date_local) return false;
        return a.start_date_local.startsWith(cell.dateStr);
      });

      stravaOnDay.forEach((a: any) => {
        const type: WorkoutType =
          a.type === "Run" ? "running" : a.type === "Ride" ? "cycling" : a.type === "Swim" ? "swimming" : "gym";
        const durMin = Math.round((a.moving_time || a.elapsed_time || 0) / 60);
        const distKm = a.distance ? Number((a.distance / 1000).toFixed(1)) : undefined;
        const elev = a.total_elevation_gain ? Math.round(a.total_elevation_gain) : 0;
        const load = a.suffer_score || Math.round(durMin * 0.9);

        cell.doneActivities.push({
          id: `strava-${a.id}`,
          type,
          title: a.name || "Strava Workout",
          durationMinutes: durMin,
          distanceKm: distKm,
          elevationM: elev,
          load,
          source: "strava",
        });
      });

      // 3. Completed Garmin Activities on this date
      const garminOnDay = (garminActivities || []).filter((g: any) => {
        const gDate = g.startTimeLocal || g.date || "";
        return gDate.startsWith(cell.dateStr);
      });

      garminOnDay.forEach((g: any) => {
        const typeStr = (g.activityType || g.type || "").toLowerCase();
        const type: WorkoutType = typeStr.includes("run")
          ? "running"
          : typeStr.includes("cycl") || typeStr.includes("bike")
          ? "cycling"
          : typeStr.includes("swim")
          ? "swimming"
          : "gym";
        const durMin = Math.round((g.duration || g.elapsedDuration || 0) / 60);
        const distKm = g.distance ? Number((g.distance / 1000).toFixed(1)) : undefined;
        const load = g.trainingLoad || Math.round(durMin * 0.85);

        // Check if not already in doneActivities
        if (!cell.doneActivities.some((done) => Math.abs(done.durationMinutes - durMin) < 3)) {
          cell.doneActivities.push({
            id: `garmin-${g.activityId || generateId()}`,
            type,
            title: g.activityName || "Garmin Workout",
            durationMinutes: durMin,
            distanceKm: distKm,
            load,
            source: "garmin",
          });
        }
      });
    });

    // Group cells into chunks of 7 days (weeks)
    const weeks: DayCellData[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    return weeks;
  }, [currentYear, currentMonth, weeklyPlan, stravaActivities, garminActivities, today]);

  // Sport Filter matching helper
  const matchesSportFilter = (type: WorkoutType) => {
    if (sportFilter === "all") return true;
    return type === sportFilter;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 text-zinc-100 flex flex-col select-none">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/80 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg lg:text-xl font-bold tracking-tight text-zinc-100">
              Calendar of {MONTH_NAMES[currentMonth]} {currentYear}
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Template Library Button */}
          <button
            onClick={() => setTemplateLibraryOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Template Library</span>
          </button>

          {/* Color By Dropdown */}
          <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-zinc-500 mr-1.5">Colored by</span>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              className="bg-transparent text-zinc-200 font-medium focus:outline-none cursor-pointer pr-1"
            >
              <option value="sport" className="bg-zinc-900 text-zinc-200">Sport</option>
              <option value="intensity" className="bg-zinc-900 text-zinc-200">Intensity</option>
              <option value="status" className="bg-zinc-900 text-zinc-200">Status</option>
            </select>
          </div>

          {/* Sport Filter Dropdown */}
          <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value as SportFilter)}
              className="bg-transparent text-zinc-200 font-medium focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-zinc-900 text-zinc-200">All Sports</option>
              <option value="running" className="bg-zinc-900 text-zinc-200">Running</option>
              <option value="cycling" className="bg-zinc-900 text-zinc-200">Cycling</option>
              <option value="swimming" className="bg-zinc-900 text-zinc-200">Swimming</option>
              <option value="gym" className="bg-zinc-900 text-zinc-200">Gym / Strength</option>
            </select>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={prevMonth}
              aria-label="Previous Month"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              Current month
            </button>
            <button
              onClick={nextMonth}
              aria-label="Next Month"
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main 8-Column Calendar Grid */}
      <div className="flex-1 p-2 lg:p-6 overflow-x-auto min-w-[900px]">
        {/* Grid Header Row (7 Days + 1 Summary) */}
        <div className="grid grid-cols-8 gap-px bg-zinc-800/60 rounded-t-xl overflow-hidden border border-zinc-800/80">
          {WEEK_DAYS.map((day) => (
            <div
              key={day}
              className="bg-zinc-950 py-2 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
          <div className="bg-zinc-950 py-2 px-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-end gap-1">
            <span>Planned + Done</span>
          </div>
        </div>

        {/* Grid Weeks */}
        <div className="flex flex-col gap-px bg-zinc-800/60 border-x border-b border-zinc-800/80 rounded-b-xl overflow-hidden shadow-2xl">
          {calendarWeeks.map((week, wIdx) => {
            // Aggregate Week Totals (Planned + Done)
            let totalDurMin = 0;
            let totalDistKm = 0;
            let totalElevM = 0;
            let totalLoad = 0;
            let doneCount = 0;
            let totalWorkoutsCount = 0;

            week.forEach((day) => {
              // Planned
              day.plannedWorkouts.forEach((pw) => {
                if (matchesSportFilter(pw.type)) {
                  totalWorkoutsCount++;
                  if (pw.isCompleted) doneCount++;
                }
              });
              // Done
              day.doneActivities.forEach((da) => {
                if (matchesSportFilter(da.type)) {
                  totalDurMin += da.durationMinutes || 0;
                  totalDistKm += da.distanceKm || 0;
                  totalElevM += da.elevationM || 0;
                  totalLoad += da.load || 0;
                  doneCount++;
                }
              });
            });

            const durHours = Math.floor(totalDurMin / 60);
            const durRemMin = totalDurMin % 60;
            const durFormatted = `${durHours}:${durRemMin.toString().padStart(2, "0")}`;
            const progressPercent = totalWorkoutsCount > 0 ? Math.min(100, Math.round((doneCount / totalWorkoutsCount) * 100)) : 0;

            return (
              <div key={`week-${wIdx}`} className="grid grid-cols-8 gap-px bg-zinc-800/40 min-h-[140px]">
                {/* 7 Day Columns */}
                {week.map((cell) => {
                  const filteredPlanned = cell.plannedWorkouts.filter((pw) => matchesSportFilter(pw.type));
                  const filteredDone = cell.doneActivities.filter((da) => matchesSportFilter(da.type));

                  return (
                    <div
                      key={cell.dateStr}
                      className={cn(
                        "relative bg-zinc-950 p-2 flex flex-col justify-between transition-colors group hover:bg-zinc-900/60",
                        !cell.isCurrentMonth && "bg-zinc-950/40 text-zinc-600",
                        cell.isToday && "ring-1 ring-inset ring-cyan-500/40 bg-cyan-950/10"
                      )}
                    >
                      {/* Day Header (Number + Add Button) */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={cn(
                            "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                            cell.isToday
                              ? "bg-red-500/20 text-red-400 font-bold border border-red-500/30"
                              : cell.isCurrentMonth
                              ? "text-zinc-300"
                              : "text-zinc-600"
                          )}
                        >
                          {cell.dayOfMonth}
                        </span>

                        <button
                          onClick={() => setAddWorkoutDate(cell.dateStr)}
                          aria-label="Add workout"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Workouts Container */}
                      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto max-h-[120px] scrollbar-none">
                        {/* Done Activities */}
                        {filteredDone.map((act) => (
                          <div
                            key={act.id}
                            onClick={() => setSelectedWorkout(act)}
                            className={cn(
                              "p-1.5 rounded-md border text-[11px] font-medium flex items-center justify-between gap-1 shadow-sm cursor-pointer transition-all hover:scale-[1.02]",
                              act.type === "running" && "bg-emerald-950/40 border-emerald-800/40 text-emerald-300 hover:border-emerald-500",
                              act.type === "cycling" && "bg-cyan-950/40 border-cyan-800/40 text-cyan-300 hover:border-cyan-500",
                              act.type === "swimming" && "bg-sky-950/40 border-sky-800/40 text-sky-300 hover:border-sky-500",
                              act.type === "gym" && "bg-amber-950/40 border-amber-800/40 text-amber-300 hover:border-amber-500"
                            )}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {act.type === "running" && <Activity className="w-3 h-3 flex-shrink-0" />}
                              {act.type === "cycling" && <Bike className="w-3 h-3 flex-shrink-0" />}
                              {act.type === "swimming" && <Waves className="w-3 h-3 flex-shrink-0" />}
                              {act.type === "gym" && <Dumbbell className="w-3 h-3 flex-shrink-0" />}
                              <span className="truncate font-semibold">{act.title}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 flex-shrink-0">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>{act.durationMinutes}m</span>
                            </div>
                          </div>
                        ))}

                        {/* Planned Workouts */}
                        {filteredPlanned.map((pw) => (
                          <div
                            key={pw.id}
                            onClick={() => setSelectedWorkout(pw)}
                            className={cn(
                              "p-1.5 rounded-md border border-dashed text-[11px] font-medium flex items-center justify-between gap-1 transition-all cursor-pointer hover:scale-[1.02]",
                              pw.isCompleted
                                ? "bg-zinc-900/60 border-zinc-700 text-zinc-400 line-through"
                                : pw.type === "running"
                                ? "bg-emerald-950/20 border-emerald-700/50 text-emerald-300 hover:border-emerald-400"
                                : pw.type === "cycling"
                                ? "bg-cyan-950/20 border-cyan-700/50 text-cyan-300 hover:border-cyan-400"
                                : pw.type === "swimming"
                                ? "bg-sky-950/20 border-sky-700/50 text-sky-300 hover:border-sky-400"
                                : "bg-amber-950/20 border-amber-700/50 text-amber-300 hover:border-amber-400"
                            )}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {pw.type === "running" && <Activity className="w-3 h-3 flex-shrink-0" />}
                              {pw.type === "cycling" && <Bike className="w-3 h-3 flex-shrink-0" />}
                              {pw.type === "swimming" && <Waves className="w-3 h-3 flex-shrink-0" />}
                              {pw.type === "gym" && <Dumbbell className="w-3 h-3 flex-shrink-0" />}
                              <span className="truncate">{pw.title}</span>
                            </div>
                            <span className="text-[10px] text-zinc-400 flex-shrink-0">
                              {pw.durationMinutes ? `${pw.durationMinutes}m` : pw.distanceKm ? `${pw.distanceKm}k` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* 8th Column: Week Summary (Planned + Done) */}
                <div className="bg-zinc-950 p-3 flex flex-col justify-between border-l border-zinc-800/80">
                  <div className="flex flex-col gap-1 text-right">
                    {/* Time */}
                    <div className="text-xs font-bold text-zinc-200 tracking-wide">
                      {durFormatted}
                    </div>
                    {/* Distance */}
                    <div className="text-[11px] font-medium text-zinc-400">
                      {totalDistKm > 0 ? `${totalDistKm.toFixed(2)} km` : "0.00 km"}
                    </div>
                    {/* Elevation */}
                    <div className="text-[11px] font-medium text-zinc-400">
                      {totalElevM > 0 ? `${totalElevM} m` : "0 m"}
                    </div>
                    {/* Load */}
                    <div className="text-[11px] font-bold text-cyan-400 flex items-center justify-end gap-1">
                      <span>{totalLoad} load</span>
                    </div>
                  </div>

                  {/* Visual Progress / Compliance Indicator */}
                  <div className="mt-3 flex flex-col gap-1">
                    <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 flex">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-500">
                      <span>Progress</span>
                      <span>{progressPercent}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template Library Drawer / Modal */}
      <AnimatePresence>
        {templateLibraryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-base font-bold text-zinc-100">Template Library</h2>
                </div>
                <button
                  onClick={() => setTemplateLibraryOpen(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
                {/* Gym Templates */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Dumbbell className="w-3.5 h-3.5 text-amber-400" />
                    <span>Kraftsport Routinen ({gymTemplates.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {gymTemplates.map((gt) => (
                      <div
                        key={gt.id}
                        className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-amber-500/50 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="font-semibold text-xs text-zinc-200">{gt.name}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{gt.exercises?.length || 0} Übungen</div>
                        </div>
                        <button
                          onClick={() => {
                            setTemplateLibraryOpen(false);
                            setAddWorkoutDate(getLocalDateString());
                          }}
                          className="mt-2 text-left text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
                        >
                          + Auf Kalender planen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Endurance Templates */}
                <div>
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Ausdauer Routinen ({enduranceTemplates.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {enduranceTemplates.map((et) => (
                      <div
                        key={et.id}
                        className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-cyan-500/50 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="font-semibold text-xs text-zinc-200">{et.name}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {et.type} • {et.estimatedDuration || "45 Min"}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setTemplateLibraryOpen(false);
                            setAddWorkoutDate(getLocalDateString());
                          }}
                          className="mt-2 text-left text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        >
                          + Auf Kalender planen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Add / Plan Dialog */}
      {addWorkoutDate && (
        <ScheduleDialog
          workoutTitle="Trainingseinheit planen"
          mode="calendar"
          onClose={() => setAddWorkoutDate(null)}
          onPickDay={(dayIndex: number) => {
            setAddWorkoutDate(null);
          }}
        />
      )}

      {/* Workout Detail Modal */}
      <AnimatePresence>
        {selectedWorkout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">{selectedWorkout.title}</h3>
                    <span className="text-[11px] text-zinc-400 capitalize">{selectedWorkout.type}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-zinc-500 block mb-1">Dauer</span>
                  <span className="font-bold text-zinc-200">{selectedWorkout.durationMinutes || 0} Min</span>
                </div>
                <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                  <span className="text-zinc-500 block mb-1">Distanz / Last</span>
                  <span className="font-bold text-cyan-400">
                    {selectedWorkout.distanceKm ? `${selectedWorkout.distanceKm} km` : `${selectedWorkout.load || 0} TSS`}
                  </span>
                </div>
              </div>

              {selectedWorkout.description && (
                <div className="text-xs text-zinc-400 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  {selectedWorkout.description}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
                >
                  Schließen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
