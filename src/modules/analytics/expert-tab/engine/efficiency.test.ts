import { describe, it, expect } from "vitest";
import {
  computeEfficiencyFactor,
  selectSteadyZone2Rides,
  buildEfficiencyPoints,
  computeAerobicDecoupling,
  linearTrend,
} from "./efficiency";
import type { GarminActivity } from "@/types";

function makeActivity(
  overrides: Partial<GarminActivity> & { id: string; startTime?: string }
): GarminActivity {
  return {
    name: "Z2 Ride",
    type: "cycling",
    device: "Edge 840",
    durationSeconds: 5400,
    distanceMeters: 45_000,
    caloriesBurned: 900,
    avgPowerWatts: 190,
    avgHeartRate: 130,
    startTime: "2026-08-05T09:00:00Z",
    ...overrides,
  } as GarminActivity;
}

describe("computeEfficiencyFactor", () => {
  it("dividiert Power durch HF", () => {
    expect(computeEfficiencyFactor(195, 130)).toBeCloseTo(1.5);
    expect(computeEfficiencyFactor(200, 125)).toBeCloseTo(1.6);
  });

  it("verwirft unplausible Werte", () => {
    expect(computeEfficiencyFactor(0, 130)).toBeNull();
    expect(computeEfficiencyFactor(200, 60)).toBeNull();
    expect(computeEfficiencyFactor(NaN, 120)).toBeNull();
  });
});

describe("selectSteadyZone2Rides", () => {
  const ftp = 260;

  it("behält nur Rad-Einheiten im Z2-Fenster mit ausreichender Dauer", () => {
    const rides = [
      // klassische Z2-Einheit (73 % FTP)
      makeActivity({ id: "z2", avgPowerWatts: 190, avgHeartRate: 132 }),
      // zu kurz
      makeActivity({
        id: "short",
        startTime: "2026-08-01T09:00:00Z",
        durationSeconds: 1800,
      }),
      // zu intensiv (Threshold)
      makeActivity({ id: "thr", avgPowerWatts: 265 }),
      // Laufen ohne Power zählt nicht
      makeActivity({ id: "run", type: "running", avgPowerWatts: undefined }),
      // HF fehlt
      makeActivity({ id: "nohr", avgHeartRate: undefined }),
    ];

    const selected = selectSteadyZone2Rides(rides, ftp);
    expect(selected.map((r) => r.id)).toEqual(["z2"]);
  });

  it("akzeptiert die untere Z2-Grenze (~55 % FTP)", () => {
    const rides = selectSteadyZone2Rides(
      [makeActivity({ id: "easy", avgPowerWatts: 135 })],
      ftp
    );
    expect(rides).toHaveLength(1);
  });

  it("liefert leer bei FTP ≤ 0", () => {
    expect(selectSteadyZone2Rides([makeActivity({ id: "a" })], 0)).toHaveLength(0);
  });
});

describe("buildEfficiencyPoints", () => {
  it("erzeugt aufsteigend sortierte EF-Punkte", () => {
    const points = buildEfficiencyPoints([
      makeActivity({ id: "b", startTime: "2026-08-10T09:00:00Z" }),
      makeActivity({ id: "a", startTime: "2026-08-01T09:00:00Z", avgPowerWatts: 185, avgHeartRate: 128 }),
    ]);

    expect(points.map((p) => p.activityId)).toEqual(["a", "b"]);
    expect(points[0].ef).toBeCloseTo(185 / 128, 3);
    expect(points[1].ef).toBeCloseTo(190 / 130, 3);
  });
});

describe("computeAerobicDecoupling", () => {
  it("berechnet Pw:Hr aus zwei Hälften", () => {
    const watts = Array.from({ length: 200 }, (_, i) => (i < 100 ? 200 : 190));
    const hrs = Array.from({ length: 200 }, () => 130);

    // EF fällt von 1.538 auf 1.462 → Decoupling ≈ 5 %
    const dec = computeAerobicDecoupling(watts, hrs);
    expect(dec).not.toBeNull();
    expect(dec!).toBeGreaterThan(4);
    expect(dec!).toBeLessThan(6);
  });

  it("liefert ~0 bei konstanter Leistung", () => {
    const watts = new Array(200).fill(200);
    const hrs = new Array(200).fill(130);
    expect(computeAerobicDecoupling(watts, hrs)).toBeCloseTo(0, 1);
  });

  it("liefert null bei zu kurzen oder misshapen Sequenzen", () => {
    expect(computeAerobicDecoupling([200, 200], [130, 131])).toBeNull();
    expect(computeAerobicDecoupling(new Array(100).fill(200), [])).toBeNull();
  });

  it("ignoriert Samples ohne gültige HF", () => {
    const watts = new Array(200).fill(200);
    const hrs = new Array<number>(200).fill(0); // alle ungültig
    expect(computeAerobicDecoupling(watts, hrs)).toBeNull();
  });
});

describe("linearTrend", () => {
  it("findet exakte Steigung bei perfekter Linie", () => {
    const trend = linearTrend([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
    expect(trend!.slope).toBeCloseTo(1);
    expect(trend!.intercept).toBeCloseTo(1);
  });

  it("liefert null für einzelne Punkte", () => {
    expect(linearTrend([{ x: 1, y: 1 }])).toBeNull();
  });

  it("handhabt vertikale Punktwolken (x konstant)", () => {
    const trend = linearTrend([
      { x: 5, y: 1 },
      { x: 5, y: 2 },
    ]);
    expect(trend!.slope).toBe(0);
    expect(trend!.intercept).toBe(1.5);
  });
});
