import { describe, expect, it } from "vitest";
import {
  DEFAULT_FITNESS_PROFILE,
  classifyIntensity,
  detectTotalDurationMinutes,
  extractCadenceRange,
  extractFtpPctRange,
  generateEnduranceSteps,
  resolveStepTargets,
  stripMetricsFromNotes,
} from "./targetEngine";

const PROFILE = DEFAULT_FITNESS_PROFILE;

describe("classifyIntensity", () => {
  it("erkennt Schwellen-/Threshold-Workouts", () => {
    expect(classifyIntensity("4x 8 Min Schwellenintervalle")).toBe("threshold");
    expect(classifyIntensity("Zone 4 Intervalle")).toBe("threshold");
  });

  it("erkennt VO2max, Sweetspot und Grundlage", () => {
    expect(classifyIntensity("5x 3 Min VO2max Intervalle")).toBe("vo2max");
    expect(classifyIntensity("2x20 Min Sweetspot")).toBe("sweetspot");
    expect(classifyIntensity("Lange Ausfahrt Grundlage Zone 2")).toBe("endurance");
  });

  it("erkennt Over-Unders vor anderen Patterns", () => {
    expect(classifyIntensity("Over-Unders 3x (3 Min über / 2 Min unter)")).toBe("overUnder");
  });
});

describe("extractFtpPctRange", () => {
  it("parst Bereichsangaben", () => {
    expect(extractFtpPctRange("@ 95–105% FTP")).toEqual({ low: 0.95, high: 1.05 });
    expect(extractFtpPctRange("88-94% der FTP")).toEqual({ low: 0.88, high: 0.94 });
  });

  it("parst Einzelwerte", () => {
    expect(extractFtpPctRange("100% FTP")).toEqual({ low: 1.0, high: 1.0 });
  });

  it("liefert null ohne Angabe", () => {
    expect(extractFtpPctRange("locker fahren")).toBeNull();
  });
});

describe("extractCadenceRange", () => {
  it("parst RPM-Bereiche", () => {
    expect(extractCadenceRange("mit hoher Kadenz 100–110 rpm")).toEqual({
      min: 100,
      max: 110,
    });
    expect(extractCadenceRange("Trittfrequenz 55-65")).toEqual({ min: 55, max: 65 });
  });
});

describe("resolveStepTargets – Primärziel-Matrix", () => {
  it("High-Intensity: absolute Watt aus user.ftp × %", () => {
    const { primaryTarget, secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "threshold",
      profile: PROFILE,
      ftpPctLow: 0.95,
      ftpPctHigh: 1.05,
      durationSeconds: 240,
    });
    expect(primaryTarget).toEqual({
      kind: "customPowerRange",
      minWatts: 247,
      maxWatts: 273,
    });
    expect(secondaryTarget).toBeNull();
  });

  it("Sweetspot ohne %-Angabe nutzt Kategorie-Defaults", () => {
    const { primaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "sweetspot",
      profile: PROFILE,
    });
    expect(primaryTarget?.kind).toBe("customPowerRange");
    expect(primaryTarget?.minWatts).toBe(229);
    expect(primaryTarget?.maxWatts).toBe(244);
    expect(primaryTarget?.zone).toBe(4);
  });

  it("Sprints ohne %-Angabe fallen auf PowerZone Z6 zurück", () => {
    const { primaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "sprint",
      profile: PROFILE,
    });
    expect(primaryTarget).toMatchObject({ kind: "customPowerRange", zone: 6 });
  });

  it("Warmup/Cooldown/Recovery ohne %-Vorgabe → PowerZone Z1", () => {
    for (const phase of ["warmup", "cooldown", "recovery"] as const) {
      const { primaryTarget } = resolveStepTargets({
        phase,
        intensity: null,
        profile: PROFILE,
      });
      expect(primaryTarget).toEqual({ kind: "powerZone", zone: 1 });
    }
  });

  it("Active Recovery erbt %-Vorgabe als customPowerRange wenn explizit", () => {
    const { primaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "activeRecovery",
      profile: PROFILE,
      ftpPctLow: 0.6,
      ftpPctHigh: 0.7,
    });
    expect(primaryTarget).toEqual({
      kind: "customPowerRange",
      minWatts: 156,
      maxWatts: 182,
    });
  });

  it("Endurance mit Fokus strictPower → PowerZone Z2", () => {
    const { primaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "endurance",
      profile: PROFILE,
      rideFocus: "strictPower",
    });
    expect(primaryTarget).toEqual({ kind: "powerZone", zone: 2 });
  });

  it("Endurance mit Fokus aerobicBase → HeartRateZone Z2", () => {
    const { primaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "endurance",
      profile: PROFILE,
      rideFocus: "aerobicBase",
    });
    expect(primaryTarget).toEqual({ kind: "heartRateZone", zone: 2 });
  });
});

describe("resolveStepTargets – Sekundärziel-Matrix", () => {
  it("Kadenz-Range wird als Sekundärziel gesetzt", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "vo2max",
      profile: PROFILE,
      ftpPctLow: 1.06,
      ftpPctHigh: 1.2,
      cadence: { min: 100, max: 110 },
    });
    expect(secondaryTarget).toEqual({ kind: "cadenceRange", minRpm: 100, maxRpm: 110 });
  });

  it("Low-Cadence/Torque/SFR → Kadenz 55-65", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "threshold",
      profile: PROFILE,
      ftpPctLow: 0.95,
      ftpPctHigh: 1.0,
      lowCadenceTorque: true,
    });
    expect(secondaryTarget).toEqual({ kind: "cadenceRange", minRpm: 55, maxRpm: 65 });
  });

  it("Neuromuskuläre Drills → Kadenz 100-110", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "neuromuscular",
      profile: PROFILE,
    });
    expect(secondaryTarget).toEqual({ kind: "cadenceRange", minRpm: 100, maxRpm: 110 });
  });

  it("Langer Threshold-Block ohne Kadenz-Vorgabe → HF-Guardrail (Karvonen Z4)", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "threshold",
      profile: PROFILE,
      ftpPctLow: 0.91,
      ftpPctHigh: 1.05,
      durationSeconds: 600,
    });
    expect(secondaryTarget).toEqual({ kind: "heartRateRange", minBpm: 160, maxBpm: 175 });
  });

  it("Kurzer Threshold-Block bleibt ohne Sekundärziel (kein Alert-Spam)", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "interval",
      intensity: "threshold",
      profile: PROFILE,
      ftpPctLow: 0.95,
      ftpPctHigh: 1.05,
      durationSeconds: 240,
    });
    expect(secondaryTarget).toBeNull();
  });

  it("Easy-Phasen erhalten niemals Sekundärziele", () => {
    const { secondaryTarget } = resolveStepTargets({
      phase: "recovery",
      intensity: null,
      profile: PROFILE,
      highCadenceDrill: true,
    });
    expect(secondaryTarget).toBeNull();
  });
});

describe("stripMetricsFromNotes", () => {
  it("entfernt %FTP, Watt, bpm, RPM und Zonen-Tags", () => {
    const cleaned = stripMetricsFromNotes(
      "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min aktiver Kurbelpause."
    );
    expect(cleaned).not.toMatch(/%\s*ftp/i);
    expect(cleaned).not.toMatch(/zone/i);
    expect(cleaned).toContain("mit 3 Min aktiver Kurbelpause");
  });

  it("behält instruktionale Cues", () => {
    const cleaned = stripMetricsFromNotes("Intervall 1/4 - Im Sitzen fahren, HF < 130 bpm, 350 Watt");
    expect(cleaned).toContain("Im Sitzen fahren");
    expect(cleaned).not.toMatch(/bpm/i);
    expect(cleaned).not.toMatch(/watt/i);
    expect(cleaned).not.toMatch(/\d+\s*w\b/i);
  });
});

describe("generateEnduranceSteps", () => {
  const thresholdDesc =
    "4x 4 Min @ 95–105% FTP (Zone 4) mit 3 Min aktiver Kurbelpause.";

  it("erzeugt Warmup, alle Intervalle/Pausen und Cooldown", () => {
    const steps = generateEnduranceSteps(thresholdDesc, "Radfahren: 4x4", {
      profile: PROFILE,
      totalDurationMins: 60,
    });
    expect(steps).toHaveLength(10);
    expect(steps[0].phase).toBe("warmup");
    expect(steps.at(-1)?.phase).toBe("cooldown");
    const intervals = steps.filter((s) => s.phase === "interval");
    expect(intervals).toHaveLength(4);
    expect(steps.filter((s) => s.phase === "recovery")).toHaveLength(4);
  });

  it("Intervalle erhalten absolute Watt-Ziele aus FTP", () => {
    const steps = generateEnduranceSteps(thresholdDesc, "Radfahren: 4x4", {
      profile: PROFILE,
      totalDurationMins: 60,
    });
    const interval = steps.find((s) => s.phase === "interval")!;
    expect(interval.primaryTarget).toEqual({
      kind: "customPowerRange",
      minWatts: 247,
      maxWatts: 273,
    });
    expect(interval.secondaryTarget).toBeNull();
    expect(interval.intensity).toBe("threshold");
  });

  it("Notizen enthalten keine Ziel-Metriken mehr", () => {
    const steps = generateEnduranceSteps(thresholdDesc, "Radfahren: 4x4", {
      profile: PROFILE,
      totalDurationMins: 60,
    });
    for (const step of steps) {
      expect(step.notes).not.toMatch(/%\s*ftp/i);
      expect(step.notes).not.toMatch(/zone\s*\d/i);
    }
  });

  it("Endurance-Fahrt mit HF-Vorgabe → HeartRateZone Z2 als Primärziel", () => {
    const steps = generateEnduranceSteps(
      "60 Min lockeres Kurbeln im aeroben Grundlagentempo (Zone 2, 60–70% FTP / HF < 130 bpm).",
      "Radfahren: Zone 2",
      { profile: PROFILE }
    );
    expect(steps).toHaveLength(3);
    const main = steps[1];
    expect(main.primaryTarget).toEqual({ kind: "heartRateZone", zone: 2 });
  });

  it("Distanz-Intervalle behalten ihre Distanz", () => {
    const steps = generateEnduranceSteps("5x 1 km @ Tempo mit 90s Trab", "Laufen", {
      profile: PROFILE,
    });
    const intervals = steps.filter((s) => s.phase === "interval");
    expect(intervals).toHaveLength(5);
    expect(intervals[0].distanceMeters).toBe(1000);
  });
});

describe("detectTotalDurationMinutes", () => {
  it("liest Gesamtdauer aus der Beschreibung", () => {
    expect(
      detectTotalDurationMinutes("Gesamtdauer ca. 75 Min inkl. Warmup")
    ).toBe(75);
    expect(detectTotalDurationMinutes("2–4 Stunden", 60)).toBe(60);
  });
});
