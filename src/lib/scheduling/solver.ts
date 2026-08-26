import type {
  FreeWindow,
  ScheduledWorkout,
  SessionBlueprint,
  SolveDiagnostics,
  SolveResult,
  SchedulingPreferences,
  UnplacedSession,
} from "./types";
import { mergePreferences, SESSION_CATEGORY_COLOR_IDS } from "./types";
import {
  ceilToGrid,
  dayFullName,
  formatMinutes,
  isoAddDays,
} from "./time";
import {
  computeFreeWindows,
  dayIndexOfLargestWindow,
  findContainingWindow,
  largestWindowLengthByDay,
} from "./windows";
import { sanitizeBusyEvents } from "./windows";
import {
  checkPairViolations,
  isHeavyLowerSession,
  isIntervalSession,
  isLongEnduranceSession,
  longRideCostDelta,
  recoveryCostDelta,
  staticCostFloor,
  timeOfDayCostDelta,
  type Placement,
  type StaticDayContext,
} from "./constraints";
import { costBreakdownOf, explainPlacement, type ExplainEntry } from "./explain";

const NODE_BUDGET = 200_000;
const EPS = 1e-9;

interface AssignmentEntry extends Placement {
  windowStartMin: number;
  windowEndMin: number;
}

interface SearchOutcome {
  entries: AssignmentEntry[];
  cost: number;
  signature: string;
}

export interface SolveScheduleInput {
  sessions: SessionBlueprint[];
  busy_events?: unknown;
  preferences?: unknown;
  week_start_date?: string;
}

function sessionOrderKey(s: SessionBlueprint, index: number): number[] {
  const interferenceRank = isHeavyLowerSession(s) || isIntervalSession(s) ? 0 : 1;
  return [interferenceRank, -s.duration_min, s.priority, index];
}

function orderSessions(sessions: SessionBlueprint[]): SessionBlueprint[] {
  return sessions
    .map((session, index) => ({ session, key: sessionOrderKey(session, index) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) {
        if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      }
      return 0;
    })
    .map((x) => x.session);
}

function signatureOf(entries: AssignmentEntry[]): string {
  return entries
    .map((e) => `${e.session.id}|${e.dayIndex}|${e.startMin}`)
    .sort()
    .join(";");
}

function incrementalCost(
  candidate: Placement,
  placed: (AssignmentEntry | null)[],
  prefs: SchedulingPreferences,
  ctx: StaticDayContext,
  containingWindowLength: number
): number {
  let cost = 0;
  const heavyDays: number[] = [];
  for (const entry of placed) {
    if (!entry) continue;
    if (isHeavyLowerSession(entry.session)) heavyDays.push(entry.dayIndex);
  }
  cost += recoveryCostDelta(candidate.dayIndex, heavyDays, prefs.weights);
  if (isLongEnduranceSession(candidate.session)) {
    cost += longRideCostDelta(
      candidate.dayIndex,
      containingWindowLength,
      candidate.session.duration_min,
      ctx,
      prefs.weights
    );
  }
  cost += timeOfDayCostDelta(
    candidate.session.category,
    candidate.startMin,
    candidate.endMin,
    prefs
  );
  return cost;
}

function runSearch(
  sessions: SessionBlueprint[],
  freeWindows: FreeWindow[],
  prefs: SchedulingPreferences
): { outcome: SearchOutcome | null; nodes: number } {
  const ordered = orderSessions(sessions);
  const n = ordered.length;
  if (n === 0) return { outcome: { entries: [], cost: 0, signature: "" }, nodes: 0 };

  const granularity = Math.max(1, Math.round(prefs.slot_granularity_min));
  const capacity = prefs.max_daily_training_min;
  const buffer = prefs.buffer_minutes;

  const windowsByDay: FreeWindow[][] = Array.from({ length: 7 }, () => []);
  for (const w of freeWindows) windowsByDay[w.dayIndex].push(w);

  const candidates: Placement[][] = [];
  for (const session of ordered) {
    const perDay: Placement[][] = [];
    for (let day = 0; day < 7; day++) {
      const list: Placement[] = [];
      for (const w of windowsByDay[day]) {
        for (
          let t = ceilToGrid(w.startMin, granularity);
          t + session.duration_min <= w.endMin;
          t += granularity
        ) {
          list.push({
            session,
            dayIndex: day,
            startMin: t,
            endMin: t + session.duration_min,
          });
        }
      }
      perDay.push(list);
    }
    candidates.push(perDay.flat());
  }

  for (const list of candidates) {
    list.sort((a, b) => a.dayIndex - b.dayIndex || a.startMin - b.startMin);
  }

  const floors = ordered.map((s) => staticCostFloor(s, prefs.weights));
  const suffixFloor = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixFloor[i] = suffixFloor[i + 1] + Math.min(0, floors[i]);
  }

  const largestLengths = largestWindowLengthByDay(freeWindows);
  const ctx: StaticDayContext = { largestWindowDay: dayIndexOfLargestWindow(largestLengths) };

  const loads = new Array<number>(7).fill(0);
  const placed: (AssignmentEntry | null)[] = new Array(n).fill(null);

  let best: SearchOutcome | null = null;
  let nodes = 0;

  function dfs(index: number, cost: number): void {
    if (nodes >= NODE_BUDGET) return;
    nodes++;
    if (best && cost + suffixFloor[index] > best.cost + EPS) return;
    if (index === n) {
      const current = placed.filter((p): p is AssignmentEntry => p !== null);
      const signature = signatureOf(current);
      if (
        !best ||
        cost < best.cost - EPS ||
        (Math.abs(cost - best.cost) <= EPS && signature < best.signature)
      ) {
        best = { entries: current.map((e) => ({ ...e })), cost, signature };
      }
      return;
    }

    const session = ordered[index];
    for (const candidate of candidates[index]) {
      if (loads[candidate.dayIndex] + session.duration_min > capacity) continue;

      let hardOk = true;
      for (let j = 0; j < index; j++) {
        const other = placed[j];
        if (!other || other.dayIndex !== candidate.dayIndex) continue;
        if (checkPairViolations(candidate, other, buffer).length > 0) {
          hardOk = false;
          break;
        }
      }
      if (!hardOk) continue;

      const containing = findContainingWindow(
        windowsByDay[candidate.dayIndex],
        candidate.dayIndex,
        candidate.startMin,
        candidate.endMin
      );
      const windowLength = containing ? containing.endMin - containing.startMin : 0;

      const delta =
        cost +
        incrementalCost(candidate, placed.slice(0, index), prefs, ctx, windowLength);

      placed[index] = {
        ...candidate,
        windowStartMin: containing?.startMin ?? candidate.startMin,
        windowEndMin: containing?.endMin ?? candidate.endMin,
      };
      loads[candidate.dayIndex] += session.duration_min;

      dfs(index + 1, delta);

      loads[candidate.dayIndex] -= session.duration_min;
      placed[index] = null;
    }
  }

  dfs(0, 0);

  return { outcome: best, nodes };
}

function diagnoseSession(
  session: SessionBlueprint,
  freeWindows: FreeWindow[],
  prefs: SchedulingPreferences
): string {
  const fittingWindows = freeWindows.filter(
    (w) => w.endMin - w.startMin >= session.duration_min
  );
  if (fittingWindows.length === 0) {
    const lengths = largestWindowLengthByDay(freeWindows);
    let maxLen = 0;
    let maxDay = 0;
    for (let d = 0; d < 7; d++) {
      if (lengths[d] > maxLen) {
        maxLen = lengths[d];
        maxDay = d;
      }
    }
    return `Kein zusammenhängendes Zeitfenster ≥ ${session.duration_min} Min (inkl. ${prefs.buffer_minutes} Min Puffer um Termine). Größtes Fenster: ${maxLen} Min am ${dayFullName(maxDay)}.`;
  }
  if (session.duration_min > prefs.max_daily_training_min) {
    return `Dauer ${session.duration_min} Min übersteigt das tägliche Trainingslimit (${prefs.max_daily_training_min} Min).`;
  }
  if (fittingWindows.length > 0) {
    return `Kein konfliktfreier Slot gefunden: Interferenzregeln (6 h Abstand / Reihenfolge vor hochintensiven Intervallen), Tageslimit oder Puffer-Zeiten blockieren alle passenden Fenster.`;
  }
  return "Platzierung nicht möglich.";
}

export function solveSchedule(input: SolveScheduleInput): SolveResult {
  const prefs = mergePreferences(input.preferences);
  const busyEvents = sanitizeBusyEvents(input.busy_events);
  const sessions = Array.isArray(input.sessions) ? input.sessions.filter(Boolean) : [];
  const weekStartIso = /^\d{4}-\d{2}-\d{2}$/.test(String(input.week_start_date ?? ""))
    ? String(input.week_start_date)
    : "2026-01-05";

  const freeWindows = computeFreeWindows(busyEvents, prefs);

  const warnings: string[] = [];
  const unplaced: UnplacedSession[] = [];

  let pool = [...sessions];
  let outcome: SearchOutcome | null = null;
  let totalNodes = 0;

  while (pool.length > 0) {
    const attempt = runSearch(pool, freeWindows, prefs);
    totalNodes += attempt.nodes;
    if (attempt.outcome) {
      outcome = attempt.outcome;
      break;
    }
    let dropIdx = pool.length - 1;
    let worstPriority = pool[pool.length - 1].priority;
    for (let i = pool.length - 2; i >= 0; i--) {
      if (pool[i].priority > worstPriority) {
        worstPriority = pool[i].priority;
        dropIdx = i;
      }
    }
    const dropped = pool[dropIdx];
    unplaced.push({ session: dropped, reason: diagnoseSession(dropped, freeWindows, prefs) });
    pool = pool.filter((_, i) => i !== dropIdx);
  }

  if (!outcome) {
    return {
      placements: [],
      unplaced: sessions.map((s) => ({
        session: s,
        reason: diagnoseSession(s, freeWindows, prefs),
      })),
      diagnostics: {
        feasible: false,
        total_cost: 0,
        nodes_explored: totalNodes,
        daily_load_min: [0, 0, 0, 0, 0, 0, 0],
        warnings: ["Keine Einheit konnte platziert werden."],
      },
    };
  }

  const largestLengths = largestWindowLengthByDay(freeWindows);
  const largestWindowDay = dayIndexOfLargestWindow(largestLengths);

  const explainEntries: ExplainEntry[] = outcome.entries.map((e) => ({
    session: e.session,
    dayIndex: e.dayIndex,
    startMin: e.startMin,
    endMin: e.endMin,
    windowStartMin: e.windowStartMin,
    windowEndMin: e.windowEndMin,
    isLargestWindowDay: e.dayIndex === largestWindowDay,
  }));

  const placements: ScheduledWorkout[] = outcome.entries.map((entry) => {
    const explainEntry = explainEntries.find((x) => x.session.id === entry.session.id)!;
    return {
      session_id: entry.session.id,
      title: entry.session.title,
      category: entry.session.category,
      sport: entry.session.sport,
      day_index: entry.dayIndex,
      date: isoAddDays(weekStartIso, entry.dayIndex),
      start_time: formatMinutes(entry.startMin),
      end_time: formatMinutes(entry.endMin),
      duration_min: entry.session.duration_min,
      color_id: SESSION_CATEGORY_COLOR_IDS[entry.session.category],
      explanations: explainPlacement(explainEntry, explainEntries, prefs),
      cost_breakdown: costBreakdownOf(explainEntry, explainEntries, prefs),
    };
  });

  placements.sort((a, b) => a.day_index - b.day_index || a.start_time.localeCompare(b.start_time));

  const dailyLoad = new Array<number>(7).fill(0);
  for (const p of placements) {
    dailyLoad[p.day_index] += p.duration_min;
  }

  if (totalNodes >= NODE_BUDGET) {
    warnings.push(
      "Suchbudget erreicht – die gefundene Lösung ist gültig, aber möglicherweise nicht optimal."
    );
  }
  if (unplaced.length > 0) {
    warnings.push(`${unplaced.length} Einheit(en) konnten nicht platziert werden.`);
  }

  const diagnostics: SolveDiagnostics = {
    feasible: unplaced.length === 0,
    total_cost: Math.round(outcome.cost * 100) / 100,
    nodes_explored: totalNodes,
    daily_load_min: dailyLoad,
    warnings,
  };

  return { placements, unplaced, diagnostics };
}
