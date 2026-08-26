import { describe, expect, it } from "vitest";
import { formatCitation, formatScientificContext } from "@/lib/knowledge/retriever";
import { sanitizeUnits } from "@/lib/knowledge/pdfIngest";
import type { KnowledgeMatch } from "@/types/knowledge";

const match: KnowledgeMatch = {
  id: "seed--test",
  documentTitle: "Polarisierte Intensitätsverteilung",
  content:
    "Thema: Polarisierte Verteilung\nZusammenfassung: 80 % leicht trainieren, 20 % hart.",
  citation: {
    authors: "Seiler, S.",
    year: 2010,
    title: "What is Best Practice for Training Intensity Distribution?",
    journal: "IJSPP",
  },
  topics: ["polarized training"],
  kind: "curated_seed",
  similarity: 0.812,
};

describe("formatCitation", () => {
  it("formatiert Autoren, Jahr, Titel und Journal", () => {
    const text = formatCitation(match.citation);
    expect(text).toContain("Seiler, S.");
    expect(text).toContain("(2010)");
    expect(text).toContain("„What is Best Practice for Training Intensity Distribution?“");
    expect(text).toContain("IJSPP");
  });

  it("fällt ohne Zitation auf Platzhalter zurück", () => {
    expect(formatCitation(null)).toBe("Quelle unbekannt");
  });
});

describe("formatScientificContext", () => {
  it("erzeugt nummerierten Kontextblock mit Quellenangabe und Relevanz", () => {
    const context = formatScientificContext([match]);
    expect(context).toContain("[1] Polarisierte Intensitätsverteilung — Relevanz ~81%");
    expect(context).toContain("Quelle: Seiler, S. (2010)");
    expect(context).toContain("Thema: Polarisierte Verteilung");
    expect(context).toContain("80 % leicht trainieren");
  });

  it("nummeriert mehrere Treffer fortlaufend", () => {
    const second: KnowledgeMatch = { ...match, id: "x2", similarity: 0.5 };
    const context = formatScientificContext([match, second]);
    expect(context).toContain("[1] ");
    expect(context).toContain("[2] ");
  });

  it("liefert leeren String ohne Treffer (kein Prompt-Bloat)", () => {
    expect(formatScientificContext([])).toBe("");
  });
});

describe("sanitizeUnits", () => {
  it("validiert eine korrekte Modellantwort unverändert", () => {
    const raw = {
      units: [
        {
          title: "Interference Effect",
          summary: "Laufen stört Kraftaufbau stärker als Radfahren. ".repeat(2),
          key_findings: ["Meta-Analyse: Running > Cycling"],
          practical_guidelines: ["Radfahren bevorzugen"],
          citation: { authors: "Wilson, J.M.", year: 2012, title: "Concurrent Training Meta" },
          topics: ["concurrent training"],
        },
      ],
    };
    const units = sanitizeUnits(raw);
    expect(units).toHaveLength(1);
    expect(units[0].citation.year).toBe(2012);
    expect(units[0].topics).toEqual(["concurrent training"]);
  });

  it("verwirft Einheiten ohne Titel oder mit zu kurzem Summary", () => {
    const units = sanitizeUnits({
      units: [
        { title: "", summary: "Sehr langer Text der eigentlich reicht.".repeat(3) },
        { title: "Nur Titel", summary: "zu kurz" },
        null,
        "kein objekt",
      ],
    });
    expect(units).toHaveLength(0);
  });

  it("dedupliziert doppelte Titel und klemmt year auf plausible Werte", () => {
    const units = sanitizeUnits({
      units: [
        {
          title: "Gleicher Titel",
          summary: "Erste Zusammenfassung mit ausreichender Länge für die Validierung.",
          citation: { authors: "A", title: "T", year: 3000 },
        },
        {
          title: "gleicher titel",
          summary: "Zweite Zusammenfassung mit ausreichender Länge für die Validierung.",
          citation: { authors: "B", title: "T", year: "keine zahl" },
        },
      ],
    });
    expect(units).toHaveLength(1);
    expect(units[0].citation.authors).toBe("A");
    expect(units[0].citation.year).toBeUndefined();
  });

  it("verteidigt sich gegen komplett kaputte Antworten", () => {
    expect(sanitizeUnits(null)).toEqual([]);
    expect(sanitizeUnits({})).toEqual([]);
    expect(sanitizeUnits({ units: "kein array" })).toEqual([]);
  });
});
