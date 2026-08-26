import { describe, expect, it } from "vitest";
import {
  applyPrGroups,
  buildE1rmSeries,
  buildPrBook,
  detectNewStrengthPRs,
  estimate1RM,
  findLastExerciseSession,
  getExerciseSets,
  listTrackedExercises,
  recommendProgression,
  resolveEffectiveReps,
  resolveRpe,
} from "@/lib/strength/progression";
import type { GymSession } from "@/types";

function makeSession(
  entries: { exercise: string; sets: { weight: number; reps: number; rpe?: number; rir?: number; isCompleted?: boolean }[] }[],
  id = "s1",
  date = "2026-08-01"
): GymSession {
  return {
    kind: "gym",
    id,
    date,
    entries: entries.map((e, i) => ({
      id: `e${i}`,
      exercise: e.exercise,
      sets: e.sets.map((s, j) => ({
        id: `s${j}`,
        type: "working" as const,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe ?? "",
        rir: s.rir ?? "",
        isCompleted: s.isCompleted ?? true,
      })),
    })),
  };
}

describe("resolveRpe & resolveEffectiveReps", () => {
  it("leitet RPE aus RIR ab", () => {
    expect(resolveRpe({ rir: 3 })).toBe(7);
  });

  it("nutzt RPE direkt und bevorzugt es gegenüber RIR", () => {
    expect(resolveRpe({ rpe: 8.5, rir: 1 })).toBe(8.5);
  });

  it("defaultet auf Failure (RPE 10)", () => {
    expect(resolveRpe({ rpe: "", rir: "" })).toBe(10);
    expect(resolveRpe(undefined)).toBe(10);
  });

  it("berechnet effektive Wiederholungen nach reps + (10 - RPE)", () => {
    expect(resolveEffectiveReps(5, { rpe: 8 })).toBe(7);
    expect(resolveEffectiveReps(5, { rir: 2 })).toBe(7);
    expect(resolveEffectiveReps(10)).toBe(10);
  });

  it("clampt effektive Wiederholungen auf mindestens 1", () => {
    expect(resolveEffectiveReps(1, { rpe: 10 })).toBe(1);
  });
});

describe("estimate1RM", () => {
  it("berechnet Epley korrekt (100 kg × 10 eff. Wdh.)", () => {
    const est = estimate1RM({ weight: 100, reps: 10 });
    expect(est.epley).toBeCloseTo(133.3, 1);
  });

  it("berechnet Brzycki korrekt", () => {
    const est = estimate1RM({ weight: 100, reps: 10 });
    // 3600 / 27 = 133.33
    expect(est.brzycki).toBeCloseTo(133.3, 1);
  });

  it("berechnet Wathan korrekt", () => {
    const est = estimate1RM({ weight: 100, reps: 10 });
    // 100 / (52.2 + 41.9 * e^(-0.55)) = 130.93
    expect(est.wathan).toBeCloseTo(130.9, 1);
  });

  it("bildet den Mittelwert der drei Formeln", () => {
    const est = estimate1RM({ weight: 100, reps: 10 });
    expect(est.average).toBeCloseTo((133.3 + 133.3 + 130.9) / 3, 1);
  });

  it("adjustiert nach RIR: 5 Wdh. @ RPE 8 = 7 eff. Wdh.", () => {
    const est = estimate1RM({ weight: 100, reps: 5, rpe: 8 });
    expect(est.epley).toBeCloseTo(123.3, 1);
    expect(est.brzycki).toBe(120);
  });

  it("liefert bei 1 Rep @ RPE 10 exakt das Gewicht (Epley & Brzycki)", () => {
    const est = estimate1RM({ weight: 100, reps: 1 });
    expect(est.epley).toBe(100);
    expect(est.brzycki).toBe(100);
  });

  it("bleibt auch bei sehr hohen effektiven Wdh. definiert (Brzycki-Guard)", () => {
    const est = estimate1RM({ weight: 60, reps: 40 });
    expect(Number.isFinite(est.brzycki)).toBe(true);
  });
});

describe("buildPrBook", () => {
  const sessions: GymSession[] = [
    makeSession(
      [
        {
          exercise: "Bench Press",
          sets: [
            { weight: 60, reps: 8 },
            { weight: 80, reps: 3 },
            { weight: 70, reps: 5 },
          ],
        },
      ],
      "s1",
      "2026-08-01"
    ),
    makeSession(
      [
        {
          exercise: "bench press",
          sets: [{ weight: 82.5, reps: 3 }, { weight: 62.5, reps: 8 }],
        },
      ],
      "s2",
      "2026-08-08"
    ),
  ];

  it("trackt All-time e1RM über Sessions hinweg (case-insensitive)", () => {
    const book = buildPrBook(sessions);
    const slot = book.get("bench press");
    expect(slot?.e1rm?.value).toBeCloseTo(90.7, 1);
    expect(slot?.e1rm?.sessionId).toBe("s2");
  });

  it("trackt Best 3RM als schwerstes Gewicht für exakt 3 Wdh.", () => {
    const slot = buildPrBook(sessions).get("bench press");
    expect(slot?.rep3?.value).toBe(82.5);
    expect(slot?.rep3?.weight).toBe(82.5);
  });

  it("trackt Best 5RM", () => {
    const slot = buildPrBook(sessions).get("bench press");
    expect(slot?.rep5?.value).toBe(70);
  });

  it("trackt höchstes Set-Volumen (Gewicht × Wdh. eines Sets)", () => {
    const slot = buildPrBook(sessions).get("bench press");
    expect(slot?.setVolume?.value).toBe(500);
  });

  it("ignoriert Warm-up-Sets und nicht abgeschlossene Sets", () => {
    const session = makeSession([
      {
        exercise: "Squat",
        sets: [
          { weight: 200, reps: 1, isCompleted: false },
        ],
      },
    ]);
    session.entries[0].sets.push({
      id: "warm",
      type: "warmup",
      weight: 500,
      reps: 1,
      rpe: "",
      rir: "",
      isCompleted: true,
    });
    const slot = buildPrBook([session]).get("squat");
    expect(slot?.e1rm).toBeNull();
  });
});

describe("detectNewStrengthPRs", () => {
  const baseline = buildPrBook([
    makeSession(
      [{ exercise: "Bench Press", sets: [{ weight: 80, reps: 3 }] }],
      "old",
      "2026-08-01"
    ),
  ]);

  it("meldet nur gebrochene Kategorien", () => {
    const session = makeSession(
      [{ exercise: "Bench Press", sets: [{ weight: 82.5, reps: 3 }] }],
      "new",
      "2026-08-08"
    );
    const groups = detectNewStrengthPRs(session, baseline);
    expect(groups).toHaveLength(1);
    const kinds = groups[0].records.map((r) => r.kind).sort();
    // e1RM bricht (82.5×3 > 80×3), rep3 bricht, Set-Volumen bricht (247.5 > 240)
    expect(kinds).toEqual(["e1rm", "rep3", "setVolume"]);
  });

  it("meldet kein PR bei schlechterer Leistung", () => {
    const session = makeSession(
      [{ exercise: "Bench Press", sets: [{ weight: 75, reps: 3 }] }]
    );
    expect(detectNewStrengthPRs(session, baseline)).toHaveLength(0);
  });

  it("bevorzugt das beste Set derselben Session pro Kategorie", () => {
    const session = makeSession(
      [
        {
          exercise: "Deadlift",
          sets: [
            { weight: 140, reps: 5 },
            { weight: 160, reps: 5 },
            { weight: 150, reps: 5 },
          ],
        },
      ]
    );
    const groups = detectNewStrengthPRs(session, new Map());
    expect(groups[0].records.find((r) => r.kind === "rep5")?.value).toBe(160);
  });
});

describe("applyPrGroups", () => {
  it("fügt neue PRs in den Book ein und bleibt pure", () => {
    const book = buildPrBook([
      makeSession([{ exercise: "Bench Press", sets: [{ weight: 80, reps: 3 }] }]),
    ]);
    const snapshot = [...book.entries()];
    const groups = detectNewStrengthPRs(
      makeSession([{ exercise: "Bench Press", sets: [{ weight: 90, reps: 3 }] }]),
      book
    );
    const next = applyPrGroups(book, groups);
    expect(next.get("bench press")?.rep3?.value).toBe(90);
    expect([...book.entries()]).toEqual(snapshot);
  });
});

describe("buildE1rmSeries", () => {
  it("liefert chronologische e1RM-Kurvenpunkte pro Übung", () => {
    const sessions: GymSession[] = [
      makeSession([{ exercise: "Squat", sets: [{ weight: 100, reps: 5 }] }], "a", "2026-07-01"),
      makeSession([{ exercise: "Bench Press", sets: [{ weight: 80, reps: 5 }] }], "b", "2026-07-02"),
      makeSession([{ exercise: "Squat", sets: [{ weight: 102.5, reps: 5 }] }], "c", "2026-07-08"),
    ];
    const series = buildE1rmSeries(sessions, "squat");
    expect(series.map((p) => p.sessionId)).toEqual(["a", "c"]);
    expect(series[1].e1rm).toBeGreaterThan(series[0].e1rm);
    expect(series[0].topWeight).toBe(100);
  });

  it("summiert das Tagesvolumen der Übung", () => {
    const series = buildE1rmSeries(
      [makeSession([{ exercise: "Squat", sets: [{ weight: 100, reps: 5 }, { weight: 50, reps: 10 }] }])],
      "Squat"
    );
    expect(series[0].volumeKg).toBe(1000);
  });

  it("gibt ein leeres Array ohne Daten zurück", () => {
    expect(buildE1rmSeries([], "Squat")).toEqual([]);
  });
});

describe("listTrackedExercises", () => {
  it("zählt Sessions pro Übung und sortiert nach Häufigkeit", () => {
    const exercises = listTrackedExercises([
      makeSession([{ exercise: "Squat", sets: [] }], "a"),
      makeSession([{ exercise: "Squat", sets: [] }, { exercise: "Bench", sets: [] }], "b"),
      makeSession([{ exercise: "squat ", sets: [] }], "c"),
    ]);
    expect(exercises[0]).toMatchObject({ name: "Squat", sessionCount: 3 });
  });
});

describe("recommendProgression", () => {
  it("empfiehlt Gewichtserhöhung bei niedrigem RPE (+2,5 kg)", () => {
    const rec = recommendProgression([{ weight: 100, reps: 5, rpe: 7 }]);
    expect(rec?.action).toBe("increase_weight");
    expect(rec?.targetWeight).toBe(102.5);
    expect(rec?.targetReps).toBe(5);
    expect(rec?.headline).toContain("+2,5 kg");
  });

  it("rundet auf verfügbare Scheibenschritte auf", () => {
    const rec = recommendProgression([{ weight: 101, reps: 5, rpe: 7 }]);
    expect(rec?.targetWeight).toBe(102.5);
    expect(rec?.headline).toContain("+1,5 kg");
  });

  it("empfiehlt +1 Wiederholung im Ziel-RPE-Bereich", () => {
    const rec = recommendProgression([{ weight: 100, reps: 8, rpe: 8 }]);
    expect(rec?.action).toBe("increase_reps");
    expect(rec?.targetReps).toBe(9);
    expect(rec?.targetWeight).toBe(100);
    expect(rec?.headline).toContain("+1 Wdh.");
  });

  it("setzt bei erreichter Wdh.-Obergrenze aufs Gewicht zurück (Doppelprogression)", () => {
    const rec = recommendProgression([{ weight: 100, reps: 10, rpe: 8 }]);
    expect(rec?.action).toBe("increase_weight");
    expect(rec?.targetWeight).toBe(102.5);
    expect(rec?.targetReps).toBe(6);
  });

  it("hält das Gewicht bei RPE nahe am Versagen", () => {
    const rec = recommendProgression([{ weight: 100, reps: 5, rpe: 10 }]);
    expect(rec?.action).toBe("hold");
    expect(rec?.targetWeight).toBe(100);
  });

  it("nutzt das beste Set als Referenz", () => {
    const rec = recommendProgression([
      { weight: 80, reps: 8, rpe: 6 },
      { weight: 100, reps: 5, rpe: 9 },
    ]);
    expect(rec?.action).toBe("increase_reps");
    expect(rec?.targetWeight).toBe(100);
  });

  it("akzeptiert RIR statt RPE", () => {
    const rec = recommendProgression([{ weight: 100, reps: 5, rir: 4 }]);
    expect(rec?.action).toBe("increase_weight");
  });

  it("gibt null ohne gültige Sets zurück", () => {
    expect(recommendProgression([])).toBeNull();
    expect(recommendProgression([{ weight: 0, reps: 0 }])).toBeNull();
  });
});

describe("Session-Helfer", () => {
  const sessions: GymSession[] = [
    makeSession([{ exercise: "Squat", sets: [{ weight: 100, reps: 5 }] }], "a", "2026-07-01"),
    makeSession([{ exercise: "Squat", sets: [{ weight: 102.5, reps: 5 }] }], "b", "2026-07-08"),
  ];

  it("findet die letzte Session mit der Übung", () => {
    expect(findLastExerciseSession(sessions, "squat")?.id).toBe("b");
    expect(findLastExerciseSession(sessions, "Bench")).toBeNull();
  });

  it("extrahiert die Sets einer Übung aus einer Session", () => {
    const sets = getExerciseSets(sessions[0], "Squat");
    expect(sets).toHaveLength(1);
    expect(Number(sets[0].weight)).toBe(100);
  });
});
