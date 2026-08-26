import { describe, expect, it } from "vitest";
import { solveSchedule } from "./solver";
import type { BusyBlockInput, SessionBlueprint } from "./types";

function bp(overrides: Partial<SessionBlueprint> & { id: string }): SessionBlueprint {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    sport: overrides.sport ?? "gym",
    category: overrides.category ?? "strength_upper",
    duration_min: overrides.duration_min ?? 60,
    intensity_tier: overrides.intensity_tier ?? "Med",
    target_muscle_groups: overrides.target_muscle_groups ?? [],
    aerobic_impact: overrides.aerobic_impact ?? "Low",
    priority: overrides.priority ?? 3,
    notes: overrides.notes,
  };
}

function busy(dayIndex: number, startTime: string, endTime: string): BusyBlockInput {
  return { day_index: dayIndex, start_time: startTime, end_time: endTime };
}

function busyFullDay(dayIndex: number): BusyBlockInput {
  return busy(dayIndex, "06:00", "22:00");
}

function toMinutes(hhMm: string): number {
  const [h, m] = hhMm.split(":").map(Number);
  return h * 60 + m;
}

describe("solveSchedule – Hard Constraints", () => {
  it("platziert alle Einheiten bei leerem Kalender innerhalb des Tagesfensters", () => {
    const result = solveSchedule({
      sessions: [
        bp({ id: "upper", category: "strength_upper", sport: "gym" }),
        bp({ id: "z2", category: "endurance_low", sport: "cycling", duration_min: 45 }),
        bp({ id: "rec", category: "recovery", sport: "mobility", duration_min: 30 }),
      ],
      week_start_date: "2026-01-05",
    });

    expect(result.unplaced).toHaveLength(0);
    expect(result.placements).toHaveLength(3);
    expect(result.diagnostics.feasible).toBe(true);

    for (const p of result.placements) {
      expect(toMinutes(p.start_time)).toBeGreaterThanOrEqual(360);
      expect(toMinutes(p.end_time)).toBeLessThanOrEqual(1320);
    }
  });

  it("hält Puffer (+30 Min) um Kalender-Termine ein", () => {
    const busyEvents: BusyBlockInput[] = [];
    for (let d = 0; d < 7; d++) {
      if (d !== 2) busyEvents.push(busyFullDay(d));
    }
    busyEvents.push(busy(2, "17:00", "19:00"));

    const result = solveSchedule({
      sessions: [bp({ id: "upper", category: "strength_upper", sport: "gym", duration_min: 60 })],
      busy_events: busyEvents,
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(1);
    const p = result.placements[0];
    expect(p.day_index).toBe(2);
    expect(p.start_time).toBe("19:30");
    expect(p.end_time).toBe("20:30");
  });

  it("überschreitet nie das tägliche Trainingslimit", () => {
    const result = solveSchedule({
      sessions: [
        bp({ id: "a", category: "strength_upper", sport: "gym", duration_min: 75 }),
        bp({ id: "b", category: "intervals_high", sport: "cycling", duration_min: 75 }),
        bp({ id: "c", category: "endurance_low", sport: "running", duration_min: 75 }),
      ],
      preferences: { max_daily_training_min: 90 },
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(3);
    expect(result.diagnostics.daily_load_min.every((load) => load <= 90)).toBe(true);

    const days = result.placements.map((p) => p.day_index);
    expect(new Set(days).size).toBe(3);
  });

  it("erzwingt 6 h Abstand und platziert schwere Beine vor Max-Effort-Intervallen", () => {
    const busyEvents: BusyBlockInput[] = [];
    for (let d = 1; d < 7; d++) busyEvents.push(busyFullDay(d));

    const result = solveSchedule({
      sessions: [
        bp({
          id: "legs",
          category: "strength_heavy_lower",
          sport: "gym",
          duration_min: 90,
          intensity_tier: "High",
          target_muscle_groups: ["quads", "glutes"],
        }),
        bp({
          id: "vo2",
          category: "intervals_high",
          sport: "cycling",
          duration_min: 60,
          intensity_tier: "High",
          aerobic_impact: "High",
        }),
      ],
      busy_events: busyEvents,
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(2);
    const legs = result.placements.find((p) => p.session_id === "legs")!;
    const vo2 = result.placements.find((p) => p.session_id === "vo2")!;
    expect(legs.day_index).toBe(vo2.day_index);

    const legsStart = toMinutes(legs.start_time);
    const vo2Start = toMinutes(vo2.start_time);
    const legsEnd = toMinutes(legs.end_time);

    expect(legsStart).toBeLessThan(vo2Start);
    expect(vo2Start - legsEnd).toBeGreaterThanOrEqual(360);
  });

  it("erzwingt 6 h Abstand zu Threshold-Intervallen in beliebiger Reihenfolge", () => {
    const busyEvents: BusyBlockInput[] = [];
    for (let d = 1; d < 7; d++) busyEvents.push(busyFullDay(d));

    const result = solveSchedule({
      sessions: [
        bp({
          id: "legs",
          category: "strength_heavy_lower",
          sport: "gym",
          duration_min: 60,
          intensity_tier: "High",
          target_muscle_groups: ["quads"],
        }),
        bp({
          id: "thr",
          category: "intervals_high",
          sport: "cycling",
          duration_min: 60,
          intensity_tier: "Med",
        }),
      ],
      busy_events: busyEvents,
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(2);
    const legs = result.placements.find((p) => p.session_id === "legs")!;
    const thr = result.placements.find((p) => p.session_id === "thr")!;
    expect(legs.day_index).toBe(thr.day_index);

    const gap = Math.max(
      toMinutes(legs.start_time) - toMinutes(thr.end_time),
      toMinutes(thr.start_time) - toMinutes(legs.end_time)
    );
    expect(gap).toBeGreaterThanOrEqual(360);
  });
});

describe("solveSchedule – Soft Constraints", () => {
  it("wahrt 48 h Regeneration zwischen schweren Beineinheiten", () => {
    const result = solveSchedule({
      sessions: [
        bp({
          id: "legs1",
          category: "strength_heavy_lower",
          sport: "gym",
          duration_min: 75,
          intensity_tier: "High",
          target_muscle_groups: ["quads", "hamstrings"],
          priority: 1,
        }),
        bp({
          id: "legs2",
          category: "strength_heavy_lower",
          sport: "gym",
          duration_min: 75,
          intensity_tier: "High",
          target_muscle_groups: ["quads", "glutes"],
          priority: 2,
        }),
      ],
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(2);
    const [a, b] = result.placements;
    expect(Math.abs(b.day_index - a.day_index)).toBeGreaterThanOrEqual(2);
  });

  it("bevorzugt das Wochenende für die lange Ausfahrt", () => {
    const result = solveSchedule({
      sessions: [
        bp({
          id: "longride",
          category: "endurance_long",
          sport: "cycling",
          duration_min: 180,
          intensity_tier: "Low",
          aerobic_impact: "High",
          priority: 2,
        }),
        bp({ id: "upper", category: "strength_upper", sport: "gym", duration_min: 60 }),
        bp({
          id: "vo2",
          category: "intervals_high",
          sport: "cycling",
          duration_min: 45,
          intensity_tier: "Med",
        }),
      ],
      week_start_date: "2026-01-05",
    });

    const ride = result.placements.find((p) => p.session_id === "longride")!;
    expect(ride.day_index).toBeGreaterThanOrEqual(5);
    expect(ride.explanations.some((e) => e.includes("Wochenende"))).toBe(true);
  });
});

describe("solveSchedule – Robustheit & Determinismus", () => {
  it("liefert identische Ergebnisse bei identischem Input", () => {
    const input = {
      sessions: [
        bp({ id: "legs", category: "strength_heavy_lower", sport: "gym", duration_min: 75 }),
        bp({ id: "vo2", category: "intervals_high", sport: "cycling", duration_min: 60, intensity_tier: "High" }),
        bp({ id: "long", category: "endurance_long", sport: "cycling", duration_min: 150 }),
      ],
      busy_events: [busy(0, "09:00", "11:00"), busy(3, "13:00", "18:00")],
      week_start_date: "2026-01-05",
    };

    const a = solveSchedule(input);
    const b = solveSchedule(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("markiert nicht platzierbare Einheiten mit nachvollziehbarer Begründung", () => {
    const busyEvents: BusyBlockInput[] = [];
    for (let d = 0; d < 7; d++) busyEvents.push(busy(d, "06:00", "20:00"));

    const result = solveSchedule({
      sessions: [
        bp({ id: "ultra", category: "endurance_long", sport: "cycling", duration_min: 240 }),
      ],
      busy_events: busyEvents,
      week_start_date: "2026-01-05",
    });

    expect(result.placements).toHaveLength(0);
    expect(result.diagnostics.feasible).toBe(false);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0].reason).toContain("zusammenhängendes Zeitfenster");
  });

  it("dropt bei harter Infeasibility die Einheit mit niedrigster Priorität zuerst", () => {
    const busyEvents: BusyBlockInput[] = [];
    for (let d = 0; d < 7; d++) busyEvents.push(busy(d, "06:00", "20:00"));

    const result = solveSchedule({
      sessions: [
        bp({ id: "core", category: "strength_upper", sport: "gym", duration_min: 45, priority: 1 }),
        bp({
          id: "optional-ultra",
          category: "endurance_long",
          sport: "cycling",
          duration_min: 270,
          priority: 5,
        }),
      ],
      busy_events: busyEvents,
      week_start_date: "2026-01-05",
    });

    expect(result.placements.map((p) => p.session_id)).toEqual(["core"]);
    expect(result.unplaced.map((u) => u.session.id)).toEqual(["optional-ultra"]);
  });

  it("dokumentiert die Platzierungsentscheidung je Einheit", () => {
    const result = solveSchedule({
      sessions: [
        bp({ id: "upper", category: "strength_upper", sport: "gym", duration_min: 60 }),
      ],
      week_start_date: "2026-01-05",
    });

    const p = result.placements[0];
    expect(p.explanations.length).toBeGreaterThan(0);
    expect(p.explanations.some((e) => e.includes("Freies Fenster"))).toBe(true);
    expect(p.cost_breakdown).toHaveProperty("total");
  });
});
