import { describe, expect, it } from "vitest";
import type {
  DayPlan,
  EnduranceSession,
  EnduranceTemplate,
  GarminActivity,
  GymSession,
  GymTemplate,
} from "@/types";
import type { FitnessProfile } from "@/lib/workout/targetEngine";
import {
  buildLibrary,
  buildSparklineFromZones,
  deriveFocusTagsForEndurance,
  deriveFocusTagsForGym,
  estimateEnduranceTss,
  estimateGymTss,
  filterLibrary,
  fuzzyScore,
  parseDurationToSeconds,
  rpeToIf,
  sortLibrary,
  stepsFromGeneratedSteps,
} from "./engine";
import { generateEnduranceSteps } from "@/lib/workout/targetEngine";
import { DEFAULT_LIBRARY_FILTERS, type LibraryWorkout } from "./types";

const PROFILE: FitnessProfile = { ftpWatts: 260, restingHr: 42, maxHr: 190 };

const GYM_TEMPLATES: GymTemplate[] = [
  {
    id: "tpl-push",
    name: "Upper Push",
    type: "gym",
    exercises: [
      {
        id: "ex-bp",
        name: "Bankdrücken",
        muscleGroup: "Brust",
        sets: [
          { id: "s1", type: "working", targetReps: 8 },
          { id: "s2", type: "working", targetReps: 8 },
          { id: "s3", type: "working", targetReps: 8 },
        ],
      },
      {
        id: "ex-lat",
        name: "Seitheben",
        muscleGroup: "Schultern",
        sets: [
          { id: "s4", type: "working", targetReps: 15 },
          { id: "s5", type: "working", targetReps: 15 },
        ],
      },
    ],
  },
];

const ENDURANCE_TEMPLATES: EnduranceTemplate[] = [
  {
    id: "tpl-4x4",
    name: "Rad: 4x4 Min Schwellen-Intervalle",
    type: "cycling",
    description: "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min aktiver Kurbelpause. Gesamtdauer ca. 60 Min.",
    estimatedDuration: "60 Min",
  },
  {
    id: "tpl-z2",
    name: "Rad: Zone 2 Base Endurance Ride",
    type: "cycling",
    description: "2 Stunden aerobes Grundlagentraining @ 60–75% FTP.",
    estimatedDuration: "120 Min",
  },
];

const WEEKLY_PLAN: DayPlan[] = [
  {
    dayIndex: 0,
    dayShort: "Mo",
    dayFull: "Montag",
    workoutType: "gym",
    title: "Krafttraining: Upper Push",
    description: "Brust & Schultern",
    templateId: "tpl-push",
  },
  {
    dayIndex: 1,
    dayShort: "Di",
    dayFull: "Dienstag",
    workoutType: "cycling",
    title: "Radfahren: 4x4 Schwellen",
    description: "4x 4 Min @ 95–105% FTP mit 3 Min Pause.",
    templateId: "tpl-4x4",
  },
  {
    dayIndex: 2,
    dayShort: "Mi",
    dayFull: "Mittwoch",
    workoutType: "running",
    title: "Laufen: Tempodauerlauf",
    description: "40 Min Dauerlauf im Z2-Bereich.",
    isCompleted: false,
  },
];

const GYM_SESSION: GymSession = {
  kind: "gym",
  id: "g1",
  date: "2026-08-20T18:00:00.000Z",
  templateId: "tpl-push",
  templateName: "Upper Push",
  entries: [
    {
      id: "e1",
      exercise: "Bankdrücken",
      sets: [
        { id: "gs1", type: "working", weight: 80, reps: 8, isCompleted: true },
        { id: "gs2", type: "working", weight: 82.5, reps: 8, isCompleted: true },
        { id: "gs3", type: "working", weight: "", reps: "", isCompleted: false },
      ],
    },
  ],
};

const ENDURANCE_SESSION: EnduranceSession = {
  kind: "endurance",
  id: "e9",
  date: "2026-08-21T10:00:00.000Z",
  activityType: "cycling",
  duration: "90",
  heartRate: 135,
  pace: "",
  rpe: 6,
  templateId: "tpl-z2",
  templateName: "Rad: Zone 2 Base Endurance Ride",
  notes: "Lange ruhige Ausfahrt",
};

const GARMIN_ACTIVITY: GarminActivity = {
  id: "ga1",
  name: "Threshold Ride Evening",
  type: "cycling",
  device: "Edge 840",
  startTime: "2026-08-22T17:30:00.000Z",
  durationSeconds: 3600,
  distanceMeters: 42000,
  caloriesBurned: 720,
  avgPowerWatts: 240,
  maxPowerWatts: 480,
  tss: 78,
  intensityFactor: 0.98,
  timeInZonesMin: [10, 12, 8, 20, 10],
  plannedWorkout: {
    title: "Schwellen-Intervalle",
    description: "Gesamtdauer ca. 75 Min @ 95–105% FTP",
    date: "2026-08-22",
  },
};

function build() {
  return buildLibrary({
    gymTemplates: GYM_TEMPLATES,
    enduranceTemplates: ENDURANCE_TEMPLATES,
    weeklyPlan: WEEKLY_PLAN,
    loggedSessions: [GYM_SESSION, ENDURANCE_SESSION],
    garminActivities: [GARMIN_ACTIVITY],
    todayIndex: 5,
    fitnessProfile: PROFILE,
  });
}

describe("parseDurationToSeconds", () => {
  it("parst Minuten-Angaben", () => {
    expect(parseDurationToSeconds("45")).toBe(2700);
    expect(parseDurationToSeconds("60 Min")).toBe(3600);
  });

  it("parst Stunden- und Range-Angaben als Mittelwert", () => {
    expect(parseDurationToSeconds("1h 05min")).toBe(3900);
    expect(parseDurationToSeconds("120–180 Min")).toBe(9000);
  });

  it("liefert 0 für leere/ungültige Werte", () => {
    expect(parseDurationToSeconds("")).toBe(0);
    expect(parseDurationToSeconds(undefined)).toBe(0);
  });
});

describe("Load-Schätzung", () => {
  it("1h bei IF 1.0 ergibt 100 TSS", () => {
    expect(estimateEnduranceTss(3600, 1)).toBe(100);
  });

  it("rpeToIf bildet RPE auf IF ab und bleibt geclamped", () => {
    expect(rpeToIf(10)).toBeLessThanOrEqual(1.05);
    expect(rpeToIf(0)).toBe(0.35);
    expect(rpeToIf(8)).toBeCloseTo(0.86);
  });

  it("Gym-TSS respektiert das Sätze-Minimum", () => {
    expect(estimateGymTss(20, 0, "gym")).toBe(32);
    expect(estimateGymTss(0, 3600, "mobility")).toBe(Math.round(60 * 0.35));
  });
});

describe("Fokus-Klassifikation", () => {
  it("erkennt Z2, Sweetspot und Threshold/VO2max in Texten", () => {
    expect(deriveFocusTagsForEndurance("Lockerer Grundlagenlauf Zone 2")).toContain("z2");
    expect(deriveFocusTagsForEndurance("Sweetspot-Fahrten 88–94% FTP")).toContain("sweetspot");
    expect(deriveFocusTagsForEndurance("4x 4 Min @ 95–105% FTP")).toContain("threshold-vo2max");
  });

  it("leitet Gym-Fokus aus Wiederholungszahlen ab", () => {
    const hypertrophy = deriveFocusTagsForGym([
      { id: "a", name: "X", sets: [{ id: "s", type: "working", targetReps: 10 }] },
    ]);
    expect(hypertrophy).toContain("hypertrophy");

    const maxStrength = deriveFocusTagsForGym([
      { id: "b", name: "Y", sets: [{ id: "s", type: "working", targetReps: 3 }] },
    ]);
    expect(maxStrength).toContain("max-strength");

    const mobility = deriveFocusTagsForGym([
      { id: "c", name: "Z", sets: [{ id: "s", type: "working", targetDuration: 60 }] },
    ]);
    expect(mobility).toEqual([]);
  });
});

describe("stepsFromGeneratedSteps", () => {
  it("löst absolute Watt-Ziele aus dem FTP-Profil auf", () => {
    const generated = generateEnduranceSteps(
      "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min Pause. Gesamtdauer ca. 60 Min.",
      "Test",
      { profile: PROFILE }
    );
    const steps = stepsFromGeneratedSteps(generated, PROFILE);
    const work = steps.find((s) => s.phase === "work");
    expect(work).toBeDefined();
    expect(work?.watts?.min).toBeGreaterThanOrEqual(240);
    expect(work?.watts?.max).toBeLessThanOrEqual(280);
    expect(steps.some((s) => s.phase === "warmup")).toBe(true);
    expect(steps.some((s) => s.phase === "cooldown")).toBe(true);
  });
});

describe("buildSparklineFromZones", () => {
  it("bildet Zonenminuten als Segmente ab und filtert leere", () => {
    const segments = buildSparklineFromZones([0, 20, 0, 10]);
    expect(segments).toHaveLength(2);
    expect(segments[0].weight).toBe(20);
  });
});

describe("buildLibrary", () => {
  const library = build();

  it("vereint Templates, Plan, Log und Garmin ohne Duplikate", () => {
    const titles = library.map((w) => w.id);
    expect(new Set(titles).size).toBe(titles.length);

    const push = library.find((w) => w.templateId === "tpl-push");
    expect(push?.status).toBe("planned");
    expect(push?.planDayIndex).toBe(0);
    expect(push?.primaryMuscles).toContain("Brust");

    expect(library.find((w) => w.templateId === "tpl-4x4")?.planDayIndex).toBe(1);
  });

  it("markiert verpasste Plan-Tage als übersprungen", () => {
    const skipped = library.filter((w) => w.status === "skipped");
    expect(skipped.map((w) => w.planDayIndex)).toContain(2);
  });

  it("führt geloggte Sessions mit Status 'abgeschlossen'", () => {
    const gym = library.find((w) => w.id === "lib-log-g1");
    expect(gym?.status).toBe("completed");
    expect(gym?.discipline).toBe("gym");
    expect(gym?.compliance).toBeDefined();
    expect(gym?.compliance?.metrics.map((m) => m.key)).toContain("sets");

    const ride = library.find((w) => w.id === "lib-log-e9");
    expect(ride?.durationSeconds).toBe(5400);
    expect(ride?.sparkline.length).toBeGreaterThan(0);
  });

  it("übernimmt Garmin-Aktivitäten inklusive Planned-vs-Actual-Daten", () => {
    const activity = library.find((w) => w.id === "lib-garmin-ga1");
    expect(activity?.status).toBe("completed");
    expect(activity?.estimatedTss).toBe(78);
    expect(activity?.compliance?.metrics.map((m) => m.key)).toContain("duration");
    expect(activity?.sourceLabel).toBe("Edge 840");
  });
});

describe("fuzzyScore", () => {
  it("bevorzugt exakte Treffer am Wortanfang", () => {
    const exact = fuzzyScore("Upper Push", "upper");
    const subsequence = fuzzyScore("Rudern für den Rücken", "uppr");
    expect(exact).toBeGreaterThan(subsequence);
  });

  it("liefert 0 bei Nicht-Treffer", () => {
    expect(fuzzyScore("Bankdrücken", "klimm")).toBe(0);
  });

  it("findet Subsequenzen (Tippfehler-tolerant)", () => {
    expect(fuzzyScore("Schwellen-Intervalle", "shwelln")).toBeGreaterThan(0);
  });
});

describe("filterLibrary", () => {
  const library = build();

  it("filtert nach Disziplin, Fokus und Status", () => {
    const cycling = filterLibrary(library, { ...DEFAULT_LIBRARY_FILTERS, discipline: "cycling" });
    expect(cycling.every((w) => w.discipline === "cycling")).toBe(true);

    const threshold = filterLibrary(library, {
      ...DEFAULT_LIBRARY_FILTERS,
      focus: "threshold-vo2max",
    });
    expect(threshold.some((w) => w.templateId === "tpl-4x4")).toBe(true);

    const completed = filterLibrary(library, { ...DEFAULT_LIBRARY_FILTERS, status: "completed" });
    expect(completed.every((w) => w.status === "completed")).toBe(true);
  });

  it("rankt Titeltreffer über Notiztreffern", () => {
    const ranked = filterLibrary(library, { ...DEFAULT_LIBRARY_FILTERS, query: "schwellen" });
    expect(ranked[0]?.title.toLowerCase()).toContain("schwellen");
  });

  it("leere Query liefert alles unverändert", () => {
    expect(filterLibrary(library, DEFAULT_LIBRARY_FILTERS)).toHaveLength(library.length);
  });
});

describe("sortLibrary", () => {
  function item(partial: Partial<LibraryWorkout>): LibraryWorkout {
    return {
      id: Math.random().toString(36).slice(2),
      title: "Test",
      discipline: "cycling",
      status: "planned",
      origin: "plan",
      durationSeconds: 3600,
      estimatedTss: 50,
      focusTags: [],
      primaryMuscles: [],
      steps: [],
      sparkline: [],
      searchText: "",
      ...partial,
    };
  }

  it("sortiert nach Dauer, TSS und Titel", () => {
    const items = [
      item({ id: "a", durationSeconds: 600, estimatedTss: 10, title: "C" }),
      item({ id: "b", durationSeconds: 7200, estimatedTss: 90, title: "A" }),
      item({ id: "c", durationSeconds: 3600, estimatedTss: 50, title: "B" }),
    ];
    expect(sortLibrary(items, "duration")[0].id).toBe("b");
    expect(sortLibrary(items, "tss")[0].id).toBe("b");
    expect(sortLibrary(items, "title").map((i) => i.title)).toEqual(["A", "B", "C"]);
  });
});
