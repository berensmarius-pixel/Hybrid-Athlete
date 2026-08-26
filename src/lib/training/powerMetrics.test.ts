import { describe, expect, it } from "vitest";
import {
  computePowerMetrics,
  normalizedPower,
  rollingPeakPower,
  timeInPowerZones,
} from "./powerMetrics";

const FTP = 260;

function constantSeries(watts: number, seconds: number): Array<number | null> {
  return new Array(seconds).fill(watts);
}

describe("rollingPeakPower", () => {
  it("findet das beste gleitende Fenster", () => {
    const power: Array<number | null> = [
      ...constantSeries(100, 120),
      ...constantSeries(500, 5),
      ...constantSeries(100, 120),
    ];
    expect(rollingPeakPower(power, 5, 1)).toBe(500);
    expect(rollingPeakPower(power, 60, 1)).toBe(
      Math.round((55 * 100 + 5 * 500) / 60)
    );
  });

  it("liefert null, wenn die Serie kürzer als das Fenster ist", () => {
    expect(rollingPeakPower(constantSeries(300, 10), 60, 1)).toBeNull();
  });

  it("behandelt null-Werte (Ausrollen) als 0 Watt", () => {
    const power: Array<number | null> = [
      ...constantSeries(400, 30),
      ...new Array<number | null>(30).fill(null),
      ...constantSeries(400, 30),
    ];
    expect(rollingPeakPower(power, 60, 1)).toBe(200);
  });
});

describe("normalizedPower (Coggan)", () => {
  it("ergibt bei konstanter Leistung genau den Mittelwert", () => {
    const np = normalizedPower(constantSeries(200, 3600), 1);
    expect(np).toBe(200);
  });

  it("ist invariant gegen schnelles Alternieren mit gleichem 30s-Mittel", () => {
    const alternating = Array.from({ length: 1800 }, (_, i) =>
      i % 2 === 0 ? 300 : 100
    );
    expect(normalizedPower(alternating, 1)).toBe(200);
  });

  it("gewichtet Variabilität höher als den Durchschnitt", () => {
    const steady = constantSeries(225, 800);
    const variable: Array<number | null> = [];
    for (let i = 0; i < 10; i++) {
      variable.push(...constantSeries(400, 40));
      variable.push(...constantSeries(50, 40));
    }
    const npVariable = normalizedPower(variable, 1)!;
    expect(npVariable).toBeGreaterThan(225);
    expect(normalizedPower(steady, 1)).toBe(225);
  });

  it("fällt bei kurzen Serien (<30s) auf den gültigen Mittelwert zurück", () => {
    expect(normalizedPower([...constantSeries(150, 20)], 1)).toBe(150);
  });
});

describe("timeInPowerZones", () => {
  it("verteilt Sekunden auf Zonen gemäß FTP-Prozent", () => {
    const power: Array<number | null> = [
      ...constantSeries(130, 600),
      ...constantSeries(286, 600),
    ];
    const zones = timeInPowerZones(power, 1, FTP);

    // 130 W ≈ 50 % FTP → Z1; 286 W ≈ 110 % FTP → Z5
    const z1 = zones.find((z) => z.zone === 1)!;
    const z5 = zones.find((z) => z.zone === 5)!;
    expect(z1.minutes).toBeCloseTo(10, 1);
    expect(z5.minutes).toBeCloseTo(10, 1);
    const total = zones.reduce((sum, z) => sum + z.minutes, 0);
    expect(total).toBeCloseTo(20, 1);
  });

  it("ignoriert null- und 0-Watt-Samples", () => {
    const zones = timeInPowerZones([...new Array(60).fill(null), 0, ...constantSeries(200, 60)], 1, FTP);
    const total = zones.reduce((sum, z) => sum + z.minutes, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("computePowerMetrics", () => {
  it("bereitet NP/IF/TSS nach Coggan-Formel auf", () => {
    const metrics = computePowerMetrics({
      power: constantSeries(200, 3600),
      intervalSeconds: 1,
      ftpWatts: FTP,
    });

    const expectedIf = Math.round((200 / FTP) * 1000) / 1000;
    const expectedTss =
      Math.round(((3600 * 200 * expectedIf) / (FTP * 3600)) * 100 * 10) / 10;

    expect(metrics.avgPowerWatts).toBe(200);
    expect(metrics.normalizedPower).toBe(200);
    expect(metrics.intensityFactor).toBe(expectedIf);
    expect(metrics.trainingStressScore).toBe(expectedTss);
    expect(metrics.maxPowerWatts).toBe(200);
    expect(metrics.movingSeconds).toBe(3600);
  });

  it("liefert Peaks für 5s/1min/5min/20min", () => {
    const power: Array<number | null> = [
      ...constantSeries(220, 7200),
      ...constantSeries(700, 5),
    ];
    const metrics = computePowerMetrics({
      power,
      intervalSeconds: 1,
      ftpWatts: FTP,
    });

    const byDuration = new Map(
      metrics.peakPowers.map((p) => [p.durationSeconds, p.watts])
    );
    expect(byDuration.get(5)).toBe(700);
    expect(byDuration.get(60)!).toBeGreaterThan(byDuration.get(300)!);
    expect(byDuration.get(300)!).toBeGreaterThan(byDuration.get(1200)!);
  });
});
