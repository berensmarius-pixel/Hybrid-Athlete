import { describe, expect, it } from "vitest";
import {
  SUPERSET_ALTERNATING_REST_SECONDS,
  DEFAULT_FULL_REST_SECONDS,
  adjustSupersetRestSeconds,
  applySupersetPlan,
  buildSupersetPlan,
  classifyMovement,
  clearSupersets,
  findSupersetPairs,
  isSpinalLoading,
} from "@/lib/strength/superset-optimizer";
import type { SupersetCandidateExercise } from "@/lib/strength/superset-optimizer";
import type { TemplateExercise } from "@/types";

function makeExercises(
  names: string[],
  setsPerExercise = 3
): SupersetCandidateExercise[] {
  return names.map((name, i) => ({
    id: `ex-${i}`,
    name,
    sets: Array.from({ length: setsPerExercise }, (_, j) => ({
      id: `ex-${i}-set-${j}`,
      type: "working" as const,
      targetReps: 10,
    })),
  })) as TemplateExercise[];
}

describe("classifyMovement", () => {
  it("erkennt Brustdrücken (de/en)", () => {
    expect(classifyMovement("Bankdrücken")).toBe("chestPush");
    expect(classifyMovement("Bench Press")).toBe("chestPush");
    expect(classifyMovement("Liegestütze")).toBe("chestPush");
  });

  it("erkennt Rücken-Zug", () => {
    expect(classifyMovement("Latzug")).toBe("backPull");
    expect(classifyMovement("Klimmzüge")).toBe("backPull");
    expect(classifyMovement("Barbell Row")).toBe("spinalLoad");
  });

  it("erkennt Arme", () => {
    expect(classifyMovement("Bizepscurls")).toBe("bicepsCurl");
    expect(classifyMovement("Trizepsdrücken am Kabel")).toBe("tricepsExtension");
    expect(classifyMovement("Skull Crushers")).toBe("tricepsExtension");
  });

  it("erkennt Beine ohne Wirbelsäulenbelastung", () => {
    expect(classifyMovement("Beinstrecker")).toBe("quadExtension");
    expect(classifyMovement("Leg Press")).toBe("quadExtension");
    expect(classifyMovement("Beinbeuger")).toBe("hamstringCurl");
    expect(classifyMovement("Seated Leg Curl")).toBe("hamstringCurl");
    expect(classifyMovement("Wadenheben")).toBe("calfRaise");
  });

  it("erkennt Schulterdrücken und stuft spinal belastende Übungen ein", () => {
    expect(classifyMovement("Schulterdrücken")).toBe("overheadPress");
    expect(classifyMovement("Overhead Press")).toBe("overheadPress");
    expect(classifyMovement("Kreuzheben")).toBe("spinalLoad");
    expect(classifyMovement("Rumänisches Kreuzheben")).toBe("spinalLoad");
    expect(classifyMovement("Romanian Deadlift")).toBe("spinalLoad");
    expect(classifyMovement("Frontkniebeugen")).toBe("spinalLoad");
    expect(isSpinalLoading("Heavy Deadlifts")).toBe(true);
    expect(isSpinalLoading("Beinpresse")).toBe(false);
  });
});

describe("Pairing Rules Engine", () => {
  it("paart alle drei Antagonisten-Regeln", () => {
    const pairs = findSupersetPairs(
      makeExercises([
        "Bankdrücken",
        "Latzug",
        "Bizepscurls",
        "Trizepsdrücken",
        "Beinstrecker",
        "Beinbeuger",
      ])
    );
    expect(pairs).toHaveLength(3);
    expect(new Set(pairs.map((p) => p.ruleId))).toEqual(
      new Set(["chest-back", "biceps-triceps", "quad-hamstring"])
    );
  });

  it("paart Upper/Lower-Stagger (Schulterdrücken + Wadenheben)", () => {
    const pairs = findSupersetPairs(
      makeExercises(["Schulterdrücken", "Wadenheben"])
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].kind).toBe("upperLower");
    expect(pairs[0].ruleId).toBe("press-calf");
  });

  it("deaktiviert Upper/Lower-Stagger für Kraftblöcke bzw. per Flag", () => {
    const exercises = makeExercises(["Schulterdrücken", "Wadenheben"]);
    expect(findSupersetPairs(exercises, { blockType: "strength" })).toHaveLength(0);
    expect(
      findSupersetPairs(exercises, { includeUpperLowerStagger: false })
    ).toHaveLength(0);
    expect(findSupersetPairs(exercises, { blockType: "hypertrophy" })).toHaveLength(1);
  });

  it("verbietet Paarung spinal belastender Übungen strikt", () => {
    const pairs = findSupersetPairs(
      makeExercises(["Kreuzheben", "Kniebeugen", "Langhantelrudern"])
    );
    expect(pairs).toHaveLength(0);

    const plan = buildSupersetPlan(makeExercises(["Kreuzheben", "Kniebeugen"]));
    expect(plan.pairedExerciseIds).toHaveLength(0);
    expect(plan.skippedSpinalExercises.map((s) => s.name).sort()).toEqual([
      "Kniebeugen",
      "Kreuzheben",
    ]);
  });

  it("paart nur nicht-konkurrierende Muster (kein Doppel-Push)", () => {
    const pairs = findSupersetPairs(
      makeExercises(["Bankdrücken", "Schrägbankdrücken", "Latzug"])
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].ruleId).toBe("chest-back");
  });
});

describe("Rest Period Adjustment", () => {
  it("kürzt Pausen auf 60 s statt 180 s vollem Rest", () => {
    expect(SUPERSET_ALTERNATING_REST_SECONDS).toBe(60);
    expect(DEFAULT_FULL_REST_SECONDS).toBe(180);
    expect(adjustSupersetRestSeconds(undefined)).toBe(60);
    expect(adjustSupersetRestSeconds(180)).toBe(60);
    expect(adjustSupersetRestSeconds(90)).toBe(60);
  });

  it("verlängert nie kürzere geplante Pausen", () => {
    expect(adjustSupersetRestSeconds(45)).toBe(45);
    expect(adjustSupersetRestSeconds(0)).toBe(0);
  });

  it("schreibt die gekürzte Pause in alle Sätze des Paares", () => {
    const exercises = makeExercises(["Bankdrücken", "Latzug"]).map((ex) => ({
      ...ex,
      sets: ex.sets!.map((s) => ({ ...s, restSeconds: 180 })),
    }));
    const plan = buildSupersetPlan(exercises);
    const applied = applySupersetPlan(exercises, plan);
    expect(applied[0].supersetOrder).toBe("A");
    expect(applied[1].supersetOrder).toBe("B");
    expect(applied[0].sets![0].restSeconds).toBe(60);
    expect(applied[1].sets![2].restSeconds).toBe(60);
  });
});

describe("Plan anwenden & zurücksetzen", () => {
  it("versieht nur gepaarte Übungen mit Supersatz-Metadaten", () => {
    const exercises = makeExercises([
      "Bankdrücken",
      "Latzug",
      "Kreuzheben",
      "Beinpresse",
    ]);
    const plan = buildSupersetPlan(exercises);
    expect(plan.pairs).toHaveLength(1);

    const applied = applySupersetPlan(exercises, plan);
    const bench = applied.find((e) => e.name === "Bankdrücken")!;
    const row = applied.find((e) => e.name === "Latzug")!;
    const dl = applied.find((e) => e.name === "Kreuzheben")!;
    expect(bench.supersetId).toBeTruthy();
    expect(bench.supersetId).toBe(row.supersetId);
    expect(bench.supersetOrder).toBe("A");
    expect(row.supersetOrder).toBe("B");
    expect(dl.supersetId).toBeUndefined();
  });

  it("entfernt veraltete Metadaten bei nicht gepaarten Übungen", () => {
    const exercises = makeExercises(["Bankdrücken", "Latzug"]);
    const plan = buildSupersetPlan([]);
    const applied = applySupersetPlan(
      exercises.map((e) => ({ ...e, supersetId: "stale", supersetOrder: "A" as const })),
      plan
    );
    expect(applied.every((e) => e.supersetId === undefined && e.supersetOrder === undefined)).toBe(true);
  });

  it("clearSupersets entfernt alle Metadaten", () => {
    const exercises = makeExercises(["Bankdrücken", "Latzug"]);
    const applied = applySupersetPlan(exercises, buildSupersetPlan(exercises));
    const cleared = clearSupersets(applied.map((e) => ({ ...e })));
    expect(cleared.every((e) => e.supersetId === undefined && e.supersetOrder === undefined)).toBe(true);
  });
});

describe("Zeit-Ersparnis", () => {
  it("spart bei typischem Ganzkörper-Template mit Solos (spinal) ~25% Zeit", () => {
    const exercises = makeExercises([
      "Kreuzheben",
      "Bankdrücken",
      "Latzug",
      "Schulterdrücken",
      "Wadenheben",
      "Beinpresse",
      "Beinstrecker",
      "Beinbeuger",
    ]);
    const plan = buildSupersetPlan(exercises);
    expect(plan.pairs).toHaveLength(3);
    expect(plan.skippedSpinalExercises.map((s) => s.name)).toEqual(["Kreuzheben"]);
    expect(plan.estimatedSecondsSaved).toBeGreaterThan(0);
    expect(plan.optimizedEstimatedSeconds).toBeLessThan(plan.originalEstimatedSeconds);
    expect(plan.estimatedTimeSavedPct).toBeGreaterThanOrEqual(15);
    expect(plan.estimatedTimeSavedPct).toBeLessThanOrEqual(35);
  });

  it("spart bei vollständiger Paarung noch deutlich mehr Zeit", () => {
    const exercises = makeExercises([
      "Bankdrücken",
      "Latzug",
      "Schulterdrücken",
      "Wadenheben",
      "Beinstrecker",
      "Beinbeuger",
    ]);
    const plan = buildSupersetPlan(exercises);
    expect(plan.pairs).toHaveLength(3);
    expect(plan.estimatedTimeSavedPct).toBeGreaterThan(35);
  });

  it("liefert für leere Eingaben einen neutralen Plan", () => {
    const plan = buildSupersetPlan([]);
    expect(plan.pairs).toHaveLength(0);
    expect(plan.originalEstimatedSeconds).toBe(0);
    expect(plan.estimatedSecondsSaved).toBe(0);
    expect(plan.estimatedTimeSavedPct).toBe(0);
  });
});
