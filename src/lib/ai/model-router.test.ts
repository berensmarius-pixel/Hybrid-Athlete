import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_MODEL_IDS,
  PRIMARY_MODEL_ID,
  allowsSamplingParams,
  buildThinkingConfig,
  classifyUpstreamFailure,
  getModelChain,
  parseGeminiVersion,
  runWithModelFailover,
  sanitizeGenerationPayload,
  usesThinkingLevel,
} from "@/lib/ai/model-router";

describe("AI-Router Modell-Kette", () => {
  it("folgt der geforderten Priorität", () => {
    expect(AI_MODEL_IDS).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
    ]);
    expect(PRIMARY_MODEL_ID).toBe("gemini-3.5-flash-lite");
  });

  it("stellt ein explizit angefragtes Modell vor die Kette", () => {
    expect(getModelChain("gemini-3.5-flash")[0]).toBe("gemini-3.5-flash");
    expect(getModelChain("gemini-3.5-flash")).toHaveLength(AI_MODEL_IDS.length);
    // Unbekanntes Modell wird einmal probiert, fällt dann in die Kette zurück
    expect(getModelChain("gemini-experimental-x")).toEqual([
      "gemini-experimental-x",
      ...AI_MODEL_IDS,
    ]);
    expect(getModelChain()).toEqual([...AI_MODEL_IDS]);
  });

  it("parst Gemini-Versionen", () => {
    expect(parseGeminiVersion("gemini-3.7-flash")).toEqual({ major: 3, minor: 7 });
    expect(parseGeminiVersion("gemini-2.5-flash")).toEqual({ major: 2, minor: 5 });
    expect(parseGeminiVersion("gemini-flash-latest")).toBeNull();
  });
});

describe("Gemini-3.x-Parameter-Audit", () => {
  it("entfernt Sampling-Parameter auf 3.6/3.7-Endpunkten", () => {
    const sanitized = sanitizeGenerationPayload("gemini-3.7-flash", {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        responseMimeType: "application/json",
      },
    });
    const cfg = sanitized.generationConfig as Record<string, unknown>;
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.topP).toBeUndefined();
    expect(cfg.topK).toBeUndefined();
    expect(cfg.responseMimeType).toBe("application/json");
  });

  it("behält Sampling-Parameter auf älteren Endpunkten", () => {
    for (const model of ["gemini-3.5-flash", "gemini-2.5-flash"]) {
      const sanitized = sanitizeGenerationPayload(model, {
        generationConfig: { temperature: 0.2 },
      });
      expect((sanitized.generationConfig as Record<string, unknown>).temperature).toBe(0.2);
    }
  });

  it("mappt legacy thinkingBudget → thinkingLevel (Gemini 3.x)", () => {
    const sanitized = sanitizeGenerationPayload("gemini-3.7-flash", {
      generationConfig: { thinkingConfig: { thinkingBudget: 8192 } },
    });
    expect((sanitized.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      thinkingLevel: "medium",
    });
  });

  it("setzt einen Default-thinkingLevel wenn keiner konfiguriert war", () => {
    const sanitized = sanitizeGenerationPayload("gemini-3.7-flash", {
      generationConfig: { thinkingConfig: { thinkingBudget: 512 } },
    });
    expect((sanitized.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      thinkingLevel: "low",
    });
  });

  it("lässt legacy thinkingBudget auf 2.5-Modellen unangetastet", () => {
    const sanitized = sanitizeGenerationPayload("gemini-2.5-flash", {
      generationConfig: { thinkingConfig: { thinkingBudget: 1024 } },
    });
    expect((sanitized.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      thinkingBudget: 1024,
    });
  });

  it("verändert Payloads ohne generationConfig nicht", () => {
    const payload = { model: "gemini-3.7-flash", input: "x" };
    expect(sanitizeGenerationPayload("gemini-3.7-flash", payload)).toEqual(payload);
  });

  it("fähigkeiten-Flags je nach Version", () => {
    expect(allowsSamplingParams("gemini-3.7-flash")).toBe(false);
    expect(allowsSamplingParams("gemini-3.6-flash")).toBe(false);
    expect(allowsSamplingParams("gemini-3.5-flash")).toBe(true);
    expect(usesThinkingLevel("gemini-3.5-flash-lite")).toBe(true);
    expect(usesThinkingLevel("gemini-2.5-flash")).toBe(false);
    expect(buildThinkingConfig("medium").thinkingConfig.thinkingLevel).toBe("medium");
  });
});

describe("Failover-Klassifikation", () => {
  it("429/RESOURCE_EXHAUSTED → Quota mit Failover", () => {
    expect(classifyUpstreamFailure({ status: 429 })).toEqual({
      kind: "Quota",
      retryNext: true,
    });
    expect(classifyUpstreamFailure({ status: 400, apiStatus: "RESOURCE_EXHAUSTED" }).kind).toBe("Quota");
  });

  it("503/UNAVAILABLE → Unavailable mit Failover", () => {
    expect(classifyUpstreamFailure({ status: 503 })).toEqual({
      kind: "Unavailable",
      retryNext: true,
    });
  });

  it("404/NOT_FOUND → NotFound mit Failover", () => {
    expect(classifyUpstreamFailure({ status: 404 })).toEqual({
      kind: "NotFound",
      retryNext: true,
    });
  });

  it("401/403 (Key-Fehler) → retryNext=true mit isKeyError=true", () => {
    for (const status of [401, 403]) {
      const result = classifyUpstreamFailure({ status });
      expect(result.retryNext).toBe(true);
      expect(result.isKeyError).toBe(true);
    }
  });

  it("harte Fehler (400, 500) lösen kein Failover aus", () => {
    for (const status of [400, 500]) {
      expect(classifyUpstreamFailure({ status }).retryNext).toBe(false);
    }
  });
});

describe("runWithModelFailover", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("läuft bei Quota ohne Delay bis zum ersten Erfolg", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const triedModels: string[] = [];
    const start = Date.now();

    const result = await runWithModelFailover(AI_MODEL_IDS, async (modelId) => {
      triedModels.push(modelId);
      if (modelId === "gemini-3.5-flash") {
        return { ok: true, value: `ok:${modelId}` };
      }
      return { ok: false, status: 429, message: "quota exceeded" };
    });

    expect(result.ok).toBe(true);
    expect(result.value).toBe("ok:gemini-3.5-flash");
    expect(triedModels).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
    ]);
    expect(Date.now() - start).toBeLessThan(250);
    // Dev-Log mit gefordertem Format
    expect(warnSpy).toHaveBeenCalledWith(
      "[AI Router] Falling back from gemini-3.5-flash-lite -> gemini-3.1-flash-lite due to Quota"
    );
  });

  it("bricht bei harten Fehlern sofort ab", async () => {
    const attempts: string[] = [];
    const result = await runWithModelFailover(AI_MODEL_IDS, async (modelId) => {
      attempts.push(modelId);
      return { ok: false, status: 400, message: "invalid argument" };
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(attempts).toEqual(["gemini-3.5-flash-lite"]);
  });

  it("gibt den letzten Fehler zurück, wenn die Kette erschöpft ist", async () => {
    const result = await runWithModelFailover(
      ["gemini-3.7-flash", "gemini-3.5-flash"],
      async () => ({ ok: false, status: 503, message: "unavailable" })
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });
});
