import { describe, expect, it } from "vitest";
import {
  TIMESTAMP_TOLERANCE_MS,
  DURATION_TOLERANCE_SECONDS,
  isWithinTolerance,
  findDuplicate,
  sessionToCandidate,
  garminToCandidate,
  type DedupCandidate,
} from "./dedup";
import type { EnduranceSession, GarminActivity } from "@/types";

const T0 = Date.UTC(2026, 5, 15, 7, 30, 0);

function cand(offsetMin: number, durationS: number): DedupCandidate {
  return { startTimeMs: T0 + offsetMin * 60_000, durationSeconds: durationS };
}

describe("dedup tolerance constants", () => {
  it("uses ±2 minutes and ±30 seconds", () => {
    expect(TIMESTAMP_TOLERANCE_MS).toBe(120_000);
    expect(DURATION_TOLERANCE_SECONDS).toBe(30);
  });
});

describe("isWithinTolerance", () => {
  it("matches identical activities", () => {
    expect(isWithinTolerance(cand(0, 3600), cand(0, 3600))).toBe(true);
  });

  it("matches at exactly +2 min start offset with same duration", () => {
    expect(isWithinTolerance(cand(0, 3600), cand(2, 3600))).toBe(true);
  });

  it("matches at exactly -2 min start offset", () => {
    expect(isWithinTolerance(cand(0, 3600), cand(-2, 3600))).toBe(true);
  });

  it("rejects beyond +2 min start offset", () => {
    // 2 min + 1 s
    const a = { startTimeMs: T0, durationSeconds: 3600 };
    const b = { startTimeMs: T0 + 121_000, durationSeconds: 3600 };
    expect(isWithinTolerance(a, b)).toBe(false);
  });

  it("rejects when duration differs by more than ±30 s even if time matches", () => {
    expect(isWithinTolerance(cand(0, 3600), cand(1, 3631))).toBe(false);
  });

  it("accepts small duration drift between sources (GPS/auto-pause)", () => {
    expect(isWithinTolerance(cand(0, 3600), cand(1, 3625))).toBe(true);
  });
});

describe("sessionToCandidate / garminToCandidate", () => {
  const session: EnduranceSession = {
    kind: "endurance",
    id: "strava-123",
    date: new Date(T0).toISOString(),
    activityType: "cycling",
    duration: "1:00:00",
    heartRate: 140,
    pace: "33.5 km/h",
    rpe: 0,
  };

  const garmin: GarminActivity = {
    id: "garmin-abc",
    garminId: "abc",
    name: "Morning Ride",
    type: "cycling",
    device: "Edge 840",
    startTime: new Date(T0).toISOString(),
    durationSeconds: 3598,
    distanceMeters: 32_000,
    caloriesBurned: 800,
  };

  it("parses H:MM:SS durations from sessions", () => {
    expect(sessionToCandidate(session)).toEqual({
      startTimeMs: T0,
      durationSeconds: 3600,
    });
  });

  it("parses MM:SS durations from sessions", () => {
    expect(
      sessionToCandidate({ ...session, duration: "45:30" })
    ).toMatchObject({ durationSeconds: 2730 });
  });

  it("returns null for corrupt session data", () => {
    expect(sessionToCandidate({ ...session, date: "not-a-date" })).toBeNull();
    expect(sessionToCandidate({ ...session, duration: "???" })).toBeNull();
  });

  it("converts garmin activities", () => {
    expect(garminToCandidate(garmin)).toEqual({
      startTimeMs: T0,
      durationSeconds: 3598,
    });
  });

  it("returns null for corrupt garmin data", () => {
    expect(garminToCandidate({ ...garmin, startTime: "" })).toBeNull();
    expect(
      garminToCandidate({ ...garmin, durationSeconds: NaN })
    ).toBeNull();
  });
});

describe("findDuplicate (Garmin ↔ Strava cross-source scenario)", () => {
  const existing = [cand(-1440, 1800), cand(0, 3600), cand(+2880, 7200)];

  it("flags a Strava activity that duplicates a Garmin recording", () => {
    // Garmin: 07:30:00 für 3600 s – Strava meldet Start 90 s später, 20 s kürzer
    const incoming = { startTimeMs: T0 + 90_000, durationSeconds: 3580 };
    expect(findDuplicate(incoming, existing)).toBeDefined();
  });

  it("does not flag distinct activities", () => {
    // 3 Stunden später, andere Dauer
    const incoming = { startTimeMs: T0 + 3 * 3_600_000, durationSeconds: 4200 };
    expect(findDuplicate(incoming, existing)).toBeUndefined();
  });

  it("same time but clearly different workout length is not a duplicate", () => {
    const incoming = { startTimeMs: T0, durationSeconds: 3600 + 61 };
    expect(findDuplicate(incoming, existing)).toBeUndefined();
  });
});
