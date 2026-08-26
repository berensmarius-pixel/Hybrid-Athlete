import type {
  SessionBlueprint,
  SessionCategory,
  SchedulingPreferences,
  SolverWeights,
} from "./types";

export const MIN_INTERFERENCE_GAP_MIN = 360;

const HEAVY_MUSCLE_GROUPS = new Set([
  "quads",
  "quadriceps",
  "hamstrings",
  "glutes",
  "legs",
  "leg",
  "beine",
  "untermkörper",
  "unterkörper",
  "lower body",
]);

export interface Placement {
  session: SessionBlueprint;
  dayIndex: number;
  startMin: number;
  endMin: number;
}

export function isHeavyLowerSession(s: SessionBlueprint): boolean {
  if (s.category === "strength_heavy_lower") return true;
  if (s.sport !== "gym" || s.intensity_tier !== "High") return false;
  return s.target_muscle_groups.some((m) => HEAVY_MUSCLE_GROUPS.has(m.trim().toLowerCase()));
}

export function isIntervalSession(s: SessionBlueprint): boolean {
  return s.category === "intervals_high";
}

export function isMaxEffortInterval(s: SessionBlueprint): boolean {
  return s.category === "intervals_high" && s.intensity_tier === "High";
}

export function isLongEnduranceSession(s: SessionBlueprint): boolean {
  return s.category === "endurance_long";
}

export type PairViolation = "workout_overlap" | "interference_gap" | "max_effort_order";

export function checkPairViolations(a: Placement, b: Placement, bufferMin: number): PairViolation[] {
  const violations: PairViolation[] = [];
  if (a.dayIndex !== b.dayIndex) return violations;

  const gapBetween = Math.max(
    a.startMin - b.endMin,
    b.startMin - a.endMin
  );
  if (gapBetween < bufferMin) {
    violations.push("workout_overlap");
  }

  const aHeavy = isHeavyLowerSession(a.session);
  const bHeavy = isHeavyLowerSession(b.session);
  const aInterval = isIntervalSession(a.session);
  const bInterval = isIntervalSession(b.session);

  let heavy: Placement | null = null;
  let interval: Placement | null = null;
  if (aHeavy && bInterval) {
    heavy = a;
    interval = b;
  } else if (bHeavy && aInterval) {
    heavy = b;
    interval = a;
  }

  if (heavy && interval) {
    const gap =
      heavy.startMin < interval.startMin
        ? interval.startMin - heavy.endMin
        : interval.startMin === heavy.startMin
          ? -1
          : heavy.startMin - interval.endMin;
    if (gap < MIN_INTERFERENCE_GAP_MIN) {
      violations.push("interference_gap");
    }
    if (isMaxEffortInterval(interval.session) && heavy.startMin > interval.startMin) {
      violations.push("max_effort_order");
    }
  }

  return violations;
}

export interface StaticDayContext {
  largestWindowDay: number;
}

export function recoveryCostDelta(
  candidateDayIndex: number,
  placedHeavyDays: number[],
  weights: SolverWeights
): number {
  let cost = 0;
  for (const day of placedHeavyDays) {
    const dayGap = Math.abs(candidateDayIndex - day);
    const deficitHours = Math.max(0, 48 - dayGap * 24);
    cost += weights.recovery_per_hour * deficitHours;
    if (dayGap === 0) {
      cost += weights.same_day_heavy_penalty;
    }
  }
  return cost;
}

export function longRideCostDelta(
  candidateDayIndex: number,
  containingWindowLength: number,
  durationMin: number,
  ctx: StaticDayContext,
  weights: SolverWeights
): number {
  let cost = 0;
  if (candidateDayIndex >= 5) {
    cost -= weights.weekend_long_ride_bonus;
  }
  if (candidateDayIndex === ctx.largestWindowDay) {
    const slackHours = Math.max(0, containingWindowLength - durationMin) / 60;
    const factor = Math.min(1, slackHours / 3);
    cost -= weights.largest_slot_long_ride_bonus * factor;
  }
  return cost;
}

export function timeOfDayCostDelta(
  category: SessionCategory,
  startMin: number,
  endMin: number,
  prefs: SchedulingPreferences
): number {
  const windows = prefs.preferred_windows[category] ?? [];
  if (windows.length === 0) return 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const w of windows) {
    const outsideBefore = Math.max(0, w.startMin - startMin);
    const outsideAfter = Math.max(0, endMin - w.endMin);
    const distance = Math.max(outsideBefore, outsideAfter);
    bestDistance = Math.min(bestDistance, distance);
  }
  return (bestDistance / 60) * prefs.weights.time_of_day_per_hour;
}

export function staticCostFloor(s: SessionBlueprint, weights: SolverWeights): number {
  if (!isLongEnduranceSession(s)) return 0;
  return -(weights.weekend_long_ride_bonus + weights.largest_slot_long_ride_bonus);
}
