import type { ScheduledWorkout, SessionBlueprint, SchedulingPreferences } from "./types";
import { CATEGORY_LABELS_DE } from "./types";
import {
  isHeavyLowerSession,
  isIntervalSession,
  isLongEnduranceSession,
  isMaxEffortInterval,
  MIN_INTERFERENCE_GAP_MIN,
  timeOfDayCostDelta,
} from "./constraints";
import { dayFullName, formatMinutes } from "./time";

export interface ExplainEntry {
  session: SessionBlueprint;
  dayIndex: number;
  startMin: number;
  endMin: number;
  windowStartMin: number;
  windowEndMin: number;
  isLargestWindowDay: boolean;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function explainPlacement(
  entry: ExplainEntry,
  allEntries: ExplainEntry[],
  prefs: SchedulingPreferences
): string[] {
  const reasons: string[] = [];
  const weights = prefs.weights;

  reasons.push(
    `Freies Fenster ${formatMinutes(entry.windowStartMin)}–${formatMinutes(
      entry.windowEndMin
    )} (${Math.round(entry.windowEndMin - entry.windowStartMin)} Min) am ${dayFullName(
      entry.dayIndex
    )}`
  );

  for (const other of allEntries) {
    if (other === entry || other.dayIndex !== entry.dayIndex) continue;
    const pair = [entry, other];
    const heavy = pair.find((p) => isHeavyLowerSession(p.session));
    const interval = pair.find((p) => isIntervalSession(p.session));
    if (heavy && interval) {
      const gap =
        heavy.startMin < interval.startMin
          ? interval.startMin - heavy.endMin
          : heavy.startMin - interval.endMin;
      reasons.push(
        `Interferenzregel aktiv: ≥${MIN_INTERFERENCE_GAP_MIN / 60} h Abstand zu „${
          other.session.title
        }“ (${round1(gap / 60)} h Abstand eingehalten)`
      );
      if (isMaxEffortInterval(interval.session)) {
        reasons.push(
          `Reihenfolge erzwungen: „${entry.session.title}“ liegt vor Max-Effort-Intervallen`
        );
      }
    }
  }

  const heavyPeers = allEntries.filter(
    (p) => p !== entry && isHeavyLowerSession(p.session) && isHeavyLowerSession(entry.session)
  );
  for (const peer of heavyPeers) {
    const dayGap = Math.abs(peer.dayIndex - entry.dayIndex);
    if (dayGap >= 2) {
      reasons.push(`48h-Regeneration zu „${peer.session.title}“ gewahrt (${dayGap * 24} h)`);
    } else if (dayGap === 0) {
      reasons.push(
        `Warnung: zweite schwere Beineinheit am selben Tag wie „${peer.session.title}“ (+${weights.same_day_heavy_penalty} Penalty)`
      );
    } else {
      reasons.push(
        `Kompromiss: nur ${dayGap * 24} h Erholung zu „${peer.session.title}“ (+${
          weights.recovery_per_hour * (48 - dayGap * 24)
        } Penalty)`
      );
    }
  }

  if (isLongEnduranceSession(entry.session)) {
    if (entry.dayIndex >= 5) {
      reasons.push("Wochenende für die lange Ausfahrt bevorzugt");
    }
    if (entry.isLargestWindowDay) {
      reasons.push("Größtes durchgängiges Zeitfenster der Woche genutzt");
    }
  }

  const tod = timeOfDayCostDelta(entry.session.category, entry.startMin, entry.endMin, prefs);
  const windows = prefs.preferred_windows[entry.session.category] ?? [];
  if (windows.length > 0) {
    const label = windows
      .map((w) => `${formatMinutes(w.startMin)}–${formatMinutes(w.endMin)}`)
      .join(" / ");
    if (tod <= 0.01) {
      reasons.push(
        `Entspricht Zeitpräferenz für ${CATEGORY_LABELS_DE[entry.session.category]} (${label})`
      );
    } else {
      reasons.push(
        `Außerhalb Zeitpräferenz ${CATEGORY_LABELS_DE[entry.session.category]} (${label}, +${round1(
          tod
        )} Penalty)`
      );
    }
  }

  return reasons;
}

export function costBreakdownOf(
  entry: ExplainEntry,
  allEntries: ExplainEntry[],
  prefs: SchedulingPreferences
): ScheduledWorkout["cost_breakdown"] {
  const weights = prefs.weights;
  let recovery = 0;
  let longRide = 0;

  for (const other of allEntries) {
    if (other === entry) continue;
    if (isHeavyLowerSession(other.session) && isHeavyLowerSession(entry.session)) {
      const dayGap = Math.abs(other.dayIndex - entry.dayIndex);
      recovery += weights.recovery_per_hour * Math.max(0, 48 - dayGap * 24);
      if (dayGap === 0) recovery += weights.same_day_heavy_penalty;
    }
  }

  if (isLongEnduranceSession(entry.session)) {
    if (entry.dayIndex >= 5) longRide -= weights.weekend_long_ride_bonus;
    if (entry.isLargestWindowDay) longRide -= weights.largest_slot_long_ride_bonus;
  }

  const timeOfDay = timeOfDayCostDelta(
    entry.session.category,
    entry.startMin,
    entry.endMin,
    prefs
  );

  return {
    recovery: round1(recovery),
    long_ride: round1(longRide),
    time_of_day: round1(timeOfDay),
    total: round1(recovery + longRide + timeOfDay),
  };
}
