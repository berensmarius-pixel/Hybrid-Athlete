import type { WorkoutType } from "@/types";

export type SessionCategory =
  | "strength_heavy_lower"
  | "strength_upper"
  | "intervals_high"
  | "endurance_long"
  | "endurance_low"
  | "recovery";

export type SessionSport = Extract<WorkoutType, "gym" | "cycling" | "running" | "mobility">;
export type IntensityTier = "High" | "Med" | "Low";
export type ImpactLevel = "High" | "Low";

export interface SessionBlueprint {
  id: string;
  title: string;
  sport: SessionSport;
  category: SessionCategory;
  duration_min: number;
  intensity_tier: IntensityTier;
  target_muscle_groups: string[];
  aerobic_impact: ImpactLevel;
  priority: number;
  notes?: string;
}

export interface BusyBlockInput {
  id?: string;
  title?: string;
  day_index: number;
  start_time: string;
  end_time: string;
}

export interface FreeWindow {
  dayIndex: number;
  startMin: number;
  endMin: number;
}

export interface PreferredWindow {
  startMin: number;
  endMin: number;
}

export interface SolverWeights {
  recovery_per_hour: number;
  same_day_heavy_penalty: number;
  weekend_long_ride_bonus: number;
  largest_slot_long_ride_bonus: number;
  time_of_day_per_hour: number;
}

export interface SchedulingPreferences {
  buffer_minutes: number;
  max_daily_training_min: number;
  slot_granularity_min: number;
  day_window: PreferredWindow;
  preferred_windows: Record<SessionCategory, PreferredWindow[]>;
  weights: SolverWeights;
}

export const DEFAULT_WEIGHTS: SolverWeights = {
  recovery_per_hour: 6,
  same_day_heavy_penalty: 60,
  weekend_long_ride_bonus: 40,
  largest_slot_long_ride_bonus: 30,
  time_of_day_per_hour: 10,
};

export const DEFAULT_DAY_WINDOW: PreferredWindow = { startMin: 360, endMin: 1320 };

export const DEFAULT_PREFERRED_WINDOWS: Record<SessionCategory, PreferredWindow[]> = {
  strength_heavy_lower: [{ startMin: 960, endMin: 1200 }],
  strength_upper: [{ startMin: 960, endMin: 1230 }],
  intervals_high: [{ startMin: 930, endMin: 1110 }],
  endurance_long: [{ startMin: 480, endMin: 840 }],
  endurance_low: [{ startMin: 540, endMin: 1170 }],
  recovery: [
    { startMin: 360, endMin: 630 },
    { startMin: 1140, endMin: 1290 },
  ],
};

export const DEFAULT_PREFERENCES: SchedulingPreferences = {
  buffer_minutes: 30,
  max_daily_training_min: 240,
  slot_granularity_min: 15,
  day_window: DEFAULT_DAY_WINDOW,
  preferred_windows: DEFAULT_PREFERRED_WINDOWS,
  weights: DEFAULT_WEIGHTS,
};

export const SESSION_CATEGORY_COLOR_IDS: Record<SessionCategory, string> = {
  strength_heavy_lower: "3",
  strength_upper: "9",
  intervals_high: "11",
  endurance_long: "4",
  endurance_low: "2",
  recovery: "10",
};

export const CATEGORY_LABELS_DE: Record<SessionCategory, string> = {
  strength_heavy_lower: "Kraft Unterkörper (schwer)",
  strength_upper: "Kraft Oberkörper",
  intervals_high: "Intervalle hochintensiv",
  endurance_long: "Lange Ausdauereinheit",
  endurance_low: "Grundlagenausdauer",
  recovery: "Regeneration",
};

export const VALID_CATEGORIES: readonly SessionCategory[] = Object.keys(
  CATEGORY_LABELS_DE
) as readonly SessionCategory[];

export interface CostBreakdown {
  recovery: number;
  long_ride: number;
  time_of_day: number;
  total: number;
}

export interface ScheduledWorkout {
  session_id: string;
  title: string;
  category: SessionCategory;
  sport: SessionSport;
  day_index: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  color_id: string;
  explanations: string[];
  cost_breakdown: CostBreakdown;
}

export interface UnplacedSession {
  session: SessionBlueprint;
  reason: string;
}

export interface SolveDiagnostics {
  feasible: boolean;
  total_cost: number;
  nodes_explored: number;
  daily_load_min: number[];
  warnings: string[];
}

export interface SolveResult {
  placements: ScheduledWorkout[];
  unplaced: UnplacedSession[];
  diagnostics: SolveDiagnostics;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeWindows(raw: unknown): PreferredWindow[] | null {
  if (!Array.isArray(raw)) return null;
  const windows: PreferredWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const w = item as Partial<PreferredWindow>;
    const s = clampNumber(w.startMin, 0, 1440, NaN);
    let e = clampNumber(w.endMin, 0, 1440, NaN);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    e = Math.min(e, 1440);
    windows.push({ startMin: Math.round(s), endMin: Math.round(e) });
  }
  return windows.length > 0 ? windows : null;
}

export function mergePreferences(raw: unknown): SchedulingPreferences {
  const base = DEFAULT_PREFERENCES;
  if (!raw || typeof raw !== "object") return { ...base };
  const input = raw as Partial<SchedulingPreferences>;
  const dayWindow =
    sanitizeWindows([input.day_window ?? {}])?.[0] ?? { ...base.day_window };
  const preferred = { ...base.preferred_windows };
  if (input.preferred_windows && typeof input.preferred_windows === "object") {
    for (const key of Object.keys(base.preferred_windows) as SessionCategory[]) {
      const sanitized = sanitizeWindows(
        (input.preferred_windows as Record<string, unknown>)[key]
      );
      if (sanitized) preferred[key] = sanitized;
    }
  }
  const weightsInput = (input.weights ?? {}) as Partial<SolverWeights>;
  return {
    buffer_minutes: clampNumber(input.buffer_minutes, 0, 120, base.buffer_minutes),
    max_daily_training_min: clampNumber(
      input.max_daily_training_min,
      30,
      720,
      base.max_daily_training_min
    ),
    slot_granularity_min: clampNumber(
      input.slot_granularity_min,
      5,
      60,
      base.slot_granularity_min
    ),
    day_window: dayWindow,
    preferred_windows: preferred,
    weights: {
      recovery_per_hour: clampNumber(weightsInput.recovery_per_hour, 0, 200, base.weights.recovery_per_hour),
      same_day_heavy_penalty: clampNumber(
        weightsInput.same_day_heavy_penalty,
        0,
        500,
        base.weights.same_day_heavy_penalty
      ),
      weekend_long_ride_bonus: clampNumber(
        weightsInput.weekend_long_ride_bonus,
        0,
        500,
        base.weights.weekend_long_ride_bonus
      ),
      largest_slot_long_ride_bonus: clampNumber(
        weightsInput.largest_slot_long_ride_bonus,
        0,
        500,
        base.weights.largest_slot_long_ride_bonus
      ),
      time_of_day_per_hour: clampNumber(
        weightsInput.time_of_day_per_hour,
        0,
        200,
        base.weights.time_of_day_per_hour
      ),
    },
  };
}
