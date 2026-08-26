import { describe, expect, it } from "vitest";
import type { FoodItem, MealEntry } from "@/types";
import {
  aggregateDailyMicronutrients,
  averageMicronutrientScore,
  calculateDailyMicroStatus,
  estimateFoodMicronutrients,
  evaluateBiomarkers,
  getAthleticRda,
  estimateSweatLossFromBurn,
} from "./micro-calculator";

function makeFood(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: "food-1",
    name: "Test",
    caloriesPer100g: 100,
    proteinPer100g: 10,
    ...overrides,
  };
}

function makeEntry(food: FoodItem, amount: number): MealEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 7)}`,
    mealType: "lunch",
    food,
    amount,
    calories: 100,
    protein: 10,
    carbs: 0,
    fat: 0,
  };
}

describe("estimateFoodMicronutrients", () => {
  it("matched Lachs über Namens-Heuristik", () => {
    const micro = estimateFoodMicronutrients(makeFood({ name: "Lachsfilet frisch" }));
    expect(micro.omega3).toBeCloseTo(2.2);
    expect(micro.vitaminD).toBe(450);
  });

  it("matched Hühnerei per Wortgrenze, aber nicht 'Reis' oder 'Weizenbrot'", () => {
    const egg = estimateFoodMicronutrients(makeFood({ name: "Hühnerei Größe M" }));
    expect(egg.vitaminD).toBe(87);

    const eggSingular = estimateFoodMicronutrients(makeFood({ name: "Ei (Größe L)" }));
    expect(eggSingular.iron).toBeGreaterThan(0);

    const rice = estimateFoodMicronutrients(makeFood({ name: "Basmati Reis" }));
    expect(rice.vitaminD).toBe(0);
    expect(rice.sodium).not.toBe(124);

    const wheat = estimateFoodMicronutrients(makeFood({ name: "Weizenbrot" }));
    expect(wheat.vitaminD).toBe(0);
  });

  it("bevorzugt Mandelmilch vor Mandel-Profil (spezifisch zuerst)", () => {
    const drink = estimateFoodMicronutrients(
      makeFood({ id: "basic-mandelmilch", name: "Mandelmilch Ungesüßt" })
    );
    expect(drink.magnesium).toBeLessThan(50);

    const nuts = estimateFoodMicronutrients(makeFood({ name: "Mandeln geschält" }));
    expect(nuts.magnesium).toBe(270);
  });

  it("liefert Nullen für unbekannte Foods (z. B. Olivenöl)", () => {
    const micro = estimateFoodMicronutrients(makeFood({ name: "Olivenöl Extra Vergine" }));
    expect(micro.iron).toBe(0);
    expect(micro.potassium).toBe(0);
  });
});

describe("aggregateDailyMicronutrients", () => {
  it("skaliert Profile mit der Logg-Menge (200 g Lachs)", () => {
    const totals = aggregateDailyMicronutrients([
      makeEntry(makeFood({ name: "Lachsfilet" }), 200),
    ]);
    // 200 g × 2.2 g Omega-3 / 100 g
    expect(totals.omega3).toBeCloseTo(4.4);
    expect(totals.vitaminD).toBe(900);
  });

  it("summiert mehrere Entries eines Tages", () => {
    const totals = aggregateDailyMicronutrients([
      makeEntry(makeFood({ name: "Haferflocken Zart" }), 100),
      makeEntry(makeFood({ name: "Banane" }), 120),
    ]);
    expect(totals.magnesium).toBe(Math.round(177 + 27 * 1.2));
  });

  it("ignoriert leere/ungültige Einträge ohne Crash", () => {
    const totals = aggregateDailyMicronutrients([]);
    expect(totals.iron).toBe(0);
    expect(() =>
      aggregateDailyMicronutrients([makeEntry(makeFood({ name: "" }), 100)])
    ).not.toThrow();
  });
});

describe("getAthleticRda", () => {
  const base = { sweatLossLPerDay: 0, trainingHoursPerWeek: 0 };

  it("steigt mit Schweißverlust und Trainingsvolumen", () => {
    const rest = getAthleticRda("sodium", base);
    const sweaty = getAthleticRda("sodium", { sweatLossLPerDay: 2, trainingHoursPerWeek: 0 });
    const heavy = getAthleticRda("iron", { sweatLossLPerDay: 2, trainingHoursPerWeek: 12 });

    expect(sweaty).toBeGreaterThan(rest);
    expect(heavy).toBeGreaterThanOrEqual(14);
  });

  it("respektiert das Maximum (Natrium ≤ 5000 mg)", () => {
    const extreme = getAthleticRda("sodium", { sweatLossLPerDay: 4, trainingHoursPerWeek: 25 });
    expect(extreme).toBeLessThanOrEqual(5000);
  });

  it("nutzt Basiswerte ohne Training", () => {
    expect(getAthleticRda("magnesium", base)).toBe(340);
  });
});

describe("calculateDailyMicroStatus", () => {
  const profile = { sweatLossLPerDay: 1.2, trainingHoursPerWeek: 8 };

  it("stuft leere Tage als critical ein (🔴) und liefert Empfehlungen", () => {
    const statuses = calculateDailyMicroStatus([], profile);
    const iron = statuses.find((s) => s.key === "iron");
    expect(iron?.percent).toBe(0);
    expect(iron?.level).toBe("critical");
    expect(iron?.emoji).toBe("🔴");
    expect(iron?.recommendation).toContain("Eisenreiche Kost");
  });

  it("optimal ab 75% mit Empfehlung nur unterhalb", () => {
    const statuses = calculateDailyMicroStatus(
      [makeEntry(makeFood({ name: "Kürbiskerne" }), 100)],
      profile
    );
    const magnesium = statuses.find((s) => s.key === "magnesium")!;
    expect(magnesium.level).toBe("optimal");
    expect(magnesium.recommendation).toBeUndefined();

    const iron = statuses.find((s) => s.key === "iron")!;
    // Kürbiskerne allein: ~88 mg Eisen-Ziel → deutlich unter 40%
    expect(["warning", "critical"]).toContain(iron.level);
  });

  it("liefert alle 7 Schlüssel-Nährstoffe", () => {
    const statuses = calculateDailyMicroStatus([], profile);
    expect(statuses).toHaveLength(7);
    expect(statuses.map((s) => s.key)).toEqual([
      "iron",
      "magnesium",
      "sodium",
      "potassium",
      "zinc",
      "vitaminD",
      "omega3",
    ]);
  });
});

describe("averageMicronutrientScore", () => {
  it("kappet Werte > 100 bei 100", () => {
    const score = averageMicronutrientScore([
      { percent: 250 } as never,
      { percent: 50 } as never,
    ]);
    expect(score).toBe(75);
  });
});

describe("evaluateBiomarkers", () => {
  it("warnt bei Ferritin < 30 ng/mL bzgl. aerober Kapazität & Regeneration", () => {
    const flags = evaluateBiomarkers({
      id: "b1",
      date: "2026-08-26",
      ferritinNgMl: 22,
    });
    const ferritinFlag = flags.find((f) => f.title.includes("Ferritin niedrig"));
    expect(ferritinFlag).toBeDefined();
    expect(ferritinFlag!.level).toBe("warning");
    expect(ferritinFlag!.message.toLowerCase()).toContain("aerobischen kapazität");
    expect(ferritinFlag!.message.toLowerCase()).toContain("regeneration");
  });

  it("eskaliert kritisch unter 15 ng/mL", () => {
    const flags = evaluateBiomarkers({ id: "b2", date: "2026-08-26", ferritinNgMl: 10 });
    expect(flags.some((f) => f.level === "critical")).toBe(true);
  });

  it("keine Warnung im optimalen Bereich", () => {
    const flags = evaluateBiomarkers({
      id: "b3",
      date: "2026-08-26",
      ferritinNgMl: 85,
      vitaminDNgMl: 45,
      testosteroneNgDl: 650,
    });
    expect(flags).toHaveLength(0);
  });

  it("bewertet Vitamin-D-Mangel und niedriges Testosteron", () => {
    const flags = evaluateBiomarkers({
      id: "b4",
      date: "2026-08-26",
      vitaminDNgMl: 14,
      testosteroneNgDl: 280,
    });
    expect(flags.some((f) => f.title === "Vitamin-D-Mangel")).toBe(true);
    expect(flags.some((f) => f.title.includes("Testosteron niedrig"))).toBe(true);
  });

  it("gibt leeres Array ohne Entry", () => {
    expect(evaluateBiomarkers(null)).toEqual([]);
    expect(evaluateBiomarkers(undefined)).toEqual([]);
  });
});

describe("estimateSweatLossFromBurn", () => {
  it("schätzt Schweißverlust aus Garmin-Burn", () => {
    expect(estimateSweatLossFromBurn(0)).toBe(0.8);
    expect(estimateSweatLossFromBurn(2000)).toBeGreaterThan(1.2);
    expect(estimateSweatLossFromBurn(90000)).toBeLessThanOrEqual(4);
  });
});
