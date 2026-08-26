import { describe, expect, it } from "vitest";
import {
  buildLoadSeries,
  computeDailyTss,
  computeTrainingLoadFromActivities,
  summarizeLoad,
} from "./trainingLoad";
import { decayFactor } from "@/lib/training/banisterModel";
import type { GarminActivity } from "@/types";

function makeActivity(overrides: Partial<GarminActivity>): GarminActivity {
  return {
    id: "a1",
    name: "Test",
    type: "cycling",
    device: "Edge 840",
    startTime: "2026-08-20T09:00:00",
    durationSeconds: 3600,
    distanceMeters: 30000,
    caloriesBurned: 600,
    ...overrides,
  };
}

describe("computeDailyTss", () => {
  it("nutzt vorhandenes Garmin-TSS", () => {
    const tss = computeDailyTss(makeActivity({ tss: 82.4 }));
    expect(tss).toBeCloseTo(82.4);
  });

  it("fällt auf kJ zurück (Rad ≈ 1 TSS/kJ)", () => {
    const tss = computeDailyTss(
      makeActivity({ workKJ: 1234, durationSeconds: 0, avgHeartRate: undefined })
    );
    expect(tss).toBeCloseTo(1234);
  });

  it("berechnet rTSS-Näherung aus Durchschnitts-HF", () => {
    // 1h @ Schwellen-HF → 100 rTSS
    const tss = computeDailyTss(makeActivity({ avgHeartRate: 168 }), { thresholdHr: 168 });
    expect(tss).toBeCloseTo(100);
  });

  it("moderater Fallback ohne HF", () => {
    const tss = computeDailyTss(
      makeActivity({ durationSeconds: 3600, avgHeartRate: undefined })
    );
    expect(tss).toBeCloseTo(55);
  });

  it("gibt 0 für leere Aktivität", () => {
    expect(computeDailyTss(makeActivity({ durationSeconds: 0 }))).toBe(0);
  });
});

describe("buildLoadSeries", () => {
  it("füllt trainingsfreie Tage mit TSS=0 und akkumuliert Banister-EMA", () => {
    const series = buildLoadSeries(
      [
        { date: "2026-01-01", tss: 70 },
        { date: "2026-01-02", tss: 140 },
      ],
      new Date(2026, 0, 3)
    );

    expect(series).toHaveLength(3);

    const ctlStep = decayFactor(42);
    const atlStep = decayFactor(7);

    // Tag 1
    const atlDay1 = 70 * atlStep;
    const ctlDay1 = 70 * ctlStep;
    expect(series[0].dailyTss).toBe(70);
    expect(series[0].atl).toBeCloseTo(atlDay1, 1);
    expect(series[0].ctl).toBeCloseTo(ctlDay1, 1);

    // Tag 2
    const atlDay2 = atlDay1 + (140 - atlDay1) * atlStep;
    const ctlDay2 = ctlDay1 + (140 - ctlDay1) * ctlStep;
    expect(series[1].atl).toBeCloseTo(atlDay2, 1);
    expect(series[1].ctl).toBeCloseTo(ctlDay2, 1);

    // Tag 3 (Ruhetag): Last sinkt, Form bleibt negativ, TSB = CTL − ATL
    expect(series[2].dailyTss).toBe(0);
    expect(series[2].atl).toBeLessThan(series[1].atl);
    expect(Math.abs(series[2].tsb - (series[2].ctl - series[2].atl))).toBeLessThanOrEqual(
      0.11
    );
  });

  it("liefert leere Reihe ohne gültige Eingaben", () => {
    expect(buildLoadSeries([], new Date(2026, 0, 1))).toEqual([]);
    expect(buildLoadSeries([{ date: "kein-datum", tss: 5 }])).toEqual([]);
  });
});

describe("summarizeLoad", () => {
  it("ordnet Form-Status korrekt ein", () => {
    const fresh = summarizeLoad([
      { date: "2026-01-01", dailyTss: 0, atl: 40, ctl: 60, tsb: 20 },
    ]);
    expect(fresh?.status).toBe("fresh");

    const overreaching = summarizeLoad([
      { date: "2026-01-01", dailyTss: 0, atl: 95, ctl: 60, tsb: -35 },
    ]);
    expect(overreaching?.status).toBe("overreaching");

    const neutral = summarizeLoad([
      { date: "2026-01-01", dailyTss: 0, atl: 65, ctl: 62, tsb: -3 },
    ]);
    expect(neutral?.status).toBe("neutral");
  });

  it("gibt null für leere Reihe", () => {
    expect(summarizeLoad([])).toBeNull();
  });
});

describe("computeTrainingLoadFromActivities", () => {
  it("gruppiert Aktivitäten nach lokalem Startdatum", () => {
    const { snapshot } = computeTrainingLoadFromActivities(
      [makeActivity({ tss: 100, startTime: "2026-03-10T18:30:00" })],
      { endDate: new Date(2026, 2, 12) }
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot?.date).toBe("2026-03-12");
    expect(snapshot?.ctl).toBeGreaterThan(0);
    expect(snapshot?.tsb).toBeLessThan(0);
  });

  it("ignoriert Aktivitäten mit ungültigem Datum", () => {
    const { series } = computeTrainingLoadFromActivities([
      makeActivity({ startTime: "" }),
    ]);
    expect(series).toEqual([]);
  });
});
