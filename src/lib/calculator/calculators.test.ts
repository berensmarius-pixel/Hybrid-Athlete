import { describe, expect, it } from "vitest";
import { calculateHybridScore, calculateOneRepMax } from "@/lib/calculator/strengthCalculator";
import { calculateCogganPowerZones, calculateKarvonenHrZones } from "@/lib/calculator/zonesCalculator";

describe("calculateOneRepMax", () => {
  it("bei 1 Rep ist 1RM = Gewicht", () => {
    const r = calculateOneRepMax(120, 1);
    expect(r.epley).toBe(120);
    expect(r.brzycki).toBe(120);
    expect(r.lander).toBe(120);
    expect(r.average).toBe(120);
  });

  it("berechnet die drei Formeln für Mehrfach-Wiederholungen", () => {
    const r = calculateOneRepMax(100, 10);
    // Epley: 100*(1+10/30)=133.33 → 133
    expect(r.epley).toBe(133);
    // Brzycki: 100/(1.0278-0.278)=133.4 → 133
    expect(r.brzycki).toBe(133);
    // Lander: 10000/(101.3-26.71)=134.0 → 134
    expect(r.lander).toBe(134);
    expect(r.average).toBe(Math.round((133 + 133 + 134) / 3));
  });

  it("Prozent-Tabelle läuft absteigend 95→65 % und rundet auf 0,5 kg", () => {
    const r = calculateOneRepMax(100, 5);
    const pcts = r.percentageTable.map((p) => p.percentage);
    expect(pcts).toEqual([95, 90, 85, 80, 75, 70, 65]);
    for (const row of r.percentageTable) {
      expect(row.weightKg * 2).toBe(Math.round(row.weightKg * 2));
    }
  });
});

describe("calculateKarvonenHrZones", () => {
  it("Zone 1 startet bei Ruhepuls + 50 % HRR", () => {
    const zones = calculateKarvonenHrZones(40, 200); // HRR=160
    expect(zones[0].minBpm).toBe(120);
    expect(zones).toHaveLength(5);
  });

  it("Zone 5 endet bei maxHr", () => {
    const zones = calculateKarvonenHrZones(40, 200);
    expect(zones[4].maxBpm).toBe(200);
  });

  it("Zonen überlappen nicht und sind aufsteigend", () => {
    const zones = calculateKarvonenHrZones(50, 190);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].minBpm).toBeGreaterThanOrEqual(zones[i - 1].maxBpm - 1);
    }
  });
});

describe("calculateCogganPowerZones", () => {
  it("skaliert Zonen an der FTP", () => {
    const zones = calculateCogganPowerZones(250);
    expect(zones).toHaveLength(6);
    expect(zones[3].minWatts).toBe(Math.round(250 * 0.91)); // Z4
    expect(zones[5].maxWatts).toBe(Math.round(250 * 1.5)); // Z6
  });
});

describe("calculateHybridScore", () => {
  it("klassifiziert einen starken Hybrid-Athleten hoch", () => {
    const r = calculateHybridScore(80, 160, 120, 200, 320, 19);
    expect(r.bigThreeTotal).toBe(480);
    expect(r.hybridScore).toBeGreaterThan(70);
  });

  it("eindeutige Schwäche drückt den Score unter die Elite-Schwelle", () => {
    const strong = calculateHybridScore(80, 160, 120, 200, 320, 19);
    const weakRunner = calculateHybridScore(80, 160, 120, 200, 320, 32);
    expect(weakRunner.hybridScore).toBeLessThan(strong.hybridScore);
  });

  it("verarbeitet bodyWeight=0 ohne Division durch Null", () => {
    expect(() => calculateHybridScore(0, 100, 80, 140, 200, 25)).not.toThrow();
  });
});
