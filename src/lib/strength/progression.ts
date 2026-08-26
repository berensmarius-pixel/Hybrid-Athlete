import type { GymSession, LoggedSession, SetType } from "@/types";

export type OneRmFormulaId = "epley" | "brzycki" | "wathan";

export interface OneRmBreakdown {
  epley: number;
  brzycki: number;
  wathan: number;
  average: number;
}

export interface EffortInput {
  rpe?: number | "";
  rir?: number | "";
}

export interface OneRmInput extends EffortInput {
  weight: number;
  reps: number;
}

export type PrKind = "e1rm" | "rep3" | "rep5" | "setVolume";

export const PR_KINDS: readonly PrKind[] = ["e1rm", "rep3", "rep5", "setVolume"];

export const PR_LABELS: Record<PrKind, string> = {
  e1rm: "All-time e1RM",
  rep3: "Best 3RM",
  rep5: "Best 5RM",
  setVolume: "Set-Volumen",
};

export interface PrRecord {
  kind: PrKind;
  value: number;
  weight: number;
  reps: number;
  date: string;
  sessionId?: string;
}

export type PrSlot = Record<PrKind, PrRecord | null>;

export type PrBook = Map<string, PrSlot>;

export interface DetectedPrGroup {
  exerciseName: string;
  records: PrRecord[];
}

export interface ProgressionSet extends EffortInput {
  weight: number | "";
  reps: number | "";
  isCompleted?: boolean;
  type?: SetType;
}

export interface NormalizedSet {
  weight: number;
  reps: number;
  rpe: number;
  e1rm: number;
  volumeKg: number;
}

export interface E1rmDataPoint {
  date: string;
  sessionId: string;
  e1rm: number;
  volumeKg: number;
  topWeight: number;
  topReps: number;
}

export interface TrackedExercise {
  name: string;
  sessionCount: number;
}

export interface ProgressionOptions {
  plateIncrementKg?: number;
  repRangeMin?: number;
  repRangeMax?: number;
}

export interface ProgressionRecommendation {
  action: "increase_weight" | "increase_reps" | "hold";
  targetWeight: number;
  targetReps: number;
  headline: string;
  reason: string;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function keyOf(exerciseName: string): string {
  return exerciseName.trim().toLowerCase();
}

function createEmptySlot(): PrSlot {
  return { e1rm: null, rep3: null, rep5: null, setVolume: null };
}

function formatNumber(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

export function resolveRpe(effort?: EffortInput): number {
  if (typeof effort?.rpe === "number" && Number.isFinite(effort.rpe)) {
    return Math.min(10, Math.max(1, effort.rpe));
  }
  if (typeof effort?.rir === "number" && Number.isFinite(effort.rir)) {
    return Math.min(10, Math.max(1, 10 - effort.rir));
  }
  return 10;
}

export function resolveEffectiveReps(reps: number, effort?: EffortInput): number {
  const reserve = 10 - resolveRpe(effort);
  return Math.max(1, Math.round(reps + reserve));
}

export function estimateEpley(weight: number, effectiveReps: number): number {
  return weight * (1 + effectiveReps / 30);
}

export function estimateBrzycki(weight: number, effectiveReps: number): number {
  const safeReps = Math.min(effectiveReps, 36.9);
  return (weight * 36) / (37 - safeReps);
}

export function estimateWathan(weight: number, effectiveReps: number): number {
  return (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * effectiveReps));
}

export function estimate1RM({ weight, reps, rpe, rir }: OneRmInput): OneRmBreakdown {
  const effort = { rpe, rir };
  if (reps === 1 && resolveRpe(effort) >= 10) {
    const exact = round1(weight);
    return { epley: exact, brzycki: exact, wathan: exact, average: exact };
  }
  const effectiveReps = resolveEffectiveReps(reps, effort);
  const epley = round1(estimateEpley(weight, effectiveReps));
  const brzycki = round1(estimateBrzycki(weight, effectiveReps));
  const wathan = round1(estimateWathan(weight, effectiveReps));
  return { epley, brzycki, wathan, average: round1((epley + brzycki + wathan) / 3) };
}

export function normalizeCompletedSet(set: ProgressionSet): NormalizedSet | null {
  if (set.type === "warmup") return null;
  if (set.isCompleted === false) return null;
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null;
  if (weight <= 0 || reps <= 0) return null;
  const rpe = resolveRpe(set);
  return {
    weight,
    reps,
    rpe,
    e1rm: estimate1RM({ weight, reps, rpe }).average,
    volumeKg: round1(weight * reps),
  };
}

export function chronologicalGymSessions(sessions: LoggedSession[]): GymSession[] {
  return sessions
    .filter((s): s is GymSession => s.kind !== "endurance")
    .sort((a, b) => a.date.localeCompare(b.date));
}

function candidateValue(kind: PrKind, s: NormalizedSet): number {
  switch (kind) {
    case "e1rm":
      return s.e1rm;
    case "rep3":
      return s.reps === 3 ? s.weight : NaN;
    case "rep5":
      return s.reps === 5 ? s.weight : NaN;
    case "setVolume":
      return s.volumeKg;
  }
}

export function buildPrBook(sessions: LoggedSession[]): PrBook {
  const book: PrBook = new Map();
  for (const session of chronologicalGymSessions(sessions)) {
    for (const entry of session.entries) {
      const key = keyOf(entry.exercise);
      if (!key) continue;
      const slot = book.get(key) ?? createEmptySlot();
      for (const set of entry.sets) {
        const n = normalizeCompletedSet(set);
        if (!n) continue;
        for (const kind of PR_KINDS) {
          const value = candidateValue(kind, n);
          if (!Number.isFinite(value)) continue;
          const current = slot[kind];
          if (!current || value > current.value) {
            slot[kind] = { kind, value, weight: n.weight, reps: n.reps, date: session.date, sessionId: session.id };
          }
        }
      }
      book.set(key, slot);
    }
  }
  return book;
}

export function detectNewStrengthPRs(session: GymSession, baseline: PrBook): DetectedPrGroup[] {
  const groups: DetectedPrGroup[] = [];
  for (const entry of session.entries) {
    const name = entry.exercise.trim();
    const key = keyOf(name);
    if (!key) continue;
    const slot = baseline.get(key) ?? createEmptySlot();
    const records: PrRecord[] = [];
    for (const set of entry.sets) {
      const n = normalizeCompletedSet(set);
      if (!n) continue;
      for (const kind of PR_KINDS) {
        const value = candidateValue(kind, n);
        if (!Number.isFinite(value)) continue;
        const current = slot[kind];
        if (current && value <= current.value) continue;
        const record: PrRecord = { kind, value, weight: n.weight, reps: n.reps, date: session.date, sessionId: session.id };
        const idx = records.findIndex((r) => r.kind === kind);
        if (idx >= 0) {
          if (record.value > records[idx].value) records[idx] = record;
        } else {
          records.push(record);
        }
      }
    }
    if (records.length > 0) groups.push({ exerciseName: name, records });
  }
  return groups;
}

export function applyPrGroups(book: PrBook, groups: DetectedPrGroup[]): PrBook {
  const next = new Map(book);
  for (const group of groups) {
    const key = keyOf(group.exerciseName);
    const slot = next.get(key) ?? createEmptySlot();
    for (const record of group.records) {
      const current = slot[record.kind];
      if (!current || record.value > current.value) slot[record.kind] = record;
    }
    next.set(key, slot);
  }
  return next;
}

export function buildE1rmSeries(sessions: LoggedSession[], exerciseName: string): E1rmDataPoint[] {
  const key = keyOf(exerciseName);
  const points: E1rmDataPoint[] = [];
  for (const session of chronologicalGymSessions(sessions)) {
    let best: NormalizedSet | null = null;
    let volumeKg = 0;
    for (const entry of session.entries) {
      if (keyOf(entry.exercise) !== key) continue;
      for (const set of entry.sets) {
        const n = normalizeCompletedSet(set);
        if (!n) continue;
        volumeKg += n.volumeKg;
        if (!best || n.e1rm > best.e1rm) best = n;
      }
    }
    if (!best) continue;
    points.push({
      date: session.date,
      sessionId: session.id,
      e1rm: best.e1rm,
      volumeKg: round1(volumeKg),
      topWeight: best.weight,
      topReps: best.reps,
    });
  }
  return points;
}

export function listTrackedExercises(sessions: LoggedSession[]): TrackedExercise[] {
  const counts = new Map<string, TrackedExercise>();
  for (const session of chronologicalGymSessions(sessions)) {
    for (const entry of session.entries) {
      const key = keyOf(entry.exercise);
      if (!key) continue;
      const hit = counts.get(key);
      if (hit) {
        hit.sessionCount += 1;
      } else {
        counts.set(key, { name: entry.exercise.trim(), sessionCount: 1 });
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name)
  );
}

export function getExerciseSets(session: GymSession, exerciseName: string): ProgressionSet[] {
  const key = keyOf(exerciseName);
  return session.entries
    .filter((entry) => keyOf(entry.exercise) === key)
    .flatMap((entry) => entry.sets);
}

export function findLastExerciseSession(sessions: LoggedSession[], exerciseName: string): GymSession | null {
  const key = keyOf(exerciseName);
  let found: GymSession | null = null;
  for (const session of chronologicalGymSessions(sessions)) {
    if (session.entries.some((entry) => keyOf(entry.exercise) === key)) found = session;
  }
  return found;
}

const PROGRESSION_DEFAULTS = { plateIncrementKg: 2.5, repRangeMin: 6, repRangeMax: 10 };

function roundUpToPlate(weight: number, increment: number): number {
  return Math.ceil((weight + 0.01) / increment) * increment;
}

export function recommendProgression(
  sets: ProgressionSet[],
  options: ProgressionOptions = {}
): ProgressionRecommendation | null {
  const cfg = { ...PROGRESSION_DEFAULTS, ...options };
  const completed = sets
    .map((set) => normalizeCompletedSet(set))
    .filter((n): n is NormalizedSet => n !== null);
  if (completed.length === 0) return null;

  const reference = completed.reduce((best, n) => (n.e1rm > best.e1rm ? n : best), completed[0]);
  const rpeText = formatNumber(reference.rpe);

  if (reference.rpe <= 7.5) {
    const targetWeight = roundUpToPlate(reference.weight, cfg.plateIncrementKg);
    return {
      action: "increase_weight",
      targetWeight,
      targetReps: reference.reps,
      headline: `+${formatNumber(targetWeight - reference.weight)} kg nächste Woche`,
      reason: `Top-Set bei RPE ${rpeText} – genug Reserve im Tank, um das Gewicht progressiv zu steigern.`,
    };
  }

  if (reference.rpe < 9.5) {
    if (reference.reps < cfg.repRangeMax) {
      return {
        action: "increase_reps",
        targetWeight: reference.weight,
        targetReps: reference.reps + 1,
        headline: `+1 Wdh. bei ${formatNumber(reference.weight)} kg`,
        reason: `RPE ${rpeText} im Zielbereich – Doppelprogression: erst Wiederholungen aufbauen, dann Gewicht erhöhen.`,
      };
    }
    const targetWeight = roundUpToPlate(reference.weight, cfg.plateIncrementKg);
    return {
      action: "increase_weight",
      targetWeight,
      targetReps: cfg.repRangeMin,
      headline: `${formatNumber(targetWeight)} kg × ${cfg.repRangeMin} Wdh.`,
      reason: `Obere Wiederholungsgrenze bei RPE ${rpeText} erreicht – Gewicht rauf und Wiederholungen zurücksetzen.`,
    };
  }

  return {
    action: "hold",
    targetWeight: reference.weight,
    targetReps: reference.reps,
    headline: `Gewicht bei ${formatNumber(reference.weight)} kg halten`,
    reason: `RPE ${rpeText} nahe am Muskelversagen – Leistung konsolidieren, bevor die nächste Steigerung kommt.`,
  };
}
