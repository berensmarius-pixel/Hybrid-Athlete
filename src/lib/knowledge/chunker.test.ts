import { describe, expect, it } from "vitest";
import { buildUnitChunkText, chunkPlainText } from "@/lib/knowledge/chunker";
import type { KnowledgeUnit } from "@/types/knowledge";

describe("chunkPlainText", () => {
  it("gibt kurzen Text unverändert als einzelnen Chunk zurück", () => {
    const text = "Kurzer Absatz über Training.";
    expect(chunkPlainText(text)).toEqual([text]);
  });

  it("liefert leeres Array für leeren Text", () => {
    expect(chunkPlainText("   \n\n  ")).toEqual([]);
  });

  it("splittet lange Texte entlang von Absätzen und respektiert maxChars", () => {
    const paragraph = (n: string) => `Absatz ${n}: ${"Wort ".repeat(60)}`;
    const text = [paragraph("A"), paragraph("B"), paragraph("C"), paragraph("D")].join("\n\n");
    const chunks = chunkPlainText(text, { maxChars: 500, overlapChars: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(560); // kleine Toleranz für Satzgrenzen
    }
    // Alle Absätze landen im Ergebnis
    expect(chunks.join(" ")).toContain("Absatz A:");
    expect(chunks.join(" ")).toContain("Absatz D:");
  });

  it("erzeugt Überlappung zwischen aufeinanderfolgenden Chunks", () => {
    const text = Array.from({ length: 8 }, (_, i) => `BLOCK${i} ${"Inhalt ".repeat(40)}`).join("\n\n");
    const chunks = chunkPlainText(text, { maxChars: 400, overlapChars: 120 });
    expect(chunks.length).toBeGreaterThan(2);
    // Chunk n+1 beginnt mit dem Ende des Vorgänger-Chunks
    expect(chunks[1].startsWith(chunks[0].slice(-120))).toBe(true);
  });

  it("teilt auch einen einzelnen extrem langen Absatz ohne Absätze", () => {
    const text = "Satz eins. ".repeat(300);
    const chunks = chunkPlainText(text, { maxChars: 600 });
    expect(chunks.length).toBeGreaterThan(3);
  });
});

describe("buildUnitChunkText", () => {
  it("kombiniert alle Felder einer KnowledgeUnit deterministisch", () => {
    const unit: KnowledgeUnit = {
      title: "4×4-Intervalle",
      principle: "90–95 % HRmax",
      summary: "Lange Intervalle verbessern VO2max.",
      keyFindings: ["+7 % VO2max"],
      practicalGuidelines: ["2×/Woche"],
      citation: { authors: "Helgerud, J.", year: 2007, title: "Paper" },
      topics: ["vo2max", "hiit"],
    };

    const text = buildUnitChunkText(unit);
    expect(text).toContain("Thema: 4×4-Intervalle");
    expect(text).toContain("Schlagwörter: vo2max, hiit");
    expect(text).toContain("Kernprinzip: 90–95 % HRmax");
    expect(text).toContain("- +7 % VO2max");
    expect(text).toContain("- 2×/Woche");
    // Keine Zitation im Embedding-Text (die lebt im Metadaten-Feld)
    expect(text).not.toContain("Helgerud");

    expect(buildUnitChunkText(unit)).toBe(text);
  });

  it("lässt optionale Felder weg, wenn sie fehlen", () => {
    const unit: KnowledgeUnit = {
      title: "T",
      summary: "S".repeat(50),
      keyFindings: [],
      practicalGuidelines: [],
      citation: { authors: "A", title: "B" },
      topics: [],
    };
    const text = buildUnitChunkText(unit);
    expect(text).not.toContain("Schlagwörter");
    expect(text).not.toContain("Kernbefunde");
    expect(text).not.toContain("Praktische Richtlinien");
  });
});
