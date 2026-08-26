import { describe, expect, it } from "vitest";
import {
  buildCircadianPlan,
  calculateSleepNeedMinutes,
  classifyWorkoutIntensity,
  computeSleepGate,
  computeSleepTargets,
  detectHighVolumeLegDay,
  detectScheduleConflicts,
  estimateDailyTss,
  extractBedtimeSamples,
  extractCaffeineIntakes,
  formatMinutesAsClock,
  parseTimeToMinutes,
} from "@/lib/coaching/circadian-optimizer";
import type { GarminDailyHealth, GymSession, MealEntry, DailyNutritionLog, GarminActivity } from "@/types";

function makeHealth(partial: Partial<GarminDailyHealth>): GarminDailyHealth {
  return {
    date: "2026-08-26",
    trainingReadiness: 75,
    bodyBattery: 80,
    hrvStatus: "balanced",
    sleepScore: 82,
    sleepDurationHours: 7.5,
    recoveryTimeHours: 12,
    restingHeartRate: 48,
    activeCaloriesBurned: 500,
    totalCaloriesBurned: 2500,
    ...partial,
  };
}

function makeGymSession(date: string, exercises: { name: string; setCount: number }[]): GymSession {
  return {
    kind: "gym",
    id: "s1",
    date,
    entries: exercises.map((e, i) => ({
      id: `e${i}`,
      exercise: e.name,
      sets: Array.from({ length: e.setCount }, (_, j) => ({
        id: `s${i}-${j}`,
        type: "working" as const,
        weight: 60,
        reps: 8,
      })),
    })),
  };
}

function makeMeal(name: string, amount: number, loggedAt?: string): MealEntry {
  return {
    id: `m-${name}`,
    mealType: "snack",
    food: { id: `f-${name}`, name, caloriesPer100g: 1, proteinPer100g: 0 },
    amount,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    loggedAt,
  };
}

describe("parseTimeToMinutes / formatMinutesAsClock", () => {
  it("parst HH:mm korrekt", () => {
    expect(parseTimeToMinutes("23:30")).toBe(1410);
    expect(parseTimeToMinutes("00:15")).toBe(15);
    expect(parseTimeToMinutes("kaputt")).toBeNull();
  });

  it("formatiert Minuten als Uhrzeit", () => {
    expect(formatMinutesAsClock(1350)).toBe("22:30");
    expect(formatMinutesAsClock(1470)).toBe("00:30");
  });
});

describe("calculateSleepNeedMinutes", () => {
  it("nutzt das 8h-Basisziel ohne Trainingsstress", () => {
    const r = calculateSleepNeedMinutes({});
    expect(r.totalMinutes).toBe(480);
    expect(r.modifierMinutes).toBe(0);
  });

  it("skaliert TSS > 150 linear von +15 auf +45 Min", () => {
    expect(calculateSleepNeedMinutes({ tss: 160 }).modifierMinutes).toBe(15);
    expect(calculateSleepNeedMinutes({ tss: 225 }).modifierMinutes).toBe(30);
    expect(calculateSleepNeedMinutes({ tss: 400 }).modifierMinutes).toBe(45);
  });

  it("ignoriert TSS ≤ 150", () => {
    expect(calculateSleepNeedMinutes({ tss: 150 }).modifierMinutes).toBe(0);
  });

  it("addiert +20 Min für einen High-Volume-Beintag", () => {
    expect(calculateSleepNeedMinutes({ highVolumeLegDay: true }).modifierMinutes).toBe(20);
  });

  it("deckt den kombinierten Modifier bei +45 Min", () => {
    const r = calculateSleepNeedMinutes({ tss: 400, highVolumeLegDay: true });
    expect(r.modifierMinutes).toBe(45);
    expect(r.totalMinutes).toBe(525);
  });
});

describe("computeSleepGate", () => {
  it("berechnet Median und volle Konsistenz bei identischen Bettzeiten", () => {
    const samples = [
      { date: "2026-08-24", bedtime: "22:30", wakeTime: "06:30" },
      { date: "2026-08-25", bedtime: "22:30", wakeTime: "06:30" },
      { date: "2026-08-26", bedtime: "22:30", wakeTime: "06:30" },
    ];
    const gate = computeSleepGate(samples);
    expect(formatMinutesAsClock(gate.centerMinutes)).toBe("22:30");
    expect(gate.windowStartMinutes).toBe(1320);
    expect(gate.windowEndMinutes).toBe(1380);
    expect(formatMinutesAsClock(gate.medianWakeMinutes)).toBe("06:30");
    expect(gate.consistencyPct).toBe(100);
    expect(gate.consistencyLevel).toBe("hoch");
  });

  it("ankert Zeiten nach Mitternacht korrekt (23:30 & 01:30 → Median 00:30)", () => {
    const gate = computeSleepGate([
      { date: "2026-08-25", bedtime: "23:30" },
      { date: "2026-08-26", bedtime: "01:30" },
    ]);
    expect(formatMinutesAsClock(gate.centerMinutes)).toBe("00:30");
  });

  it("fällt ohne Samples auf 23:00 / 06:45 zurück", () => {
    const gate = computeSleepGate([]);
    expect(gate.isFallback).toBe(true);
    expect(formatMinutesAsClock(gate.centerMinutes)).toBe("23:00");
    expect(formatMinutesAsClock(gate.medianWakeMinutes)).toBe("06:45");
  });

  it("stuft starke Streuung als niedrige Konsistenz ein", () => {
    const gate = computeSleepGate([
      { date: "2026-08-24", bedtime: "21:00" },
      { date: "2026-08-25", bedtime: "23:00" },
      { date: "2026-08-26", bedtime: "01:00" },
    ]);
    expect(gate.consistencyLevel).toBe("niedrig");
    expect(gate.consistencyPct).toBeLessThan(50);
  });
});

describe("computeSleepTargets", () => {
  it("bleibt im Gate, wenn der Bedarf natürlich passt", () => {
    const gate = computeSleepGate([{ date: "2026-08-26", bedtime: "22:30", wakeTime: "06:30" }]);
    const t = computeSleepTargets(gate, 480);
    expect(t.lightsOut).toBe("22:30");
    expect(t.windDownStart).toBe("21:45");
    expect(t.wakeUp).toBe("06:30");
    expect(t.meetsSleepNeed).toBe(true);
  });

  it("zieht Lights-Out früher, wenn der Bedarf es verlangt", () => {
    const gate = computeSleepGate([{ date: "2026-08-26", bedtime: "22:30", wakeTime: "06:30" }]);
    const t = computeSleepTargets(gate, 510); // 8.5h
    expect(t.lightsOut).toBe("22:00");
    expect(t.windDownStart).toBe("21:15");
    expect(t.meetsSleepNeed).toBe(true);
  });

  it("begrenzt die Vorverlegung auf 60 Min und markiert unerreichbaren Bedarf", () => {
    // Gate 23:00, Wake 05:00 → Bedarf 8h45 wäre Lights-Out 20:15 – unter dem Floor
    const gate = computeSleepGate([{ date: "2026-08-26", bedtime: "23:00", wakeTime: "05:00" }]);
    const t = computeSleepTargets(gate, 525);
    expect(t.lightsOut).toBe("22:00");
    expect(t.meetsSleepNeed).toBe(false);
  });
});

describe("detectScheduleConflicts", () => {
  const lightsOut = parseTimeToMinutes("22:30")!;

  it("warnt bei hoher Intensität im 3-h-Fenster (warnung ab 90 Min Abstand)", () => {
    const conflicts = detectScheduleConflicts({
      lightsOutMinutes: lightsOut,
      workouts: [{ label: "Intervalle", startTime: "19:00", durationMin: 90 }],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("warnung");
    expect(conflicts[0].kind).toBe("workout");
  });

  it("eskaliert zu kritisch, wenn die Einheit < 90 Min vor Lights-Out endet", () => {
    const conflicts = detectScheduleConflicts({
      lightsOutMinutes: lightsOut,
      workouts: [{ label: "Heavy Gym", startTime: "21:00", durationMin: 60 }],
    });
    expect(conflicts[0].severity).toBe("kritisch");
  });

  it("ignoriert Einheiten außerhalb des Fensters und niedrige Intensität", () => {
    const conflicts = detectScheduleConflicts({
      lightsOutMinutes: lightsOut,
      workouts: [
        { label: "Lockerer Auslauf", startTime: "20:00", durationMin: 60 },
        { label: "Intervalle", startTime: "17:00", durationMin: 90 },
      ],
    });
    expect(conflicts).toHaveLength(0);
  });

  it("warnt bei Koffein innerhalb von 3 Std vor Lights-Out", () => {
    const conflicts = detectScheduleConflicts({
      lightsOutMinutes: lightsOut,
      caffeineIntakes: [{ label: "Espresso", time: "20:00", mg: 130 }],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("caffeine");
    expect(conflicts[0].suggestion).toContain("19:30");
  });

  it("klassifiziert Workout-Namen nach Intensität", () => {
    expect(classifyWorkoutIntensity("4x4 Min Schwellen-Intervalle")).toBe("high");
    expect(classifyWorkoutIntensity("Heavy Day Unterkörper")).toBe("high");
    expect(classifyWorkoutIntensity("Lockere Regenerationseinheit")).toBe("low");
    expect(classifyWorkoutIntensity("Grundlagen-Ausdauer")).toBe("moderate");
  });
});

describe("Datenextraktion", () => {
  it("extrahiert Bettzeit-Stichproben aus den Garmin-Logs", () => {
    const logs = {
      "2026-08-25": makeHealth({ date: "2026-08-25", bedtimeLocal: "22:45", waketimeLocal: "06:15" }),
      "2026-08-26": makeHealth({ date: "2026-08-26" }),
    };
    const samples = extractBedtimeSamples(logs);
    expect(samples).toHaveLength(1);
    expect(samples[0].bedtime).toBe("22:45");
  });

  it("summiert Tages-TSS aus echten Werten mit Dauer-Fallback", () => {
    const activities: GarminActivity[] = [
      { id: "a1", name: "Intervalle", type: "cycling", device: "Forerunner 265", startTime: "2026-08-26T18:00:00", durationSeconds: 3600, distanceMeters: 40000, caloriesBurned: 600, tss: 180 },
      { id: "a2", name: "Laufen", type: "running", device: "Forerunner 265", startTime: "2026-08-26T07:30:00", durationSeconds: 3600, distanceMeters: 10000, caloriesBurned: 500 },
      { id: "a3", name: "Anderer Tag", type: "running", device: "Forerunner 265", startTime: "2026-08-20T10:00:00", durationSeconds: 3600, distanceMeters: 10000, caloriesBurned: 500, tss: 99 },
    ];
    expect(estimateDailyTss(activities, "2026-08-26")).toBe(250); // 180 TSS + 1h Lauf × 70
  });

  it("erkennt einen High-Volume-Beintag ab 12 beinlastigen Sätzen", () => {
    const legDay = makeGymSession("2026-08-26", [
      { name: "Kniebeuge", setCount: 4 },
      { name: "Beinpresse", setCount: 4 },
      { name: "Wadenheben", setCount: 4 },
    ]);
    const upperDay = makeGymSession("2026-08-26", [
      { name: "Bankdrücken", setCount: 4 },
      { name: "Rudern", setCount: 4 },
    ]);
    expect(detectHighVolumeLegDay([legDay], "2026-08-26")).toBe(true);
    expect(detectHighVolumeLegDay([upperDay], "2026-08-26")).toBe(false);
  });

  it("schätzt Koffein aus dem Ernährungslog inkl. loggedAt-Zeit", () => {
    const log: DailyNutritionLog = {
      date: "2026-08-26",
      waterMl: 2000,
      entries: [
        makeMeal("Filterkaffee", 200, "16:00"),
        makeMeal("Cola", 330, "19:30"),
        makeMeal("Haferbrei", 300),
      ],
    };
    const intakes = extractCaffeineIntakes(log);
    expect(intakes).toHaveLength(2);
    expect(intakes[0].mg).toBe(80);
    expect(intakes[0].time).toBe("16:00");
    expect(intakes[1].mg).toBe(33);
  });
});

describe("buildCircadianPlan (Integration)", () => {
  it("baut den vollständigen Tagesreport mit Bedarf, Gate, Zielen und Konflikt", () => {
    const report = buildCircadianPlan({
      date: "2026-08-26",
      garminHealthLogs: {
        "2026-08-24": makeHealth({ date: "2026-08-24", bedtimeLocal: "23:00", waketimeLocal: "06:45" }),
        "2026-08-25": makeHealth({ date: "2026-08-25", bedtimeLocal: "23:00", waketimeLocal: "06:45", sleepDurationHours: 6.5 }),
      },
      dayTss: 225,
      highVolumeLegDay: true,
      scheduledWorkouts: [],
      caffeineIntakes: [{ label: "Energy Drink", time: "20:00", mg: 160 }],
    });

    expect(report.sleepNeedMinutes).toBe(525);
    expect(report.sleepNeedLabel).toBe("8h 45min");
    expect(report.loadModifierMinutes).toBe(45);
    expect(report.loadReasons).toContain("Trainingsstress 225 TSS");
    expect(report.gate.isFallback).toBe(false);

    // Gate 23:00, Wake 06:45, Bedarf 8h45 → spätester Schlaf 20:15 → Floor 22:00
    expect(report.targets.lightsOut).toBe("22:00");
    expect(report.targets.windDownStart).toBe("21:15");
    expect(report.targets.wakeUp).toBe("06:45");

    // Koffein um 20:00 liegt im 3-h-Fenster vor 22:00
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].kind).toBe("caffeine");

    // Schlafdefizit-Tipp von gestern (6.5h vs. 8.75h Ziel)
    expect(report.tips.some((t) => t.includes("Schlafdefizit"))).toBe(true);
  });
});
