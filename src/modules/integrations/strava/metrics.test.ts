import { describe, expect, it } from "vitest";
import {
  computeZoneCompliance,
  bucketsToZoneSeconds,
  computeWorkKJ,
  computeCoachingMetrics,
} from "./metrics";
import { buildCoachingDescription, formatThousands } from "./description";

describe("computeZoneCompliance", () => {
  it("returns null without zone data", () => {
    expect(computeZoneCompliance([])).toBeNull();
    expect(computeZoneCompliance([0, 0, 0, 0, 0])).toBeNull();
  });

  it("computes share of time in zones 2–4 (hybrid target band)", () => {
    // Z1: 600 s, Z2: 1200 s, Z3: 1800 s, Z4: 1200 s, Z5: 200 s
    const compliance = computeZoneCompliance([600, 1200, 1800, 1200, 200]);
    // 4200 / 5000 = 84%
    expect(compliance).toBe(84);
  });

  it("yields 100% when all time is in target zones", () => {
    expect(computeZoneCompliance([0, 1000, 1000, 1000, 0])).toBe(100);
  });

  it("supports custom target indices", () => {
    expect(computeZoneCompliance([100, 100], [0])).toBe(50);
  });

  it("ignores negative/garbage entries", () => {
    // [-5→0, NaN→0, 100, 300]: Zielzonen (Idx 1–3) = 400 von 400 s
    expect(computeZoneCompliance([-5, NaN, 100, 300] as number[])).toBe(100);
  });
});

describe("bucketsToZoneSeconds", () => {
  it("maps strava buckets to plain seconds", () => {
    expect(
      bucketsToZoneSeconds([
        { min: 90, max: 100, time: 10 },
        { min: 100, max: 120, time: 20.7 },
        { min: 120, max: 140, time: -1 },
      ])
    ).toEqual([10, 20.7, 0]);
  });
});

describe("computeWorkKJ", () => {
  it("prefers measured kilojoules (power meter)", () => {
    expect(computeWorkKJ({ kilojoules: 1420.4, calories: 999 })).toBe(1420);
  });

  it("falls back to calories × 4.184", () => {
    expect(computeWorkKJ({ calories: 500 })).toBe(2092);
  });

  it("falls back to average watts × moving time", () => {
    expect(computeWorkKJ({ average_watts: 250, moving_time: 3600 })).toBe(900);
  });

  it("returns null without usable data", () => {
    expect(computeWorkKJ({})).toBeNull();
    expect(computeWorkKJ({ calories: 0 })).toBeNull();
  });
});

describe("structured description upload format", () => {
  it("formats the full example line", () => {
    const desc = buildCoachingDescription({
      zoneCompliancePct: 96,
      workKJ: 1420,
    });
    expect(desc).toBe("⚡ 96% Zone Compliance | 🔥 1,420 kJ Work Done | Hybrid Athlete Engine");
  });

  it("thousands-separates deterministically (en-US)", () => {
    expect(formatThousands(1234567)).toBe("1,234,567");
  });

  it("omits missing segments but keeps the signature", () => {
    expect(buildCoachingDescription({ zoneCompliancePct: null, workKJ: null })).toBe(
      "Hybrid Athlete Engine"
    );
    expect(buildCoachingDescription({ zoneCompliancePct: 88, workKJ: null })).toBe(
      "⚡ 88% Zone Compliance | Hybrid Athlete Engine"
    );
    expect(buildCoachingDescription({ zoneCompliancePct: null, workKJ: 420 })).toBe(
      "🔥 420 kJ Work Done | Hybrid Athlete Engine"
    );
  });

  it("aggregates metrics end-to-end from activity + hr buckets", () => {
    const metrics = computeCoachingMetrics(
      { kilojoules: 1419.6 },
      [
        { min: 0, max: 100, time: 250 },
        { min: 100, max: 140, time: 250 },
        { min: 140, max: 160, time: 250 },
        { min: 160, max: 180, time: 250 },
        { min: 180, max: 220, time: 0 },
      ]
    );
    // Z2–Z4: 750 von 1000 s
    expect(metrics).toEqual({ zoneCompliancePct: 75, workKJ: 1420 });
    expect(buildCoachingDescription(metrics)).toBe(
      "⚡ 75% Zone Compliance | 🔥 1,420 kJ Work Done | Hybrid Athlete Engine"
    );
  });

  it("uses local hrZones minutes as fallback source", () => {
    const metrics = computeCoachingMetrics({}, null, [10, 30, 40, 20, 0]);
    expect(metrics.zoneCompliancePct).toBe(90);
  });
});
