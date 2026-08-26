import { describe, it, expect } from "vitest";
import {
  aggregateWeeklyTimeInZones,
  classifyZoneDistribution,
  zoneRows,
} from "./zones";
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

const NOW = "2026-08-20T12:00:00Z";

describe("aggregateWeeklyTimeInZones", () => {
  it("summiert Power-Zonen (7 Einträge) der letzten 7 Tage", () => {
    const activities = [
      makeActivity({
        id: "a1",
        startTime: "2026-08-18T10:00:00Z",
        timeInZonesMin: [20, 25, 10, 5, 0, 0, 0],
      }),
      makeActivity({
        id: "a2",
        startTime: "2026-08-19T10:00:00Z",
        timeInZonesMin: [10, 15, 5, 2, 3, 0, 0],
      }),
      // außerhalb des Fensters
      makeActivity({
        id: "old",
        startTime: "2026-07-01T10:00:00Z",
        timeInZonesMin: [60, 0, 0, 0, 0, 0, 0],
      }),
    ];

    const dist = aggregateWeeklyTimeInZones(activities, { nowISO: NOW });
    expect(dist.power).toEqual([30, 40, 15, 7, 3, 0, 0]);
    expect(dist.hr).toBeNull();
  });

  it("ordnet 5-Einträge-Arrays den HF-Zonen zu", () => {
    const activities = [
      makeActivity({
        id: "run",
        type: "running",
        startTime: "2026-08-19T10:00:00Z",
        timeInZonesMin: [30, 20, 8, 2, 0],
      }),
    ];

    const dist = aggregateWeeklyTimeInZones(activities, { nowISO: NOW });
    expect(dist.hr).toEqual([30, 20, 8, 2, 0]);
    expect(dist.power).toBeNull();
  });

  it("liefert null ohne Daten im Fenster", () => {
    const dist = aggregateWeeklyTimeInZones([], { nowISO: NOW });
    expect(dist.power).toBeNull();
    expect(dist.hr).toBeNull();
  });
});

describe("classifyZoneDistribution", () => {
  it("erkennt Polarized (80/20)", () => {
    // 80 % Z1-2, 5 % Z3-4, 15 % Z5-7
    const result = classifyZoneDistribution([50, 30, 4, 1, 6, 6, 3]);
    expect(result.cls).toBe("polarized");
    expect(result.shares.easyPct).toBe(80);
  });

  it("erkennt Pyramidal", () => {
    // 65 / 25 / 10 fallend
    const result = classifyZoneDistribution([45, 20, 17, 8, 6, 3, 1]);
    expect(result.cls).toBe("pyramidal");
  });

  it("erkennt Threshold-Heavy über dominanten Mittelblock", () => {
    // mid (Z3+Z4) ≈ 45 %
    const result = classifyZoneDistribution([30, 20, 28, 17, 3, 2, 0]);
    expect(result.cls).toBe("threshold_heavy");
  });

  it("erkennt Threshold-Heavy über hohen Z4-Anteil allein", () => {
    // Z4 = 20 % ≥ 18 %, mid nur ~30 %
    const result = classifyZoneDistribution([35, 25, 10, 20, 5, 4, 1]);
    expect(result.cls).toBe("threshold_heavy");
  });

  it("erkennt Base Only bei fast null harten Anteilen", () => {
    const result = classifyZoneDistribution([55, 40, 5, 0, 0, 0, 0]);
    expect(result.cls).toBe("base_only");
  });

  it("klassifiziert HF-Verteilungen (5 Zonen)", () => {
    // HR: Easy Z1-2 = 82 %, Mid Z3 = 6 %, Hard Z4-5 = 12 %
    const hr = classifyZoneDistribution([60, 22, 6, 9, 3]);
    expect(hr.cls).toBe("polarized");

    // HR: Z3-lastig
    const thr = classifyZoneDistribution([30, 25, 32, 10, 3]);
    expect(thr.cls).toBe("threshold_heavy");
  });

  it("liefert Base Only + Hinweis bei leeren Daten", () => {
    const result = classifyZoneDistribution([0, 0, 0, 0, 0, 0, 0]);
    expect(result.label).toContain("Keine Daten");
  });
});

describe("zoneRows", () => {
  it("erzeugt Zeilen mit Minuten und Anteilen", () => {
    const rows = zoneRows([60, 30, 10, 0, 0, 0, 0], "power");
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ zone: "Z1", minutes: 60, sharePct: 60 });
    expect(rows[2].sharePct).toBe(10);
  });

  it("nutzt übergebenes Gesamttotal", () => {
    const rows = zoneRows([50, 50], "hr", 200);
    expect(rows[0].sharePct).toBe(25);
  });
});
