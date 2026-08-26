import { describe, expect, it } from "vitest";
import {
  extractLocalDate,
  mapSportType,
  normalizeStartTimeIso,
  parseActivityDetails,
  toGarminActivity,
  type GarminDetailPayload,
} from "./garminActivityMapper";

const SAMPLE: GarminDetailPayload = {
  success: true,
  activityId: 1849302918,
  summary: {
    activityId: 1849302918,
    activityName: "Abend-Rolle",
    activityTypeDTO: { typeKey: "road_biking", typeKeyDisplay: "Rennrad" },
    startTimeLocal: "2026-08-25 18:12:03",
    startTimeGMT: "2026-08-25 16:12:03 GMT",
    duration: 3720.0,
    movingDuration: 3510.0,
    distance: 48250.0,
    calories: 812,
    averageHR: 148.0,
    maxHR: 178.0,
    averagePower: 232.0,
    maxPower: 890.0,
    normalizedPower: 254.0,
    functionalThresholdPower: 280.0,
    trainingStressScore: 79.6,
    intensityFactor: 0.9071428571428571,
    elevationGain: 342.0,
    aerobicTrainingEffect: 3.4,
    anaerobicTrainingEffect: 1.2,
    averageBikeCadence: 91.5,
  },
  hrTimeInZones: {
    zones: [
      { zoneNumber: 1, secsInZone: 600 },
      { zoneNumber: 2, secsInZone: 1200 },
      { zoneNumber: 3, secsInZone: 1500 },
      { zoneNumber: 4, secsInZone: 420 },
      { zoneNumber: 5, secsInZone: 0 },
    ],
  },
};

describe("mapSportType", () => {
  it("mapped bekannte Garmin-TypeKeys", () => {
    expect(mapSportType("road_biking")).toBe("cycling");
    expect(mapSportType("indoor_cycling")).toBe("cycling");
    expect(mapSportType("trail_running")).toBe("running");
    expect(mapSportType("strength_training")).toBe("gym");
    expect(mapSportType("swimming")).toBe("other");
    expect(mapSportType(undefined)).toBe("other");
  });
});

describe("parseActivityDetails", () => {
  const parsed = parseActivityDetails(SAMPLE);

  it("extrahiert Kern-Metriken", () => {
    expect(parsed.garminId).toBe("1849302918");
    expect(parsed.name).toBe("Abend-Rolle");
    expect(parsed.sport).toBe("cycling");
    expect(parsed.durationSeconds).toBe(3720);
    expect(parsed.movingDurationSeconds).toBe(3510);
    expect(parsed.distanceMeters).toBe(48250);
    expect(parsed.calories).toBe(812);
    expect(parsed.avgHeartRate).toBe(148);
    expect(parsed.maxHeartRate).toBe(178);
    expect(parsed.normalizedPowerWatts).toBe(254);
    expect(parsed.tss).toBeCloseTo(79.6);
    expect(parsed.intensityFactor).toBeCloseTo(0.9071, 3);
    expect(parsed.avgCadenceRpm).toBe(91.5);
  });

  it("berechnet Arbeit in kJ aus Power × Moving Duration", () => {
    expect(parsed.workKJ).toBe(Math.round((232 * 3510) / 1000)); // 814
  });

  it("konvertiert Zonen-Sekunden in Minuten", () => {
    expect(parsed.hrTimeInZonesMin).toEqual([10, 20, 25, 7, 0]);
  });

  it("liefert lokale Datum + ISO-Startzeit", () => {
    expect(parsed.localDate).toBe("2026-08-25");
    expect(normalizeStartTimeIso(SAMPLE.summary!)).toBe(
      new Date("2026-08-25T16:12:03Z").toISOString()
    );
  });

  it("nutzt work-Feld aus dem Summary wenn vorhanden", () => {
    const withWork = parseActivityDetails({
      ...SAMPLE,
      summary: { ...SAMPLE.summary!, work: 900000 },
    });
    expect(withWork.workKJ).toBe(900);
  });

  it("überlebt leere/defekte Payloads ohne Exception", () => {
    const empty = parseActivityDetails({});
    expect(empty.garminId).toBe("0");
    expect(empty.durationSeconds).toBe(0);
    expect(empty.hrTimeInZonesMin).toBeNull();
  });
});

describe("toGarminActivity", () => {
  it("erzeugt merge-fähigen UI-Datensatz", () => {
    const parsed = parseActivityDetails(SAMPLE);
    const activity = toGarminActivity(parsed);
    expect(activity.id).toBe("garmin-1849302918");
    expect(activity.type).toBe("cycling");
    expect(activity.source).toBe("webhook");
    expect(activity.workKJ).toBeGreaterThan(0);
    expect(activity.timeInZonesMin).toEqual([10, 20, 25, 7, 0]);
  });
});

describe("extractLocalDate", () => {
  it("bevorzugt startTimeLocal", () => {
    expect(extractLocalDate({ startTimeLocal: "2026-01-02 09:00:00", startTimeGMT: "2026-01-01 22:00:00 GMT" })).toBe(
      "2026-01-02"
    );
  });

  it("fällt auf heute bei Müll zurück", () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test(extractLocalDate({}))).toBe(true);
  });
});
