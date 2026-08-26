import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/gemini/promptBuilder";

function buildPrompt(scientificGroundingContext?: string): string {
  return buildSystemPrompt(
    "=== STRAVA ===",
    [],
    "PRs",
    "Historie",
    [],
    [],
    "Ernährung",
    "Garmin",
    "Körper",
    "Testathlet",
    scientificGroundingContext
  );
}

describe("buildSystemPrompt – Scientific Grounding", () => {
  it("enthält KEINE Wissenschaftssektion ohne Grounding-Kontext", () => {
    const prompt = buildPrompt();
    expect(prompt).not.toContain("WISSENSCHAFTLICHE LEITPLANKEN");
  });

  it("injiziert den Grounding-Kontext inkl. Zitier- und 6h-Abstandsregel", () => {
    const grounding = `Die folgenden Auszüge stammen aus der wissenschaftlichen Wissensbasis:
[1] Polarisierte Intensitätsverteilung — Relevanz ~81%
Quelle: Seiler, S. (2010) „What is Best Practice…"
Thema: Polarisierte Verteilung`;

    const prompt = buildPrompt(grounding);

    expect(prompt).toContain("=== WISSENSCHAFTLICHE LEITPLANKEN (STRIKT EINZUHALTEN) ===");
    // Requirement: strikte Physiologie-Leitplanken im System-Prompt
    expect(prompt).toContain("mindestens 6 Stunden");
    expect(prompt).toContain("Progressive Überlastung");
    // Requirement: Zitierformat für die Erklärung
    expect(prompt).toContain("Basierend auf <Autoren> (<Jahr>)");
    expect(prompt).toContain("Erfinde NIEMALS Quellen");
    // Der gelieferte Kontext selbst ist vollständig enthalten
    expect(prompt).toContain(grounding);
    // Und die restlichen Kontexte sind weiterhin vorhanden
    expect(prompt).toContain("=== STRAVA ===");
    expect(prompt).toContain("Testathlet");
  });

  it("ignoriert reinen Whitespace als Grounding", () => {
    const prompt = buildPrompt("   \n ");
    expect(prompt).not.toContain("WISSENSCHAFTLICHE LEITPLANKEN");
  });
});
