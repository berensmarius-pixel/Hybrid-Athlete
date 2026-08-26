import { createHash } from "node:crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/knowledge/embeddingClient";
import { buildUnitChunkText } from "@/lib/knowledge/chunker";
import { EMBEDDING_MODEL } from "@/lib/knowledge/embeddingClient";
import type {
  KnowledgeChunkKind,
  KnowledgeUnit,
} from "@/types/knowledge";

/**
 * Persistenz-Layer der Wissensbasis (nur Server!):
 * Chunks werden mit RETRIEVAL_DOCUMENT-Embeddings in `knowledge_chunks`
 * gespeichert (Upsert über content_hash → idempotente Ingestion).
 */

export interface StoreMeta {
  documentTitle: string;
  kind: KnowledgeChunkKind;
  sourceFile?: string | null;
}

interface ChunkRow {
  id: string;
  document_title: string;
  content: string;
  citation: unknown | null;
  topics: string[];
  kind: KnowledgeChunkKind;
  source_file: string | null;
  content_hash: string;
  embedding_model: string;
  embedding: number[];
}

function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error("KB_NOT_CONFIGURED");
  }
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Dateinamen/Papertitel → stabile, URL-safe Slug-ID. */
export function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function dedupeByHash<T extends { contentHash: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.contentHash)) return false;
    seen.add(row.contentHash);
    return true;
  });
}

/**
 * Speichert semantische Wissenseinheiten (Seed-Korpus oder PDF-Extraktion):
 * pro Unit ein Chunk, angereichert für bessere Embedding-Qualität.
 * Units mit stabiler `id` (Seed-Korpus) behalten diese → idempotentes Re-Seeden.
 * @returns Anzahl tatsächlich geschriebener Chunks
 */
export async function storeKnowledgeUnits(
  units: Array<KnowledgeUnit & { id?: string }>,
  meta: StoreMeta
): Promise<number> {
  assertSupabaseConfigured();

  const candidates = units.map((unit, index) => {
    const content = buildUnitChunkText(unit);
    return {
      id:
        typeof unit.id === "string" && unit.id.startsWith("seed--")
          ? unit.id
          : `${slugifyId(meta.documentTitle)}--${index}`,
      documentTitle: meta.documentTitle,
      content,
      citation: unit.citation,
      topics: Array.from(new Set(unit.topics.map((t) => t.toLowerCase()))),
      kind: meta.kind,
      sourceFile: meta.sourceFile ?? null,
      contentHash: sha256Hex(content),
    };
  });

  return persistCandidates(candidates);
}

/** Speichert Rohtext-Chunks (z. B. .txt/.md-Ingestion ohne LLM-Extraktion). */
export async function storeRawChunks(
  chunks: string[],
  meta: Omit<StoreMeta, "kind"> & { kind?: KnowledgeChunkKind },
  topics: string[] = []
): Promise<number> {
  assertSupabaseConfigured();

  const candidates = chunks.map((content, index) => ({
    id: `${slugifyId(meta.documentTitle)}--raw-${index}`,
    documentTitle: meta.documentTitle,
    content,
    citation: null,
    topics: topics.map((t) => t.toLowerCase()),
    kind: meta.kind ?? ("text_note" as KnowledgeChunkKind),
    sourceFile: meta.sourceFile ?? null,
    contentHash: sha256Hex(content),
  }));

  return persistCandidates(candidates);
}

async function persistCandidates(
  candidates: {
    id: string;
    documentTitle: string;
    content: string;
    citation: unknown | null;
    topics: string[];
    kind: KnowledgeChunkKind;
    sourceFile: string | null;
    contentHash: string;
  }[]
): Promise<number> {
  const unique = dedupeByHash(candidates);
  if (unique.length === 0) return 0;

  const embeddings = await embedTexts(
    unique.map((c) => c.content),
    "RETRIEVAL_DOCUMENT"
  );

  const rows: ChunkRow[] = unique.map((c, i) => ({
    id: c.id,
    document_title: c.documentTitle,
    content: c.content,
    citation: c.citation ?? null,
    topics: c.topics,
    kind: c.kind,
    source_file: c.sourceFile,
    content_hash: c.contentHash,
    embedding_model: EMBEDDING_MODEL,
    embedding: embeddings[i],
  }));

  const { error } = await getSupabaseAdmin()
    .from("knowledge_chunks")
    .upsert(rows, { onConflict: "content_hash" });

  if (error) {
    throw new Error(`Wissensbasis-Speichern fehlgeschlagen: ${error.message}`);
  }
  return rows.length;
}

export interface KbDocumentSummary {
  documentTitle: string;
  kind: KnowledgeChunkKind | string;
  chunkCount: number;
  citation: unknown | null;
  createdAt: string;
}

/** Listet Dokumente (gruppiert nach Titel) mit Chunk-Zähler. */
export async function listDocuments(): Promise<KbDocumentSummary[]> {
  assertSupabaseConfigured();

  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_chunks")
    .select("document_title, kind, citation, created_at");

  if (error) throw new Error(`Wissensbasis-Lesen fehlgeschlagen: ${error.message}`);

  const grouped = new Map<string, KbDocumentSummary>();
  for (const row of data ?? []) {
    const r = row as {
      document_title: string;
      kind: string;
      citation: unknown;
      created_at: string;
    };
    const existing = grouped.get(r.document_title);
    if (existing) {
      existing.chunkCount += 1;
    } else {
      grouped.set(r.document_title, {
        documentTitle: r.document_title,
        kind: r.kind,
        chunkCount: 1,
        citation: r.citation,
        createdAt: r.created_at,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.documentTitle.localeCompare(b.documentTitle)
  );
}

/** Löscht alle Chunks eines Dokuments (per Titel). */
export async function deleteDocument(documentTitle: string): Promise<number> {
  assertSupabaseConfigured();
  const { data, error } = await getSupabaseAdmin()
    .from("knowledge_chunks")
    .delete()
    .eq("document_title", documentTitle)
    .select("id");
  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
  return (data ?? []).length;
}

/** Gesamtzahl der Chunks (0 auch wenn Supabase nicht konfiguriert ist). */
export async function countChunks(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { count, error } = await getSupabaseAdmin()
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}
