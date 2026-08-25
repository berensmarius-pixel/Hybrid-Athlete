import { describe, expect, it } from "vitest";
import {
  getDateForDayIndex,
  getStravaCompletedDays,
  getWeekStats,
  stravaToEnduranceSession,
} from "@/lib/stravaUtils";
import type { StravaActivity } from "@/types";

function makeActivity(overrides: Partial<StravaActivity>): StravaActivity {
  return {
    id: 1,
    name: "Morgenlauf",
    sport_type: "Run",
    type: "Run",
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3100,
    total_elevation_gain: 50,
    start_date: "2026-08-25T06:00:00Z",
    start_date_local: "2026-08-25T08:00:00",
    average_speed: 3.33,
    max_speed: 5,
    average_heartrate: 150,
    max_heartrate: 180,
    achievement_count: 0,
    kudos_count: 0,
    ...overrides,
  } as StravaActivity;
}

describe("stravaToEnduranceSession", () => {
  it("mapped eine Run-Activity auf running mit Pace", () => {
    const s = stravaToEnduranceSession(makeActivity({}));
    expect(s.kind).toBe("endurance");
    expect(s.activityType).toBe("running");
    // 3.33 m/s → 1000/3.33 ≈ 300.3 s/km → "5:00/km"
    expect(s.pace).toBe("5:00/km");
    // 3000 s → "50:00"
    expect(s.duration).toBe("50:00");
    expect(s.heartRate).toBe(150);
    expect(s.stravaId).toBe(1);
  });

  it("mapped Nicht-Run auf cycling mit km/h", () => {
    const s = stravaToEnduranceSession(
      makeActivity({ sport_type: "Ride", type: "Ride", average_speed: 8.33 })
    );
    expect(s.activityType).toBe("cycling");
    expect(s.pace).toBe("30.0 km/h");
  });

  it("formatiert Stunden-Dauer als h:mm:ss", () => {
    const s = stravaToEnduranceSession(makeActivity({ moving_time: 4500 }));
    expect(s.duration).toBe("1:15:00");
  });
});

describe("getWeekStats", () => {
  const range = { start: new Date(2026, 7, 24), end: new Date(2026, 7, 30) };

  it("summiert Run- und Ride-Kilometer getrennt (auf 0,1 gerundet)", () => {
    const stats = getWeekStats(
      [
        makeActivity({ id: 1, distance: 10500, moving_time: 3600 }),
        makeActivity({
          id: 2,
          sport_type: "Ride",
          type: "Ride",
          distance: 40200,
          moving_time: 5400,
        }),
        // Außerhalb der Range → ignoriert
        makeActivity({ id: 3, start_date_local: "2026-01-01T08:00:00", start_date: "2026-01-01T06:00:00Z" }),
      ],
      range
    );
    expect(stats.runKm).toBe(10.5);
    expect(stats.rideKm).toBe(40.2);
    expect(stats.totalHours).toBe(2.5);
    expect(stats.runCount).toBe(1);
    expect(stats.rideCount).toBe(1);
  });
});

describe("getDateForDayIndex", () => {
  it("liefert den Montag der Woche für dayIndex 0", () => {
    // 2026-08-25 ist ein Dienstag
    const monday = getDateForDayIndex(0, new Date(2026, 7, 25));
    expect(monday).toBe("2026-08-24");
  });

  it("springt in die Folgewoche bei dayIndex > heute", () => {
    const sunday = getDateForDayIndex(6, new Date(2026, 7, 25));
    expect(sunday).toBe("2026-08-30");
  });
});

describe("getStravaCompletedDays", () => {
  const plan = [
    { dayIndex: 0, workoutType: "cycling" },
    { dayIndex: 1, workoutType: "running" },
    { dayIndex: 2, workoutType: "gym" },
    { dayIndex: 3, workoutType: "rest" },
  ] as never;

  it("matched Activities nur am passenden Tag und passenden Typ", () => {
    const completed = getStravaCompletedDays(
      [
        makeActivity({ start_date_local: "2026-08-24T10:00:00" }), // Mo → Ride geplant, Activity ist Run → kein Match
        makeActivity({ id: 9, sport_type: "Ride", type: "Ride", start_date_local: "2026-08-24T10:00:00" }),
        makeActivity({ id: 10, start_date_local: "2026-08-25T08:00:00" }), // Di Run ✓
      ],
      plan,
      { start: new Date(2026, 7, 24), end: new Date(2026, 7, 30) }
    );
    expect([...completed].sort()).toEqual([0, 1]);
  });
});
