import { describe, it, expect } from "vitest";
import {
  fitCriticalPowerModel,
  predictCriticalPower,
  estimateCurve,
  buildPowerDurationCurves,
  collectActivityAnchors,
  toRelativeCurve,
  meanMaxPowerForSeries,
  percentOfFtp,
  PDC_DURATIONS_SECONDS,
} from "./powerDuration";
import type { GarminActivity } from "@/types";

function makeActivity(
  overrides: Partial<GarminActivity> & { id: string; startTime: string }
): GarminActivity {
  return {
    name: "Ride",
    type: "cycling",
    device: "Edge 840",
    durationSeconds: 3600,
    distanceMeters: 40_000,
    caloriesBurned: 900,
    ...overrides,
  } as GarminActivity;
}

describe("fitCriticalPowerModel", () => {
  it("rekonstruiert ein perfektes CP-Modell exakt", () => {
    const cp = 250;
    const wPrime = 18000;
    const anchors = [60, 300, 600, 1200].map((t) => ({
      durationSeconds: t,
      watts: cp + wPrime / t,
    }));

    const model = fitCriticalPowerModel(anchors);
    expect(model).not.toBeNull();
    expect(model!.cpWatts).toBeCloseTo(cp, 0);
    expect(model!.wPrimeJoules).toBeCloseTo(wPrime, -1);
    expect(model!.r2).toBeGreaterThan(0.999);
  });

  it("liefert null bei weniger als zwei langen Ankern", () => {
    expect(fitCriticalPowerModel([])).toBeNull();
    expect(fitCriticalPowerModel([{ durationSeconds: 300, watts: 300 }])).toBeNull();
  });

  it("ignoriert Anker unter der Mindestdauer", () => {
    const model = fitCriticalPowerModel([
      { durationSeconds: 1, watts: 1200 },
      { durationSeconds: 5, watts: 900 },
      { durationSeconds: 300, watts: 300 },
      { durationSeconds: 1200, watts: 265 },
    ]);
    expect(model).not.toBeNull();
  });
});

describe("predictCriticalPower", () => {
  it("fällt monoton mit der Dauer", () => {
    const model = { cpWatts: 250, wPrimeJoules: 18000, r2: 1 };
    let prev = Infinity;
    for (const d of PDC_DURATIONS_SECONDS) {
      const p = predictCriticalPower(model, d);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });
});

describe("estimateCurve", () => {
  it("bevorzugt gemessene Anker und füllt Lücken per Modell", () => {
    const { points, model } = estimateCurve([
      { durationSeconds: 1, watts: 1000 },
      { durationSeconds: 300, watts: 330 },
      { durationSeconds: 3600, watts: 260 },
    ]);

    expect(model).not.toBeNull();
    expect(points.find((p) => p.durationSeconds === 300)?.watts).toBe(330);
    expect(points.find((p) => p.durationSeconds === 3600)?.watts).toBe(260);
    // 1s liegt über dem Modell-Cap (max*1.35), aber unter dem Max-Anker
    expect(points.find((p) => p.durationSeconds === 1)?.watts).toBe(1000);
    // Alle Standarddauern sind befüllt
    expect(points.every((p) => p.watts !== null && p.watts > 0)).toBe(true);
  });

  it("liefert Nullpunkte ohne Anker", () => {
    const { points, model } = estimateCurve([]);
    expect(model).toBeNull();
    expect(points.every((p) => p.watts === null)).toBe(true);
  });
});

describe("collectActivityAnchors", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");

  it("filtert nach Zeitfenster und erzeugt Avg/Max-Anker", () => {
    const activities = [
      makeActivity({
        id: "a1",
        startTime: "2026-08-15T10:00:00Z",
        avgPowerWatts: 220,
        maxPowerWatts: 950,
        durationSeconds: 5400,
      }),
      makeActivity({
        id: "a2",
        startTime: "2026-01-01T10:00:00Z",
        avgPowerWatts: 240,
        durationSeconds: 3600,
      }),
    ];

    const recent = collectActivityAnchors(activities, now - 42 * 864e5, now);
    expect(recent.map((a) => a.activityId)).toEqual(["a1", "a1"]);

    const season = collectActivityAnchors(activities, now - 365 * 864e5, now);
    expect(season.length).toBe(3);
  });

  it("verwirft Aktivitäten ohne Power", () => {
    const anchors = collectActivityAnchors(
      [makeActivity({ id: "a3", startTime: "2026-08-10T10:00:00Z" })],
      now - 42 * 864e5,
      now
    );
    expect(anchors).toHaveLength(0);
  });
});

describe("buildPowerDurationCurves", () => {
  const nowISO = "2026-08-20T12:00:00Z";
  const now = Date.parse(nowISO);

  it("teilt Aktivitäten in 42-Tage- und Saisonkurve auf", () => {
    const activities = [
      makeActivity({
        id: "recent",
        startTime: new Date(now - 10 * 864e5).toISOString(),
        avgPowerWatts: 230,
        maxPowerWatts: 900,
        durationSeconds: 7200,
      }),
      makeActivity({
        id: "old",
        startTime: new Date(now - 200 * 864e5).toISOString(),
        avgPowerWatts: 210,
        maxPowerWatts: 800,
        durationSeconds: 3600,
      }),
    ];

    const curves = buildPowerDurationCurves(activities, {
      nowISO,
      benchmarkHistory: { records: [], updatedAt: nowISO },
    });

    expect(curves.currentAnchors.length).toBeGreaterThan(0);
    expect(curves.seasonAnchors.length).toBeGreaterThan(
      curves.currentAnchors.length
    );
    expect(
      curves.season.every((p) => p.watts !== null)
    ).toBe(true);
  });

  it("webt persistierte Benchmarks in beide Kurven ein", () => {
    const curves = buildPowerDurationCurves([], {
      nowISO,
      benchmarkHistory: {
        records: [
          {
            durationSeconds: 1200,
            label: "20m",
            bestWatts: 310,
            achievedAt: new Date(now - 3 * 864e5).toISOString(),
          },
          {
            durationSeconds: 300,
            label: "5m",
            bestWatts: 380,
            achievedAt: "2026-02-01T10:00:00Z",
          },
        ],
        updatedAt: nowISO,
      },
    });

    expect(
      curves.current.find((p) => p.durationSeconds === 1200)?.watts
    ).toBe(310);
    expect(
      curves.season.find((p) => p.durationSeconds === 300)?.watts
    ).toBe(380);
    // 42-Tage-Kurve enthält nur die frische Benchmark
    expect(curves.current.find((p) => p.durationSeconds === 300)?.watts).toBeNull();
  });
});

describe("toRelativeCurve", () => {
  it("dividiert durch das Körpergewicht", () => {
    const rel = toRelativeCurve(
      [{ durationSeconds: 60, watts: 400 }],
      80
    );
    expect(rel[0].watts).toBe(5);
  });

  it("liefert null bei ungültigem Gewicht", () => {
    const rel = toRelativeCurve([{ durationSeconds: 60, watts: 400 }], 0);
    expect(rel[0].watts).toBeNull();
  });
});

describe("meanMaxPowerForSeries", () => {
  it("findet das beste 30s-Fenster in einer Rampe", () => {
    // Linear steigende Leistung 100 → 500 W über 120 s
    const watts = Array.from({ length: 120 }, (_, i) => 100 + i * (400 / 119));
    const bests = meanMaxPowerForSeries(watts, 1);
    const best30 = bests.find((b) => b.durationSeconds === 30);
    expect(best30).toBeDefined();
    // Bestes Fenster = letzte 30 Samples (402.5 … 500 W) → Mittelwert ≈ 451
    expect(best30!.bestWatts).toBeGreaterThanOrEqual(448);
    expect(best30!.bestWatts).toBeLessThanOrEqual(455);
  });

  it("bricht bei zu kurzer Sequenz sauber ab", () => {
    const bests = meanMaxPowerForSeries([200, 210, 220], 1);
    // Nur die 1s-Bestleistung ist auswertbar
    expect(bests).toHaveLength(1);
    expect(bests[0].durationSeconds).toBe(1);
    expect(bests[0].bestWatts).toBe(220);
  });
});

describe("percentOfFtp", () => {
  it("rechnet Watt in % FTP um", () => {
    expect(percentOfFtp(275, 250)).toBe(110);
    expect(percentOfFtp(null, 250)).toBeNull();
  });
});
