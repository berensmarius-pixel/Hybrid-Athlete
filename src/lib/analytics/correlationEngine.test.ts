import { describe, expect, it } from "vitest";
import { calculatePearson } from "@/lib/analytics/correlationEngine";

describe("calculatePearson", () => {
  it("liefert NaN bei zu wenigen Paaren (<5)", () => {
    expect(calculatePearson([1, 2, 3], [1, 2, 3])).toBeNaN();
  });

  it("perfekte positive Korrelation → 1", () => {
    const r = calculatePearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBe(1);
  });

  it("perfekte negative Korrelation → -1", () => {
    const r = calculatePearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBe(-1);
  });

  it("ohne Varianz in einer Reihe → NaN (kein Fake-Wert)", () => {
    expect(calculatePearson([5, 5, 5, 5, 5], [1, 2, 3, 4, 5])).toBeNaN();
  });

  it("rundet auf zwei Nachkommastellen", () => {
    const x = [10, 12, 14, 16, 18];
    const y = [11.2, 13.1, 13.9, 15.8, 17.4];
    const r = calculatePearson(x, y);
    expect(r).toBeCloseTo(0.99, 2);
    expect(Number.isInteger(r * 100)).toBe(true);
  });

  it("nutzt nur so viele Paare wie kürzere Liste lang ist", () => {
    const short = calculatePearson([1, 2, 3, 4, 5, 99], [1, 2, 3, 4, 5]);
    const exact = calculatePearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    expect(short).toBe(exact);
  });
});
