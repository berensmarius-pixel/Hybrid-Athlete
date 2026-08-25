import { describe, expect, it } from "vitest";
import { detectNewPRs, epley1RM, mergePRs } from "@/lib/training/pr";
import type { GymSession, PersonalRecord } from "@/types";

function makeSession(
  entries: { exercise: string; sets: { weight: number; reps: number; isCompleted?: boolean }[] }[],
  date = "2026-08-25"
): GymSession {
  return {
    kind: "gym",
    id: "s1",
    date,
    entries: entries.map((e, i) => ({
      id: `e${i}`,
      exercise: e.exercise,
      sets: e.sets.map((s, j) => ({
        id: `s${j}`,
        type: "working" as const,
        weight: s.weight,
        reps: s.reps,
        isCompleted: s.isCompleted ?? true,
      })),
    })),
  };
}

const PR_BENCH: PersonalRecord = {
  exerciseName: "Bench Press",
  estimated1RM: 100,
  bestWeight: 90,
  bestReps: 3,
  date: "2026-01-01",
};

describe("epley1RM", () => {
  it("gibt bei 1 Rep das Gewicht direkt zurück", () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it("berechnet Epley korrekt (gerundet)", () => {
    // 100 * (1 + 10/30) = 133.33 → 133
    expect(epley1RM(100, 10)).toBe(133);
  });
});

describe("detectNewPRs", () => {
  it("erkennt ein neues PR über dem Bestand", () => {
    const session = makeSession([
      { exercise: "Bench Press", sets: [{ weight: 95, reps: 3 }] },
    ]);
    const prs = detectNewPRs(session, [PR_BENCH]);
    expect(prs).toHaveLength(1);
    // 95*(1+3/30)=104.5 → 105 > 100
    expect(prs[0].estimated1RM).toBe(105);
    expect(prs[0].bestWeight).toBe(95);
  });

  it("meldet kein PR unter dem Bestand", () => {
    const session = makeSession([
      { exercise: "bench press", sets: [{ weight: 80, reps: 3 }] },
    ]);
    expect(detectNewPRs(session, [PR_BENCH])).toHaveLength(0);
  });

  it("matcht Exercise-Namen case-insensitive", () => {
    const session = makeSession([
      { exercise: "BENCH PRESS", sets: [{ weight: 100, reps: 2 }] },
    ]);
    const prs = detectNewPRs(session, [PR_BENCH]);
    expect(prs).toHaveLength(1);
  });

  it("bevorzugt den besten Set derselben Session", () => {
    const session = makeSession([
      {
        exercise: "Deadlift",
        sets: [
          { weight: 140, reps: 5 },
          { weight: 160, reps: 3 },
          { weight: 150, reps: 4 },
        ],
      },
    ]);
    const prs = detectNewPRs(session, []);
    expect(prs).toHaveLength(1);
    // 160*(1+3/30) = 176
    expect(prs[0].estimated1RM).toBe(176);
    expect(prs[0].bestReps).toBe(3);
  });

  it("ignoriert nicht abgeschlossene Sets und leere Namen", () => {
    const session = makeSession([
      {
        exercise: "Squat",
        sets: [
          { weight: 120, reps: 5, isCompleted: false },
          { weight: 130, reps: 5 },
        ],
      },
      { exercise: "   ", sets: [{ weight: 50, reps: 10 }] },
    ]);
    const prs = detectNewPRs(session, []);
    expect(prs).toHaveLength(1);
    expect(prs[0].exerciseName).toBe("Squat");
  });
});

describe("mergePRs", () => {
  it("überschreibt bestehende PRs case-insensitive und hängt neue an", () => {
    const merged = mergePRs([PR_BENCH], [
      {
        exerciseName: "bench press",
        estimated1RM: 110,
        bestWeight: 100,
        bestReps: 3,
        date: "2026-08-25",
      },
      {
        exerciseName: "Overhead Press",
        estimated1RM: 60,
        bestWeight: 55,
        bestReps: 3,
        date: "2026-08-25",
      },
    ]);

    expect(merged).toHaveLength(2);
    // mergePRs übernimmt den Namen des erkannten PR (Original-Schreibweise)
    expect(
      merged.find((p) => p.exerciseName.toLowerCase() === "bench press")?.estimated1RM
    ).toBe(110);
    expect(merged.find((p) => p.exerciseName === "Overhead Press")).toBeDefined();
  });

  it("verändert das Eingabe-Array nicht (pure)", () => {
    const existing = [PR_BENCH];
    mergePRs(existing, []);
    expect(existing).toEqual([PR_BENCH]);
  });
});
