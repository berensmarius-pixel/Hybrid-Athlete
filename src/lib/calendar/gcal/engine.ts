/**
 * Regelbasierte Planungs-Engine für Hybrid-Workouts im Google Kalender.
 *
 * Pur & deterministisch (kein I/O): nimmt Busy-Slots aus der Google
 * FreeBusy-API + den Wochenplan + Athleten-Regeln und liefert konkrete
 * Platzierungsvorschläge. Vollständig unit-getestet.
 */

import type { DayPlan } from "@/types";
import {
  berlinWeekdayIndex,
  upcomingBerlinDates,
  zonedDateString,
  zonedTimeString,
  zonedToUtcMs,
} from "./timezone";
import type {
  BusyInterval,
  ScheduleProposal,
  SchedulingSettings,
  ScheduledGoogleWorkout,
  SkippedDay,
  SchedulableWorkoutType,
} from "./types";

export interface Interval {
  startMs: number;
  endMs: number;
}

/** Schrittweite (Minuten) beim Abtasten freier Fenster. */
const SLOT_STEP_MIN = 15;
/** Vorlaufzeit: Workouts werden nie früher als 60 Min ab jetzt geplant. */
const LEAD_TIME_MIN = 60;

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    if (iv.endMs <= iv.startMs) continue;
    const last = merged[merged.length - 1];
    if (last && iv.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, iv.endMs);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/** Zieht belegte Intervalle (inkl. Puffer) von einem Tagesfenster ab. */
export function computeFreeWindows(
  window: Interval,
  busy: Interval[],
  bufferMs: number
): Interval[] {
  const clipped: Interval[] = [];
  for (const iv of busy) {
    const start = Math.max(iv.startMs - bufferMs, window.startMs);
    const end = Math.min(iv.endMs + bufferMs, window.endMs);
    if (start < end) clipped.push({ startMs: start, endMs: end });
  }
  const mergedBusy = mergeIntervals(clipped);
  const free: Interval[] = [];
  let cursor = window.startMs;
  for (const iv of mergedBusy) {
    if (iv.startMs > cursor) free.push({ startMs: cursor, endMs: iv.startMs });
    cursor = Math.max(cursor, iv.endMs);
  }
  if (cursor < window.endMs) free.push({ startMs: cursor, endMs: window.endMs });
  return free;
}

interface MatchedPreferred {
  label: string;
  overlapFraction: number;
}

function evaluatePreferredWindows(
  startMs: number,
  durationMs: number,
  weekday: number,
  workoutType: SchedulableWorkoutType,
  settings: SchedulingSettings
): MatchedPreferred | null {
  const endMs = startMs + durationMs;
  let best: MatchedPreferred | null = null;
  for (const w of settings.preferredWindows) {
    if (!w.workoutTypes.includes(workoutType)) continue;
    if (w.daysOfWeek && w.daysOfWeek.length > 0 && !w.daysOfWeek.includes(weekday)) continue;
    const wStart = zonedToUtcMs(zonedDateString(startMs), w.start);
    const wEndRaw = zonedToUtcMs(zonedDateString(startMs), w.end);
    // Fenster über Mitternacht (z.B. 20:00–01:00) auf den Folgetag erweitern
    const wEnd = wEndRaw > wStart ? wEndRaw : wEndRaw + 24 * 60 * 60_000;
    const overlap = Math.max(0, Math.min(endMs, wEnd) - Math.max(startMs, wStart));
    const fraction = overlap / durationMs;
    if (fraction > 0 && (!best || fraction > best.overlapFraction)) {
      best = { label: w.label, overlapFraction: fraction };
    }
  }
  return best;
}

/** Verletzt der Kandidat den Mindestabstand zu bereits platzierten Sessions? */
function violatesGap(candidate: Interval, placed: Interval[], minGapMs: number): boolean {
  return placed.some((p) => {
    // Kandidat liegt nach p bzw. vor p – bei Überlappung wird die Lücke negativ
    const gap =
      candidate.startMs >= p.endMs ? candidate.startMs - p.endMs : p.startMs - candidate.endMs;
    return gap < minGapMs;
  });
}

export interface PlanInput {
  /** Epoch-ms des Planungsbeginns (üblicherweise Date.now()). */
  fromMs: number;
  days: number;
  weeklyPlan: DayPlan[];
  busy: BusyInterval[];
  settings: SchedulingSettings;
  /** Bereits existierende Auto-Einträge – blockieren ihre Slots. */
  existingScheduled?: ScheduledGoogleWorkout[];
}

export interface PlanResult {
  proposals: ScheduleProposal[];
  skipped: SkippedDay[];
}

/**
 * Plant alle Trainingstage im Horizont in die freiesten, regelkonformen
 * Slots. Reihenfolge: chronologisch; pro Tag maximal ein Workout aus dem
 * Wochenplan (weitere bestehende Einträge wirken als Blocker inkl. Gap).
 */
export function planSchedule(input: PlanInput): PlanResult {
  const { fromMs, weeklyPlan, busy, settings, existingScheduled = [] } = input;
  const bufferMs = settings.bufferMinutes * 60_000;
  const minGapMs = settings.minGapHours * 60 * 60_000;
  const earliestAllowed = fromMs + LEAD_TIME_MIN * 60_000;

  const busyMs: Interval[] = busy.map((b) => ({
    startMs: new Date(b.start).getTime(),
    endMs: new Date(b.end).getTime(),
  }));

  // Bestehende Auto-Einträge als physische Blocker (ohne Puffer) behandeln
  const existingByDate = new Map<string, Interval[]>();
  for (const item of existingScheduled) {
    const list = existingByDate.get(item.date) ?? [];
    list.push({
      startMs: zonedToUtcMs(item.date, item.startTime),
      endMs: zonedToUtcMs(item.date, item.endTime),
    });
    existingByDate.set(item.date, list);
  }

  const proposals: ScheduleProposal[] = [];
  const skipped: SkippedDay[] = [];

  for (const date of upcomingBerlinDates(fromMs, input.days)) {
    const dayIndex = berlinWeekdayIndex(date);
    const entry = weeklyPlan.find((d) => d.dayIndex === dayIndex);
    if (!entry || entry.workoutType === "rest") continue;

    const workoutType = entry.workoutType as SchedulableWorkoutType;
    const durationMinutes = settings.durationsMinutes[workoutType] ?? 60;
    const durationMs = durationMinutes * 60_000;
    const title = entry.title || workoutType;
    const description = entry.description ?? "";

    const windowStart = zonedToUtcMs(date, settings.dayStart);
    const windowEnd = zonedToUtcMs(date, settings.dayEnd);
    if (windowEnd - windowStart < durationMs) {
      skipped.push({
        date,
        title,
        reason: `Tagesfenster (${settings.dayStart}–${settings.dayEnd}) kürzer als Workout-Dauer (${durationMinutes} Min).`,
      });
      continue;
    }

    const dayBusy = [
      ...busyMs,
      ...(existingByDate.get(date) ?? []),
    ];

    // Bereits platzierte Sessions dieses Laufs (selber Tag → Gap-Regel)
    const placedToday: Interval[] = proposals
      .filter((p) => p.date === date)
      .map((p) => ({
        startMs: zonedToUtcMs(p.date, p.startTime),
        endMs: zonedToUtcMs(p.date, p.endTime),
      }));

    const free = computeFreeWindows(
      { startMs: windowStart, endMs: windowEnd },
      dayBusy,
      bufferMs
    );

    const weekday = dayIndex;
    let best: {
      startMs: number;
      score: number;
      matched: MatchedPreferred | null;
    } | null = null;

    for (const slot of free) {
      for (let startMs = slot.startMs; startMs + durationMs <= slot.endMs; startMs += SLOT_STEP_MIN * 60_000) {
        if (startMs < earliestAllowed) continue;
        const candidate: Interval = { startMs, endMs: startMs + durationMs };
        if (violatesGap(candidate, [...placedToday, ...(existingByDate.get(date) ?? [])], minGapMs)) {
          continue;
        }
        const matched = evaluatePreferredWindows(startMs, durationMs, weekday, workoutType, settings);
        const score = matched ? Math.round(matched.overlapFraction * 100) : 0;
        if (!best || score > best.score || (score === best.score && startMs < best.startMs)) {
          best = { startMs, score, matched };
        }
        // Perfekter Treffer im frühestmöglichen Slot – weiter Suchen unnötig
        if (best.score === 100 && matched?.overlapFraction === 1) break;
      }
      if (best?.score === 100) break;
    }

    if (!best) {
      skipped.push({
        date,
        title,
        reason: `Kein freies Zeitfenster ≥ ${durationMinutes} Min${settings.bufferMinutes ? ` (inkl. ${settings.bufferMinutes} Min Puffer)` : ""} zwischen ${settings.dayStart} und ${settings.dayEnd}.`,
      });
      continue;
    }

    const endMs = best.startMs + durationMs;
    const reason = buildReason(best.matched, best.score, settings);
    proposals.push({
      id: `${date}_${workoutType}`,
      date,
      startTime: zonedTimeString(best.startMs),
      endTime: zonedTimeString(endMs),
      workoutType,
      title,
      description,
      durationMinutes,
      score: best.score,
      reason,
    });
  }

  return { proposals, skipped };
}

function buildReason(matched: MatchedPreferred | null, score: number, settings: SchedulingSettings): string {
  if (matched && score >= 80) {
    return `Optimal im bevorzugten Fenster „${matched.label}“ platziert (${Math.round(matched.overlapFraction * 100)} % Überdeckung).`;
  }
  if (matched) {
    return `Teilweise im bevorzugten Fenster „${matched.label}“ (${Math.round(matched.overlapFraction * 100)} % Überdeckung) – beste verfügbare Option.`;
  }
  return `Kein bevorzugtes Fenster verfügbar – frühester regelkonformer Slot mit ${settings.bufferMinutes} Min Termin-Puffer.`;
}
