import type { ThinkingLevel } from "@/lib/ai/model-router";

/**
 * Adaptive Denkstufen-Heuristik für den AI-Coach:
 * Komplexe Anfragen (Workout-/Plan-Erstellung, Analyse, Periodisierung)
 * erhalten ein höheres thinkingLevel (mehr Reasoning-Qualität), kurze
 * Smalltalk-/Faktenfragen laufen schnell mit "low".
 *
 * Rein synchron und deterministisch – bewusst ohne Modell-Call.
 */

const HIGH_PATTERNS: RegExp[] = [
  /trainingsplan/,
  /wochenplan/,
  /trainingswoche/,
  /workout/,
  /\bplan\b[^\n]{0,40}(erstell|erstellen|mach|bau|design|änder|überarb|optimier|aktualisier)/,
  /(erstell|bau|mach|design|überarb|aktualisier)[^\n]{0,40}\bplan\b/,
  /makrozyklus/,
  /mesozyklus/,
  /periodisier/,
  /deload/,
  /umstrukturier/,
  /zusammenstell/,
  /analysier/,
  /analyse/,
  /auswertung/,
  /vergleiche?\b/,
  /kalorienziel[^\n]{0,40}(berech|neu|anpass)/,
  /\bbmr\b[^\n]{0,40}(berech|neu|anpass)/,
];

const MEDIUM_PATTERNS: RegExp[] = [
  /warum/,
  /wieso/,
  /weshalb/,
  /wie (kann|soll|sollte|könnte|viel)/,
  /verbessern/,
  /optimier/,
  /anpassen/,
  /empfiehl/,
  /erklär/,
  /tipps?/,
  /beurteil/,
  /bewert/,
];

/**
 * Klassifiziert eine Coach-Nachricht in low | medium | high.
 * - "high":  Plan-/Workout-Erstellung, Analysen, Periodisierung oder sehr langer Text
 * - "medium": Begründete Fragen / Optimierungen / mittellange Nachrichten
 * - "low":   Kurze Fakten- und Smalltalk-Fragen
 */
export function classifyCoachComplexity(text: string): ThinkingLevel {
  const clean = text.trim();
  if (clean.length === 0) return "low";

  const lower = clean.toLowerCase();

  if (clean.length >= 400) return "high";
  if (HIGH_PATTERNS.some((p) => p.test(lower))) return "high";
  if (MEDIUM_PATTERNS.some((p) => p.test(lower)) || clean.length >= 120) return "medium";
  return "low";
}
