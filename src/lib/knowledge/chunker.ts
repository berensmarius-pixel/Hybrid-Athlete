import type { KnowledgeUnit } from "@/types/knowledge";

/**
 * Chunking-Helfer für die Wissensbasis.
 *
 * Zwei Wege:
 *  1. KnowledgeUnits (LLM-Extraktion / Seed-Korpus) → ein semantischer Chunk
 *     pro Einheit, angereichert mit Titel/Topics für bessere Embedding-Qualität.
 *  2. Rohtext (.txt/.md oder extrahierter PDF-Text) → überlappende
 *     Absatz-Fenster mit Satzgrenzen-Fallback.
 */

export interface PlainChunkOptions {
  /** Zielgröße eines Chunks in Zeichen */
  maxChars?: number;
  /** Überlappung in Zeichen zwischen aufeinanderfolgenden Chunks */
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 1400;
const DEFAULT_OVERLAP_CHARS = 180;

/** Zerlegt Rohtext in überlappende Fenster entlang von Absatz-/Satzgrenzen. */
export function chunkPlainText(
  text: string,
  options: PlainChunkOptions = {}
): string[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULT_MAX_CHARS);
  const overlapChars = Math.min(
    maxChars - 100,
    Math.max(0, options.overlapChars ?? DEFAULT_OVERLAP_CHARS)
  );

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  // Erst nach Absätzen splitten und zu Fenstern ≤ maxChars akkumulieren.
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    // Überlappung: Ende des letzten Chunks in den nächsten retten
    current =
      overlapChars > 0 && trimmed.length > overlapChars
        ? `${trimmed.slice(-overlapChars)} `
        : "";
  };

  for (const paragraph of paragraphs) {
    // Sehr langer Absatz → an Satzgrenzen hart teilen
    if (paragraph.length > maxChars) {
      for (const sentenceChunk of splitLongParagraph(paragraph, maxChars)) {
        if (current.length + sentenceChunk.length + 1 > maxChars) flush();
        current += (current ? " " : "") + sentenceChunk;
      }
      continue;
    }
    if (current.length + paragraph.length + 1 > maxChars) flush();
    current += (current ? " " : "") + paragraph;
  }
  flush();

  return chunks.filter((c) => c.length > 40);
}

/** Teilt einen sehr langen Absatz an Satzgrenzen (Fallback: Wortgrenzen). */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Auch der einzelne Satz ist zu lang → harte Wort-Splits
      if (current) {
        parts.push(current.trim());
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        parts.push(sentence.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      parts.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * Baut den Embedding-Eingabetext für eine KnowledgeUnit:
 * Titel + Topics + Kernprinzip + Summary + Befunde + Guidelines.
 * Deterministisch – identische Units erzeugen identische Hashes (Dedupe).
 */
export function buildUnitChunkText(unit: KnowledgeUnit): string {
  const lines: string[] = [];

  lines.push(`Thema: ${unit.title}`);
  if (unit.topics.length > 0) lines.push(`Schlagwörter: ${unit.topics.join(", ")}`);
  if (unit.principle) lines.push(`Kernprinzip: ${unit.principle}`);
  lines.push(`Zusammenfassung: ${unit.summary}`);

  if (unit.keyFindings.length > 0) {
    lines.push("Kernbefunde:");
    for (const finding of unit.keyFindings) lines.push(`- ${finding}`);
  }

  if (unit.practicalGuidelines.length > 0) {
    lines.push("Praktische Richtlinien:");
    for (const guideline of unit.practicalGuidelines) lines.push(`- ${guideline}`);
  }

  return lines.join("\n").trim();
}
