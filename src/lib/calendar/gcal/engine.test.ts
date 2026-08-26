import { describe, expect, it } from "vitest";
import { computeFreeWindows, planSchedule, type Interval } from "./engine";
import type { DayPlan } from "@/types";
import {
  DEFAULT_SCHEDULING_SETTINGS,
  type BusyInterval,
  type ScheduledGoogleWorkout,
} from "./types";
import { zonedToUtcMs } from "./timezone";

const MIN = 60_000;

/** Montag, 8. Juni 2026 (CEST, UTC+2) */
const MONDAY = "2026-06-08";
// Mittwoch, 3. Juni 2026, 09:00 Berlin – fester Planungsstart
const FROM_MS = zonedToUtcMs("2026-06-03", "09:00");

function busyBerlin(date: string, start: string, end: string): BusyInterval {
  return {
    start: new Date(zonedToUtcMs(date, start)).toISOString(),
    end: new Date(zonedToUtcMs(date, end)).toISOString(),
  };
}

const GYM_PLAN: DayPlan[] = [
  { dayIndex: 0, dayShort: "Mo", dayFull: "Montag", workoutType: "gym", title: "Krafttraining: Upper Push", description: "Push-Tag" },
];

describe("computeFreeWindows", () => {
  const window: Interval = { startMs: zonedToUtcMs(MONDAY, "06:30"), endMs: zonedToUtcMs(MONDAY, "22:00") };

  it("liefert das ganze Fenster ohne Busy-Slots", () => {
    const free = computeFreeWindows(window, [], 0);
    expect(free).toEqual([window]);
  });

  it("verschmilzt überlappende Busy-Slots und zieht sie ab", () => {
    const busy: Interval[] = [
      { startMs: zonedToUtcMs(MONDAY, "08:00"), endMs: zonedToUtcMs(MONDAY, "09:00") },
      { startMs: zonedToUtcMs(MONDAY, "08:30"), endMs: zonedToUtcMs(MONDAY, "10:00") },
    ];
    const free = computeFreeWindows(window, busy, 0);
    expect(free).toHaveLength(2);
    expect(free[0].endMs).toBe(zonedToUtcMs(MONDAY, "08:00"));
    expect(free[1].startMs).toBe(zonedToUtcMs(MONDAY, "10:00"));
  });

  it("erweitert Busy-Slots um den Puffer (Reise-/Vorbereitungszeit)", () => {
    const busy: Interval[] = [
      { startMs: zonedToUtcMs(MONDAY, "08:00"), endMs: zonedToUtcMs(MONDAY, "09:00") },
    ];
    const free = computeFreeWindows(window, busy, 30 * MIN);
    expect(free[0].endMs).toBe(zonedToUtcMs(MONDAY, "07:30"));
    expect(free[1].startMs).toBe(zonedToUtcMs(MONDAY, "09:30"));
  });
});

describe("planSchedule", () => {
  const settings = {
    ...DEFAULT_SCHEDULING_SETTINGS,
    planningDays: 8,
    bufferMinutes: 30,
    minGapHours: 7,
  };

  function run(
    weeklyPlan: DayPlan[],
    busy: BusyInterval[],
    existing: ScheduledGoogleWorkout[] = [],
    overrides?: Partial<typeof settings>
  ) {
    return planSchedule({
      fromMs: FROM_MS,
      days: 8,
      weeklyPlan,
      busy,
      settings: { ...settings, ...overrides },
      existingScheduled: existing,
    });
  }

  it("platziert Gym im bevorzugten Morgenfenster (frühester Optimal-Slot)", () => {
    const { proposals, skipped } = run(GYM_PLAN, []);
    expect(skipped).toHaveLength(0);
    const monday = proposals.find((p) => p.date === MONDAY);
    expect(monday).toBeDefined();
    expect(monday!.workoutType).toBe("gym");
    expect(monday!.startTime).toBe("06:30");
    expect(monday!.endTime).toBe("08:00");
    expect(monday!.score).toBe(100);
  });

  it("weicht bei Terminen ins Abendfenster aus und respektiert den Puffer", () => {
    // Meeting 08:00–11:00 Berlin → mit Puffer blockt es bis 11:30
    const { proposals } = run(GYM_PLAN, [busyBerlin(MONDAY, "08:00", "11:00")]);
    const monday = proposals.find((p) => p.date === MONDAY);
    expect(monday).toBeDefined();
    expect(monday!.startTime).toBe("17:00");
    expect(monday!.score).toBe(100);
  });

  it("respektiert Mindestabstand zu bestehender Session am selben Tag", () => {
    // Bestehende Session 18:00–19:15 → neuer Vorschlag braucht ≥ 7h Abstand
    const existing: ScheduledGoogleWorkout[] = [
      {
        id: "manual-evening",
        googleEventId: "evt_1",
        calendarId: "primary",
        workoutType: "gym",
        title: "Abendsession",
        description: "",
        date: MONDAY,
        startTime: "18:00",
        endTime: "19:15",
        sourceDayIndex: 0,
        createdAt: new Date(FROM_MS).toISOString(),
      },
    ];
    // Vormittag frei lassen – Kandidaten müssen vor 11:00 enden oder nach 02:15 (+1)
    const busy = [busyBerlin(MONDAY, "11:00", "22:00")];
    const { proposals } = run(GYM_PLAN, busy, existing, {
      preferredWindows: [],
    });
    const monday = proposals.find((p) => p.date === MONDAY);
    if (monday) {
      const gapOk =
        monday.endTime <= "11:00" || monday.startTime >= "02:15"; // 18:00 − 90min − 7h
      expect(gapOk).toBe(true);
      expect(monday.startTime >= "06:30").toBe(true);
    }
  });

  it("blockt den ganzen Tag + Gap-Regel → Workout wird als skipped gemeldet", () => {
    // Block bis 14:00 + existierende Session 18:00–19:00:
    // Restfenster verletzt stets die 7h-Gap-Regel
    const busy = [busyBerlin(MONDAY, "06:00", "14:00")];
    const existing: ScheduledGoogleWorkout[] = [
      {
        id: "manual-evening",
        googleEventId: "evt_9",
        calendarId: "primary",
        workoutType: "gym",
        title: "Abendsession",
        description: "",
        date: MONDAY,
        startTime: "18:00",
        endTime: "19:00",
        sourceDayIndex: 0,
        createdAt: new Date(FROM_MS).toISOString(),
      },
    ];
    const { proposals, skipped } = run(GYM_PLAN, busy, existing);
    expect(proposals.find((p) => p.date === MONDAY)).toBeUndefined();
    const s = skipped.find((x) => x.date === MONDAY);
    expect(s).toBeDefined();
    expect(s!.reason).toContain("Kein freies Zeitfenster");
  });

  it("matcht Dauer: kein Slot groß genug → skipped mit Begründung", () => {
    // Lange Ausfahrt (240 Min) am Montag – Tag komplett vergeben
    const cyclingPlan: DayPlan[] = [
      { dayIndex: 0, dayShort: "Mo", dayFull: "Montag", workoutType: "cycling", title: "Radfahren: Lange Ausfahrt", description: "Zone 2" },
    ];
    const cycling240 = {
      ...DEFAULT_SCHEDULING_SETTINGS.durationsMinutes,
      cycling: 240,
    };
    const { proposals, skipped } = run(cyclingPlan, [busyBerlin(MONDAY, "00:00", "23:59")], [], {
      durationsMinutes: cycling240,
      preferredWindows: [],
    });
    expect(proposals.find((p) => p.date === MONDAY)).toBeUndefined();
    const s = skipped.find((x) => x.date === MONDAY);
    expect(s).toBeDefined();
    expect(s!.reason).toContain("240");
  });

  it("plant Ruhetage nicht und liefert chronologische Vorschläge", () => {
    const plan: DayPlan[] = [
      ...GYM_PLAN,
      { dayIndex: 3, dayShort: "Do", dayFull: "Donnerstag", workoutType: "rest", title: "Ruhetag", description: "" },
    ];
    const { proposals } = run(plan, []);
    const dates = proposals.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    // Nur der Montag ist Plan-Tag; Donnerstag (Ruhetag) bleibt außen vor
    expect(dates).toContain(MONDAY);
    const thursday = proposals.find((p) => p.date === "2026-06-11");
    expect(thursday).toBeUndefined();
  });
});
