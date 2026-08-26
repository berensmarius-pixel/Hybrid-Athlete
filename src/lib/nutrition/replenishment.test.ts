import { describe, expect, it } from "vitest";
import {
  computeReplenishmentTarget,
  estimateEnergyExpenditureKcal,
} from "./replenishment";

describe("estimateEnergyExpenditureKcal", () => {
  it("bevorzugt gemessene kJ-Arbeit", () => {
    expect(estimateEnergyExpenditureKcal({ workKJ: 814, calories: 500 })).toBe(814);
  });

  it("fällt auf Garmin-Kalorien zurück", () => {
    expect(estimateEnergyExpenditureKcal({ calories: 640 })).toBe(640);
  });

  it("0 ohne Daten", () => {
    expect(estimateEnergyExpenditureKcal({})).toBe(0);
  });
});

describe("computeReplenishmentTarget", () => {
  it("60 % der Energie als Zusatz-Kohlenhydrate (800 kcal → 120 g CHO)", () => {
    const target = computeReplenishmentTarget({ date: "2026-08-25", workKJ: 814 });
    expect(target.energyExpenditureKcal).toBe(814);
    expect(target.additionalCarbsG).toBe(Math.round((814 * 0.6) / 4)); // 122
    expect(target.additionalCalories).toBe(target.additionalCarbsG * 4);
    expect(target.hydrationMl).toBe(Math.round(814 * 1.5));
  });

  it("clampt extreme Werte", () => {
    const huge = computeReplenishmentTarget({ date: "2026-08-25", workKJ: 9000 });
    expect(huge.additionalCarbsG).toBeLessThanOrEqual(500);
    expect(huge.hydrationMl).toBeLessThanOrEqual(3000);

    const tiny = computeReplenishmentTarget({ date: "2026-08-25", calories: 30 });
    expect(tiny.additionalCarbsG).toBeGreaterThanOrEqual(0);
  });
});
