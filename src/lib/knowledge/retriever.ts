import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/knowledge/embeddingClient";
import type {
  KnowledgeCitation,
  KnowledgeMatch,
  ScientificGrounding,
} from "@/types/knowledge";

/**
 * Retrieval-Layer des RAG-Moduls (nur Server!):
 * Suchanfragen → RETRIEVAL_QUERY-Embeddings → Cosine-Suche via
 * `match_knowledge_chunks`-RPC → deduplizierte Top-K-Treffer →
 * formatierter "Scientific Grounding Context" für den Coach-Prompt.
 */

export const DEFAULT_MAX_CHUNKS = 4;
export const DEFAULT_MIN_SIMILARITY = 0.38;

const MAX_QUERY_CHARS = 1200;

interface RpcRow {
  id: string;
  document_title: string;
  content: string;
  citation: KnowledgeCitation | null;
  topics: string[] | null;
  kind: string;
  similarity: number;
}

/** Führt die Vektor-Suche für mehrere Queries aus und dedupliziert nach ID. */
export async function retrieveKnowledgeChunks(
  queries: string[],
  maxChunks = DEFAULT_MAX_CHUNKS,
  minSimilarity = DEFAULT_MIN_SIMILARITY
): Promise<KnowledgeMatch[]> {
  if (!isSupabaseConfigured()) return [];

  const clean = Array.from(
    new Set(
      queries
        .map((q) => q.trim())
        .filter(Boolean)
        .map((q) => q.slice(0, MAX_QUERY_CHARS))
    )
  );
  if (clean.length === 0) return [];

  let queryVectors: number[][];
  try {
    queryVectors = await embedTexts(clean, "RETRIEVAL_QUERY");
  } catch (err) {
    // Kein Key / Quota → Grounding still ausfallen lassen statt hart zu scheitern.
    console.warn("[kb/retriever] Query-Embedding fehlgeschlagen:", err instanceof Error ? err.message : err);
    return [];
  }

  const bestById = new Map<string, KnowledgeMatch>();

  for (let i = 0; i < clean.length; i++) {
    const { data, error } = await getSupabaseAdmin().rpc("match_knowledge_chunks", {
      query_embedding: queryVectors[i],
      match_count: maxChunks,
      min_similarity: minSimilarity,
    });
    if (error) {
      console.warn("[kb/retriever] RPC fehlgeschlagen:", error.message);
      continue;
    }
    for (const row of (data ?? []) as RpcRow[]) {
      const existing = bestById.get(row.id);
      if (!existing || row.similarity > existing.similarity) {
        bestById.set(row.id, {
          id: row.id,
          documentTitle: row.document_title,
          content: row.content,
          citation: row.citation ?? null,
          topics: row.topics ?? [],
          kind: row.kind,
          similarity: row.similarity,
        });
      }
    }
  }

  return Array.from(bestById.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxChunks);
}

export function formatCitation(citation: KnowledgeCitation | null): string {
  if (!citation) return "Quelle unbekannt";
  const parts: string[] = [citation.authors];
  if (citation.year) parts.push(`(${citation.year})`);
  parts.push(`„${citation.title}“`);
  if (citation.journal) parts.push(citation.journal);
  if (citation.doi) parts.push(`DOI: ${citation.doi}`);
  else if (citation.url) parts.push(citation.url);
  return parts.join(" ");
}

/**
 * Formatiert Treffer als deutschen Grounding-Kontextblock.
 * Rein synchron – bei leerer Trefferliste "".
 */
export function formatScientificContext(matches: KnowledgeMatch[]): string {
  if (matches.length === 0) return "";

  const blocks = matches.map((match, index) => {
    const relevance = Math.round(match.similarity * 100);
    const header = `[${index + 1}] ${match.documentTitle} — Relevanz ~${relevance}%`;
    const source = `Quelle: ${formatCitation(match.citation)}`;
    return `${header}\n${source}\n${match.content}`;
  });

  return [
    "Die folgenden Auszüge stammen aus der wissenschaftlichen Wissensbasis des Coaches",
    "(kuratierte Kernprinzipien + extrahierte Fachpaper-Auszüge). Nutze sie als primäre",
    "Grundlage für Trainingsentscheidungen zu diesen Themen:",
    "",
    ...blocks.map((b) => `${b}\n`),
  ].join("\n");
}

/**
 * Kompletter Retrieval-Durchlauf: Queries → Embedding → Suche → Kontext.
 * Gibt null zurück, wenn keine relevanten Chunks gefunden wurden.
 */
export async function buildScientificGrounding(
  queries: string[],
  maxChunks = DEFAULT_MAX_CHUNKS,
  minSimilarity = DEFAULT_MIN_SIMILARITY
): Promise<ScientificGrounding | null> {
  if (!isSupabaseConfigured()) return null;

  const matches = await retrieveKnowledgeChunks(queries, maxChunks, minSimilarity);
  if (matches.length === 0) return null;

  const context = formatScientificContext(matches);
  const sources = matches
    .map((m) => m.citation)
    .filter((c): c is KnowledgeCitation => Boolean(c));

  const queryUsed = Array.from(
    new Set(
      queries
        .map((q) => q.trim())
        .filter(Boolean)
        .map((q) => q.slice(0, MAX_QUERY_CHARS))
    )
  );

  return {
    context,
    sources,
    queryUsed,
  };
}
