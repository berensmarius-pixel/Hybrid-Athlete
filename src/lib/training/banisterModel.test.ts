import { describe, expect, it } from "vitest";
import {
  computeBanisterSeries,
  decayFactor,
  type DailyTssMap,
} from "./banisterModel";

const TODAY = "2026-08-26";

function seriesFrom(days: number, tss: number): DailyTssMap {
  const map: DailyTssMap = {};
  const base = new Date(`${TODAY}T12:00:00`);
  // i >= 0: heute einschließen – die Reihe endet auf dem Auswertungstag
  for (let i = days; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    map[iso] = { tss };
  }
  return map;
}

describe("decayFactor", () => {
  it("entspricht 1 − e^(−1/τ)", () => {
    expect(decayFactor(42)).toBeCloseTo(1 - Math.exp(-1 / 42), 12);
    expect(decayFactor(7)).toBeCloseTo(1 - Math.exp(-1 / 7), 12);
  });
});

describe("computeBanisterSeries", () => {
  it("liefert Nullen ohne Historie", () => {
    const snap = computeBanisterSeries({}, TODAY);
    expect(snap.ctl).toBe(0);
    expect(snap.atl).toBe(0);
    expect(snap.tsb).toBe(0);
  });

  it("berechnet den ersten Tag exakt nach Impuls-Response", () => {
    const onlyToday: DailyTssMap = { [TODAY]: { tss: 700 } };
    const snap = computeBanisterSeries(onlyToday, TODAY);

    const expectedCtl = 700 * (1 - Math.exp(-1 / 42));
    const expectedAtl = 700 * (1 - Math.exp(-1 / 7));
    expect(snap.ctl).toBeCloseTo(expectedCtl, 1);
    expect(snap.atl).toBeCloseTo(expectedAtl, 1);
    expect(snap.tsb).toBeCloseTo(expectedCtl - expectedAtl, 1);
  });

  it("konvergiert bei konstanter Belastung gegen den Tages-TSS", () => {
    const snap = computeBanisterSeries(seriesFrom(365, 100), TODAY, 500);
    expect(snap.ctl).toBeGreaterThan(99);
    expect(snap.ctl).toBeLessThanOrEqual(100);
    expect(snap.atl).toBeGreaterThan(99);
    expect(Math.abs(snap.tsb)).toBeLessThan(2);
  });

  it("zeigt negative Form bei frischem Formaufbau (ATL > CTL)", () => {
    // 30 Tage Ruhe, dann ein harter Tag
    const map = seriesFrom(30, 0);
    map[TODAY] = { tss: 300 };
    const snap = computeBanisterSeries(map, TODAY);
    expect(snap.tsb).toBeLessThan(0);
    expect(snap.atl).toBeGreaterThan(snap.ctl);
  });

  it("enthält maximal 28 Tage Trend", () => {
    const snap = computeBanisterSeries(seriesFrom(90, 80), TODAY);
    expect(snap.trend.length).toBeLessThanOrEqual(28);
    expect(snap.trend[snap.trend.length - 1].date).toBe(TODAY);
  });
});
