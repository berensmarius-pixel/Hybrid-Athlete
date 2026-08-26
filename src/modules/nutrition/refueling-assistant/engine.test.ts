import { describe, expect, it } from "vitest";
import type { GarminActivity, GymSession, PantryItem } from "@/types";
import {
  DEFAULT_BODY_WEIGHT_KG,
  REFUEL_WINDOW_MINUTES,
  buildRefuelPlan,
  classifyRefuelNeeds,
  computeRefuelTargets,
  getActivityLocalDate,
  getRemainingTargets,
  getWindowProgress,
  parseDurationToSeconds,
  toRefuelActivityFromGarmin,
  toRefuelActivityFromSession,
} from "./engine";
import { generateMealSuggestions } from "./meals";
import type { RefuelActivityInput } from "./types";

function makeGarmin(overrides: Partial<GarminActivity> = {}): GarminActivity {
  return {
    id: "g1",
    name: "Test Ride",
    type: "cycling",
    device: "Edge 840",
    startTime: "2026-08-26T09:00:00",
    durationSeconds: 3600,
    distanceMeters: 30000,
    caloriesBurned: 600,
    ...overrides,
  };
}

function makeInput(overrides: Partial<RefuelActivityInput> = {}): RefuelActivityInput {
  return {
    id: "a1",
    source: "garmin",
    name: "Intervalle",
    sport: "cycling",
    startTimeISO: "2026-08-26T09:00:00",
    durationSeconds: 5400,
    avgHeartRate: 165,
    aerobicTrainingEffect: 4.0,
    tss: 110,
    ...overrides,
  };
}

describe("toRefuelActivityFromGarmin", () => {
  it("übernimmt Sport, Telemetrie-Signale und Power-Metrik", () => {
    const input = toRefuelActivityFromGarmin(
      makeGarmin({ type: "running", avgHeartRate: 158, tss: 95, intensityFactor: 0.98 })
    );
    expect(input.sport).toBe("running");
    expect(input.source).toBe("garmin");
    expect(input.tss).toBe(95);
    expect(input.intensityFactor).toBeCloseTo(0.98);
  });

  it("mappt unbekannte Sportarten auf other", () => {
    expect(toRefuelActivityFromGarmin(makeGarmin({ type: "other", name: "Yoga" })).sport).toBe("other");
  });
});

describe("toRefuelActivityFromSession", () => {
  it("aggregiert Gym-Sätze und Volumen nur aus abgeschlossenen Sätzen", () => {
    const gym: GymSession = {
      kind: "gym",
      id: "s1",
      date: "2026-08-26T18:00:00",
      templateName: "Lower Body",
      rpe: 9,
      entries: [
        {
          id: "e1",
          exercise: "Kniebeuge",
          sets: [
            { id: "set1", type: "working", weight: 100, reps: 8, isCompleted: true },
            { id: "set2", type: "working", weight: 100, reps: 8, isCompleted: true },
            { id: "set3", type: "warmup", weight: 60, reps: 10, isCompleted: true },
          ],
        },
      ],
    };
    const input = toRefuelActivityFromSession(gym)!;
    expect(input.sport).toBe("gym");
    expect(input.totalSets).toBe(3);
    expect(input.totalVolumeKg).toBe(60 * 10 + 100 * 8 * 2);
    expect(input.rpe).toBe(9);
  });

  it("mapped Endurance-Sessions inkl. Duration-Parsing", () => {
    const input = toRefuelActivityFromSession({
      kind: "endurance",
      id: "s2",
      date: "2026-08-26T07:00:00",
      activityType: "running",
      duration: "1:05:30",
      heartRate: 152,
      pace: "5:00/km",
      rpe: 7,
      stravaId: 4711,
    })!;
    expect(input.sport).toBe("running");
    expect(input.source).toBe("strava");
    expect(input.durationSeconds).toBe(3930);
    expect(input.avgHeartRate).toBe(152);
  });

  it("ignoriert stretching/warmup/mobility", () => {
    expect(
      toRefuelActivityFromSession({ kind: "stretching", id: "s3", date: "2026-08-26", entries: [] })
    ).toBeNull();
  });
});

describe("parseDurationToSeconds", () => {
  it("parsst Logger-Konvention: H:MM:SS, MM:SS und Minuten", () => {
    expect(parseDurationToSeconds("1:05:30")).toBe(3930);
    expect(parseDurationToSeconds("45:00")).toBe(2700);
    expect(parseDurationToSeconds("65")).toBe(3900);
    expect(parseDurationToSeconds("")).toBe(0);
  });
});

describe("classifyRefuelNeeds", () => {
  it("High-Intensity Ride → High Carb Priority", () => {
    const c = classifyRefuelNeeds(makeInput(), []);
    expect(c.priority).toBe("carbs");
    expect(c.intensity).toBe("high");
    expect(c.headline).toContain("Carb");
  });

  it("lockere kurze Einheit → moderate/low Carbs", () => {
    const c = classifyRefuelNeeds(
      makeInput({ durationSeconds: 1800, avgHeartRate: undefined, tss: undefined, aerobicTrainingEffect: undefined }),
      []
    );
    expect(c.priority).toBe("carbs");
    expect(c.intensity).not.toBe("high");
  });

  it("schwere Hypertrophy-Gym → Protein-Priority mit Leucin-Trigger", () => {
    const c = classifyRefuelNeeds(
      makeInput({
        id: "gym1",
        sport: "gym",
        name: "Push Day",
        durationSeconds: 0,
        totalSets: 22,
        totalVolumeKg: 9000,
        rpe: 9,
        avgHeartRate: undefined,
        tss: undefined,
        aerobicTrainingEffect: undefined,
      }),
      []
    );
    expect(c.priority).toBe("protein");
    expect(c.intensity).toBe("high");
    expect(c.leucineTriggerG).toBeGreaterThanOrEqual(2.5);
  });

  it("Dual-Session-Day → Urgent Fast-Acting Carbs (höchste Priorität)", () => {
    const morningRide = makeInput({ id: "a-morning", startTimeISO: "2026-08-26T08:00:00" });
    const eveningGym = makeInput({
      id: "a-evening",
      sport: "gym",
      startTimeISO: "2026-08-26T18:00:00",
      totalSets: 22,
      totalVolumeKg: 9000,
      rpe: 9,
      avgHeartRate: undefined,
      tss: undefined,
      aerobicTrainingEffect: undefined,
    });
    const c = classifyRefuelNeeds(eveningGym, [morningRide, eveningGym]);
    expect(c.priority).toBe("urgent-carbs");
    expect(c.firstDoseMinutes).toBeLessThanOrEqual(30);
  });

  it("Activities an anderen Tagen lösen KEIN Dual-Session aus", () => {
    const yesterday = makeInput({ id: "a-yesterday", startTimeISO: "2026-08-25T08:00:00" });
    const c = classifyRefuelNeeds(makeInput(), [yesterday]);
    expect(c.priority).not.toBe("urgent-carbs");
  });

  it("getActivityLocalDate gruppiert lokal", () => {
    expect(getActivityLocalDate(makeInput())).toBe("2026-08-26");
  });
});

describe("computeRefuelTargets", () => {
  it("High-Carb-Fenster liegt bei 75 kg im 1.0–1.2 g/kg-Band", () => {
    const classification = classifyRefuelNeeds(makeInput(), []);
    const targets = computeRefuelTargets(classification, makeInput(), 75);
    expect(targets.carbsG).toBeGreaterThanOrEqual(75 * 1.0);
    expect(targets.carbsG).toBeLessThanOrEqual(75 * 1.2);
  });

  it("Protein-Priority: 30–45 g hochwertiges Protein", () => {
    const classification = classifyRefuelNeeds(
      makeInput({ sport: "gym", totalSets: 22, totalVolumeKg: 9000, rpe: 9, avgHeartRate: undefined, tss: undefined, aerobicTrainingEffect: undefined }),
      []
    );
    for (const bw of [55, 70, 95]) {
      const targets = computeRefuelTargets(classification, makeInput({ sport: "gym" }), bw);
      expect(targets.proteinG).toBeGreaterThanOrEqual(30);
      expect(targets.proteinG).toBeLessThanOrEqual(45);
    }
  });

  it("Urgent-Protokoll: 1.2 g/kg schnelle Carbs sofort", () => {
    const classification = classifyRefuelNeeds(makeInput(), [makeInput({ id: "other" })]);
    const targets = computeRefuelTargets(classification, makeInput(), 75);
    expect(targets.carbsG).toBe(Math.round(75 * 1.2));
  });

  it("fällt auf Default-KG zurück bei unplausiblen Werten", () => {
    const classification = classifyRefuelNeeds(makeInput(), []);
    const targets = computeRefuelTargets(classification, makeInput(), 0);
    expect(targets.carbsG).toBe(Math.round(DEFAULT_BODY_WEIGHT_KG * 1.15));
  });
});

describe("buildRefuelPlan", () => {
  it("erzeugt Plan mit 2h-Fenster, 3 Optionen A/B/C und Zielen", () => {
    const activity = makeInput();
    const plan = buildRefuelPlan({
      activity,
      sameDayActivities: [],
      bodyWeightKg: 75,
      pantryItems: [],
      now: new Date("2026-08-26T10:45:00"),
    });

    expect(plan.activityIds).toEqual([activity.id]);
    expect(plan.targets.carbsG).toBeGreaterThan(0);
    expect(plan.suggestions).toHaveLength(3);
    expect(plan.suggestions.map((s) => s.label)).toEqual(["Option A", "Option B", "Option C"]);

    const start = new Date(plan.windowStartISO).getTime();
    const end = new Date(plan.windowEndsAtISO).getTime();
    expect(Math.round((end - start) / 60000)).toBe(REFUEL_WINDOW_MINUTES);
  });
});

describe("getWindowProgress / getRemainingTargets", () => {
  const plan = buildRefuelPlan({
    activity: makeInput(),
    sameDayActivities: [],
    bodyWeightKg: 75,
    now: new Date("2026-08-26T10:45:00"),
  });

  it("zählt verbleibende Sekunden bis zum Fenster-Ende", () => {
    const start = new Date(plan.windowStartISO).getTime();
    const p = getWindowProgress(plan, start + 30 * 60 * 1000);
    expect(p.remainingSeconds).toBeCloseTo(90 * 60, -1);
    expect(p.expired).toBe(false);
    expect(p.elapsedPct).toBeCloseTo(25, 0);
  });

  it("markiert abgelaufene Fenster", () => {
    const end = new Date(plan.windowEndsAtISO).getTime();
    expect(getWindowProgress(plan, end + 1000).expired).toBe(true);
  });

  it("Rest-Ziele werden nie negativ", () => {
    const consumed = { ...plan, consumedCarbsG: plan.targets.carbsG + 50, consumedProteinG: 5 };
    const remaining = getRemainingTargets(consumed);
    expect(remaining.carbsG).toBe(0);
    expect(remaining.proteinG).toBe(Math.max(0, plan.targets.proteinG - 5));
  });
});

describe("generateMealSuggestions", () => {
  const targets = { carbsG: 86, proteinG: 32, fluidMl: 600 };

  it("liefert genau 3 eindeutige Optionen mit Makros", () => {
    const suggestions = generateMealSuggestions("carbs", targets, []);
    expect(suggestions).toHaveLength(3);
    expect(new Set(suggestions.map((s) => s.id)).size).toBe(3);
    for (const s of suggestions) {
      expect(s.carbsG).toBeGreaterThan(0);
      expect(s.calories).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it("Protein-Priority: Top-Option deckt das Protein-Target vollständig", () => {
    const proteinTarget = 32;
    const suggestions = generateMealSuggestions("protein", { carbsG: 38, proteinG: proteinTarget, fluidMl: 500 }, []);
    expect(suggestions[0].proteinG).toBeGreaterThanOrEqual(proteinTarget);
    expect(suggestions[0].label).toBe("Option A");
  });

  it("Pantry-Bestand fließt in die Beschreibung & Quelle ein", () => {
    const pantry: PantryItem[] = [
      makePantry("Bio Magerquark"),
      makePantry("Reisflocken"),
      makePantry("Whey Isolate"),
      makePantry("Bananen"),
    ];
    const suggestions = generateMealSuggestions("carbs", targets, pantry);
    expect(suggestions.some((s) => s.source === "pantry")).toBe(true);
  });
});

function makePantry(name: string): PantryItem {
  return {
    id: `p-${name}`,
    name,
    quantity: 1000,
    unit: "g",
    addedAt: "2026-08-01T00:00:00",
    caloriesPer100g: 100,
    macros: { protein: 10, carbs: 10, fat: 1 },
  };
}
