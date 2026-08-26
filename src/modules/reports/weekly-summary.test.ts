import { describe, expect, it } from "vitest";
import {
  aggregateWeeklyMetrics,
  coerceWeeklyAnalysis,
  formatMetricsForPrompt,
  formatWeeklyReportText,
  getWeekRange,
  isSundayEvening,
  parseDurationToSeconds,
  resolveMuscleGroup,
} from "@/modules/reports/weekly-summary";
import type { GymSession, EnduranceSession, GarminActivity, GarminDailyHealth, StravaActivity, GymTemplate } from "@/types";

const REFERENCE = new Date("2026-08-26T12:00:00");
const LAST_WEEK = getWeekRange(-1, REFERENCE);

function makeGym(
  date: string,
  entries: { exercise: string; sets: { weight: number; reps: number; isCompleted?: boolean }[] }[]
): GymSession {
  return {
    kind: "gym",
    id: `gym-${date}`,
    date,
    entries: entries.map((e, i) => ({
      id: `e${i}`,
      exercise: e.exercise,
      sets: e.sets.map((s, j) => ({
        id: `s${i}-${j}`,
        type: "working" as const,
        weight: s.weight,
        reps: s.reps,
        isCompleted: s.isCompleted ?? true,
      })),
    })),
  };
}

function makeRide(date: string, duration: string): EnduranceSession {
  return {
    kind: "endurance",
    id: `ride-${date}`,
    date,
    activityType: "cycling",
    duration,
    heartRate: 140,
    pace: "30.0 km/h",
    rpe: 6,
  };
}

function makeGarminRide(
  id: string,
  startTime: string,
  durationSeconds: number,
  extra: Partial<GarminActivity> = {}
): GarminActivity {
  return {
    id,
    name: "Ride",
    type: "cycling",
    device: "Edge 840",
    startTime,
    durationSeconds,
    distanceMeters: 40000,
    caloriesBurned: 800,
    ...extra,
  };
}

function makeStravaRide(id: number, startLocal: string, movingSeconds: number, elevation: number): StravaActivity {
  return {
    id,
    name: "Evening Ride",
    type: "Ride",
    sport_type: "Ride",
    start_date: startLocal,
    start_date_local: startLocal,
    distance: 50000,
    moving_time: movingSeconds,
    elapsed_time: movingSeconds + 300,
    average_speed: 8,
    total_elevation_gain: elevation,
  };
}

describe("getWeekRange", () => {
  it("liefert Montag 00:00 bis Sonntag 23:59", () => {
    const range = getWeekRange(0, REFERENCE);
    expect(range.start.getDay()).toBe(1);
    expect(range.end.getDay()).toBe(0);
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getHours()).toBe(23);
    expect(range.label).toBe("Diese Woche");
  });

  it("offset -1 ergibt letzte Woche mit Label", () => {
    const range = getWeekRange(-1, REFERENCE);
    expect(range.label).toBe("Letzte Woche");
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(key(range.start)).toBe("2026-08-17");
    expect(key(range.end)).toBe("2026-08-23");
  });
});

describe("parseDurationToSeconds", () => {
  it("parst H:MM:SS und MM:SS", () => {
    expect(parseDurationToSeconds("1:30:00")).toBe(5400);
    expect(parseDurationToSeconds("45:30")).toBe(2730);
  });

  it("gibt 0 für Müll zurück", () => {
    expect(parseDurationToSeconds("")).toBe(0);
    expect(parseDurationToSeconds("abc")).toBe(0);
  });
});

describe("resolveMuscleGroup", () => {
  it("nutzt zuerst das Template-Mapping", () => {
    const lookup = new Map([["beinpresse 45°", "Beine (Template)"]]);
    expect(resolveMuscleGroup("Beinpresse 45°", lookup)).toBe("Beine (Template)");
  });

  it("klassifiziert über Keywords", () => {
    expect(resolveMuscleGroup("Bankdrücken", new Map())).toBe("Brust");
    expect(resolveMuscleGroup("Lat-Zug", new Map())).toBe("Rücken");
    expect(resolveMuscleGroup("Kreuzheben", new Map())).toBe("Beine");
    expect(resolveMuscleGroup("Schulterdrücken", new Map())).toBe("Schultern");
    expect(resolveMuscleGroup("Bizeps-Curl", new Map())).toBe("Arme");
    expect(resolveMuscleGroup("Plank", new Map())).toBe("Core");
  });

  it("fällt auf Sonstige zurück", () => {
    expect(resolveMuscleGroup("Mysterium-X", new Map())).toBe("Sonstige");
  });
});

describe("aggregateWeeklyMetrics", () => {
  const week = LAST_WEEK;

  it("summiert Radstunden ohne Doppelzählung (Session + Strava-Import)", () => {
    const session = { ...makeRide("2026-08-18", "2:00:00"), stravaId: 42 };
    const metrics = aggregateWeeklyMetrics({
      range: week,
      sessions: [session],
      stravaActivities: [makeStravaRide(42, "2026-08-18T18:00:00", 7200, 500)],
    });
    expect(metrics.bikeHours).toBe(2);
    expect(metrics.elevationGainMeters).toBe(500);
    expect(metrics.bikeKilojoules).toBeNull();
  });

  it("zählt nicht importierte Strava-Fahrten separat und dedupliziert gegen Garmin", () => {
    const metrics = aggregateWeeklyMetrics({
      range: week,
      sessions: [],
      garminActivities: [makeGarminRide("g1", "2026-08-19T09:00:00", 3600, { avgPowerWatts: 200 })],
      stravaActivities: [makeStravaRide(7, "2026-08-19T09:00:00", 3620, 300)],
    });
    expect(metrics.bikeHours).toBe(1);
    expect(metrics.bikeKilojoules).toBe(720);
    expect(metrics.elevationGainMeters).toBe(0);
  });

  it("erbt Höhenmeter & kJ von passenden Garmin-Rides für manuelle Sessions", () => {
    const metrics = aggregateWeeklyMetrics({
      range: week,
      sessions: [makeRide("2026-08-20", "1:00:00")],
      garminActivities: [
        makeGarminRide("g2", "2026-08-20T17:30:00", 3540, { avgPowerWatts: 250, elevationGainMeters: 420 }),
      ],
    });
    expect(metrics.bikeHours).toBe(1);
    expect(metrics.elevationGainMeters).toBe(420);
    expect(metrics.bikeKilojoules).toBe(Math.round((250 * 3540) / 1000));
  });

  it("berechnet Gym-Tonnage nur aus abgeschlossenen Sätzen", () => {
    const metrics = aggregateWeeklyMetrics({
      range: week,
      sessions: [
        makeGym("2026-08-19", [
          {
            exercise: "Bankdrücken",
            sets: [
              { weight: 100, reps: 10 },
              { weight: 80, reps: 8, isCompleted: false },
            ],
          },
          { exercise: "Latzug", sets: [{ weight: 60, reps: 12 }] },
        ]),
      ],
    });
    expect(metrics.gymTonnageKg).toBe(100 * 10 + 60 * 12);
    expect(metrics.gymSets).toBe(2);
    const brust = metrics.muscleVolumes.find((m) => m.group === "Brust");
    const ruecken = metrics.muscleVolumes.find((m) => m.group === "Rücken");
    expect(brust?.tonnageKg).toBe(1000);
    expect(ruecken?.tonnageKg).toBe(720);
  });

  it("mittelt HRV und summiert Sleep Score nur innerhalb der Woche", () => {
    const healthLogs: Record<string, GarminDailyHealth> = {
      "2026-08-18": { date: "2026-08-18", hrvLastNightMs: 80, sleepScore: 80, trainingReadiness: 70, bodyBattery: 50, hrvStatus: "balanced", sleepDurationHours: 7, recoveryTimeHours: 12, restingHeartRate: 48, activeCaloriesBurned: 500, totalCaloriesBurned: 2500 },
      "2026-08-19": { date: "2026-08-19", hrvLastNightMs: 60, sleepScore: 70, trainingReadiness: 70, bodyBattery: 50, hrvStatus: "balanced", sleepDurationHours: 7, recoveryTimeHours: 12, restingHeartRate: 48, activeCaloriesBurned: 500, totalCaloriesBurned: 2500 },
      "2026-08-24": { date: "2026-08-24", hrvLastNightMs: 99, sleepScore: 99, trainingReadiness: 70, bodyBattery: 50, hrvStatus: "balanced", sleepDurationHours: 7, recoveryTimeHours: 12, restingHeartRate: 48, activeCaloriesBurned: 500, totalCaloriesBurned: 2500 },
    };
    const metrics = aggregateWeeklyMetrics({ range: week, sessions: [], healthLogs });
    expect(metrics.avgHrvMs).toBe(70);
    expect(metrics.hrvDays).toBe(2);
    expect(metrics.totalSleepScore).toBe(150);
    expect(metrics.sleepDays).toBe(2);
  });

  it("ignoriert Sessions außerhalb des Zeitraums", () => {
    const metrics = aggregateWeeklyMetrics({
      range: week,
      sessions: [makeRide("2026-09-02", "3:00:00"), makeGym("2026-01-01", [{ exercise: "Squat", sets: [{ weight: 200, reps: 5 }] }])],
    });
    expect(metrics.bikeHours).toBe(0);
    expect(metrics.gymTonnageKg).toBe(0);
  });
});

describe("coerceWeeklyAnalysis", () => {
  it("akzeptiert ein valides Objekt", () => {
    const analysis = coerceWeeklyAnalysis({
      keyWins: ["a"],
      fatigueRecoveryBalance: ["b", "c"],
      nextMicrocycleFocus: ["d"],
    });
    expect(analysis.keyWins).toEqual(["a"]);
    expect(analysis.fatigueRecoveryBalance).toHaveLength(2);
  });

  it("wirft bei fehlenden oder leeren Sektionen", () => {
    expect(() => coerceWeeklyAnalysis({})).toThrow();
    expect(() => coerceWeeklyAnalysis({ keyWins: [], fatigueRecoveryBalance: ["x"], nextMicrocycleFocus: ["y"] })).toThrow();
    expect(() => coerceWeeklyAnalysis(null)).toThrow();
  });
});

describe("Output-Formate", () => {
  const metrics = aggregateWeeklyMetrics({
    range: LAST_WEEK,
    sessions: [makeRide("2026-08-19", "1:00:00")],
  });

  it("Textbericht enthält die Kernkennzahlen", () => {
    const text = formatWeeklyReportText(metrics, null);
    expect(text).toContain("WOCHENBERICHT");
    expect(text).toContain("1h");
  });

  it("Prompt enthält Metriken und JSON-Schema", () => {
    const prompt = formatMetricsForPrompt(metrics);
    expect(prompt).toContain("Radfahren");
  });

  it("Sonntagabend-Erkennung", () => {
    expect(isSundayEvening(new Date("2026-08-23T18:00:00"))).toBe(true);
    expect(isSundayEvening(new Date("2026-08-23T10:00:00"))).toBe(false);
    expect(isSundayEvening(new Date("2026-08-26T18:00:00"))).toBe(false);
  });
});

describe("Template-Lookup", () => {
  it("Template muscleGroup schlägt Keyword-Klassifikation", () => {
    const template: GymTemplate = {
      id: "t1",
      name: "Push",
      type: "gym",
      exercises: [
        { id: "e1", name: "Dips am Barren", sets: [], muscleGroup: "Trizeps-Spezial" },
      ],
    };
    const lookup = new Map(
      template.exercises.map((ex) => [ex.name.toLowerCase(), ex.muscleGroup as string])
    );
    expect(resolveMuscleGroup("Dips am Barren", lookup)).toBe("Trizeps-Spezial");
  });
});
