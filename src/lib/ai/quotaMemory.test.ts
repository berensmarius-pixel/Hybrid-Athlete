import { describe, it, expect, beforeEach } from "vitest";
import {
  orderModelsByQuota,
  recordModelSuccess,
  recordModelFailure,
  setQuotaMemoryStorageForTests,
  resetQuotaMemoryForTests,
} from "@/lib/ai/quotaMemory";

/** Minimaler In-Memory-Storage (node-Environment hat kein localStorage). */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const CHAIN = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

describe("orderModelsByQuota", () => {
  beforeEach(() => {
    setQuotaMemoryStorageForTests(createMemoryStorage());
    resetQuotaMemoryForTests();
  });

  it("ohne Historie: Kette unverändert", () => {
    expect(orderModelsByQuota(CHAIN)).toEqual(CHAIN);
  });

  it("behält Prioritäts-Kette bei", () => {
    recordModelSuccess(CHAIN[2]);
    expect(orderModelsByQuota(CHAIN)[0]).toBe(CHAIN[0]);
    expect(orderModelsByQuota(CHAIN)).toEqual(CHAIN);
  });

  it("RPM-Cooldown: Modell wandert ans Ende", () => {
    recordModelSuccess(CHAIN[0]);
    recordModelFailure(CHAIN[0], "Rate limit exceeded");
    const ordered = orderModelsByQuota(CHAIN);
    expect(ordered.at(-1)).toBe(CHAIN[0]);
    expect(ordered[0]).toBe(CHAIN[1]);
  });

  it("Daily-Limit: Cooldown bis Mitternacht (mehr als 60 s)", () => {
    recordModelFailure(CHAIN[1], "GenerateRequestsPerDayPerProjectPerModel: requests per day");
    const ordered = orderModelsByQuota(CHAIN);
    expect(ordered.at(-1)).toBe(CHAIN[1]);
    expect(ordered).not.toContainEqual(undefined);
  });

  it("abgelaufener Cooldown stellt Modell wieder an seine reguläre Priorität", () => {
    const storage = createMemoryStorage();
    setQuotaMemoryStorageForTests(storage);
    storage.setItem(
      "hybrid_athlete_ai_quota_memory",
      JSON.stringify({
        [CHAIN[0]]: { lastSuccessAt: Date.now() - 1000, cooldownUntil: Date.now() - 500 },
      })
    );
    const ordered = orderModelsByQuota(CHAIN);
    expect(ordered[0]).toBe(CHAIN[0]);
  });
});
