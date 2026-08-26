import { describe, it, expect } from "vitest";
import { classifyCoachComplexity } from "@/lib/ai/complexity";

describe("classifyCoachComplexity", () => {
  it("kurze Faktenfragen → low", () => {
    expect(classifyCoachComplexity("Hi")).toBe("low");
    expect(classifyCoachComplexity("Wie war mein Schlaf?")).toBe("low");
    expect(classifyCoachComplexity("Wiegt 80 kg viel?")).toBe("low");
  });

  it("leere Eingabe → low", () => {
    expect(classifyCoachComplexity("   ")).toBe("low");
  });

  it("Workout-/Plan-Erstellung → high", () => {
    expect(classifyCoachComplexity("Erstelle mir einen Trainingsplan für diese Woche")).toBe("high");
    expect(classifyCoachComplexity("Baue mir ein Workout für Oberkörper")).toBe("high");
    expect(classifyCoachComplexity("Plane meine Trainingswoche neu")).toBe("high");
    expect(classifyCoachComplexity("Ich möchte einen Wochenplan mit 4 Einheiten")).toBe("high");
    expect(classifyCoachComplexity("Analysiere meine letzten 4 Wochen")).toBe("high");
    expect(classifyCoachComplexity("Mach einen Deload-Vorschlag")).toBe("high");
  });

  it("Kalorienziel-/BMR-Neuberechnung → high", () => {
    expect(
      classifyCoachComplexity(
        "Bitte passe meinen Trainingsplan, BMR und mein Kalorienziel mit meinem aktuellen Gewicht von 82 kg für die Woche neu an."
      )
    ).toBe("high");
  });

  it("begründete Fragen → medium", () => {
    expect(classifyCoachComplexity("Warum ist mein Ruhepuls gestiegen?")).toBe("medium");
    expect(classifyCoachComplexity("Wie kann ich mein Bankdrück-PR verbessern?")).toBe("medium");
    expect(classifyCoachComplexity("Hast du Tipps für besseren Schlaf?")).toBe("medium");
  });

  it("sehr langer Text → high", () => {
    expect(classifyCoachComplexity("x".repeat(400))).toBe("high");
  });

  it("mittellanger Text ohne Signale → medium", () => {
    expect(classifyCoachComplexity("a".repeat(130))).toBe("medium");
  });
});
