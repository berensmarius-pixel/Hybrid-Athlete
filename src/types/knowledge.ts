/**
 * Typen für die wissenschaftliche Wissensbasis (RAG-Modul) des AI-Coaches.
 * Wird sowohl im Client (Coach-Grounding) als auch serverseitig (API-Routen,
 * Retriever, Ingestion) importiert – bewusst ohne Node-Abhängigkeiten.
 */

/** Zitation einer wissenschaftlichen Quelle. */
export interface KnowledgeCitation {
  /** Autoren im Format "Seiler, S." oder "Wilson, J.M.; Marin, P.J." */
  authors: string;
  /** Publikationsjahr */
  year?: number;
  /** Titel des Papers / der Quelle */
  title: string;
  /** Fachzeitschrift (optional) */
  journal?: string;
  /** DOI oder URL, falls vorhanden – NIEMALS erfinden, nur was geliefert wurde */
  doi?: string;
  url?: string;
}

/** Herkunft eines Wissens-Chunks. */
export type KnowledgeChunkKind =
  | "curated_seed" // kuratiertes Kernwissen (Seed-Korpus)
  | "paper_extract" // aus PDF via Gemini File API extrahiert
  | "text_note"; // roher Text/markdown direkt eingelesen

/** Eine semantische Wissenseinheit (Ergebnis der Extraktion bzw. Seed-Definition). */
export interface KnowledgeUnit {
  /** Kompakter Titel des Prinzips, z. B. "Polarisierte Intensitätsverteilung" */
  title: string;
  /** Kernprinzip in einem Satz */
  principle?: string;
  /** Ausführliche deutschsprachige Zusammenfassung */
  summary: string;
  /** Belegte Kernbefunde */
  keyFindings: string[];
  /** Praktische Richtlinien für die Trainingssteuerung */
  practicalGuidelines: string[];
  citation: KnowledgeCitation;
  topics: string[];
}

/** Ein gespeicherter Treffer aus der Vektor-Suche. */
export interface KnowledgeMatch {
  id: string;
  documentTitle: string;
  content: string;
  citation: KnowledgeCitation | null;
  topics: string[];
  kind: KnowledgeChunkKind | string;
  similarity: number;
}

/** Scientific Grounding für den Coach-Prompt. */
export interface ScientificGrounding {
  /** Formatierter deutscher Kontextblock für das System-Prompt */
  context: string;
  /** Zitierfähige Quellen der gelieferten Chunks */
  sources: KnowledgeCitation[];
  /** Die tatsächlich verwendeten Suchanfragen */
  queryUsed: string[];
}

/** Response von POST /api/kb/query */
export interface KbQueryResponse {
  grounding: ScientificGrounding | null;
  matches: KnowledgeMatch[];
  /** false, wenn die Wissensbasis leer/nicht konfiguriert ist */
  available: boolean;
}
