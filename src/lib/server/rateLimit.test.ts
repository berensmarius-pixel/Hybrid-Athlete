import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "@/lib/server/rateLimit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    // Eindeutige Identifiers pro Test → keine Bucket-Verschmutzung
  });

  it("lässt die ersten Requests zu und blockiert dann (Login-Regel)", () => {
    const id = "ip-login-" + Math.random();
    const allowed = [];
    for (let i = 0; i < 7; i++) {
      allowed.push(consumeRateLimit(id, "/api/auth/login"));
    }
    expect(allowed.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(allowed[5]).toBe(false);
    expect(allowed[6]).toBe(false);
  });

  it("unterschiedliche Identifiers haben unabhängige Buckets", () => {
    consumeRateLimit("ip-a", "/api/auth/login");
    consumeRateLimit("ip-a", "/api/auth/login");
    expect(consumeRateLimit("ip-b", "/api/auth/login")).toBe(true);
  });

  it("Garmin-Routen nutzen eine eigene, engere Regel", () => {
    const id = "ip-garmin-" + Math.random();
    let ok = 0;
    for (let i = 0; i < 20; i++) {
      if (consumeRateLimit(id, "/api/garmin/sync")) ok++;
    }
    expect(ok).toBe(12); // capacity der Garmin-Regel

    // Garmin-Bucket erschöpft → Login-Bucket desselben Clients bleibt frei
    expect(consumeRateLimit(id, "/api/auth/check")).toBe(true);
  });

  it("füllt Tokens zeitbasiert nach", async () => {
    vi.useFakeTimers();
    try {
      const id = "ip-refill-" + Math.random();
      for (let i = 0; i < 5; i++) consumeRateLimit(id, "/api/auth/login");
      expect(consumeRateLimit(id, "/api/auth/login")).toBe(false);
      // 1 Minute später: 5 neue Tokens
      vi.advanceTimersByTime(60_000);
      expect(consumeRateLimit(id, "/api/auth/login")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
