/**
 * Server-seitiger Gemini-Embedding-Client (rohes fetch, konsistent mit dem
 * Rest der App – kein SDK). Nutzt `batchEmbedContents` mit task-spezifischen
 * Embeddings: RETRIEVAL_DOCUMENT für Chunks, RETRIEVAL_QUERY für Suchanfragen.
 *
 * Modell: gemini-embedding-001, auf 768 Dimensionen reduziert (Matryoshka) –
 * passend zur Spalte knowledge_chunks.embedding vector(768).
 *
 * WICHTIG: Nur aus API-Routen importieren (enthält den Server-Gemini-Key-Pfad),
 * niemals im Client-Bundle verwenden.
 */

import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

/** Max. Requests pro batchEmbedContents-Aufruf (API-Limit: 100). */
const BATCH_SIZE = 50;

export type EmbeddingTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION";

interface EmbedRequest {
  model: string;
  content: { parts: { text: string }[] };
  taskType: EmbeddingTaskType;
  outputDimensionality: number;
}

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
  error?: { message?: string; status?: string };
}

function truncateForEmbedding(text: string, maxChars = 6000): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}

async function embedBatch(
  apiKey: string,
  texts: string[],
  taskType: EmbeddingTaskType
): Promise<number[][]> {
  const requests: EmbedRequest[] = texts.map((text) => ({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text: truncateForEmbedding(text) }] },
    taskType,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );

  const json = (await res.json().catch(() => null)) as BatchEmbedResponse | null;

  if (!res.ok || !json?.embeddings) {
    throw new Error(
      `Gemini Embedding-Fehler (${res.status}): ${json?.error?.message ?? res.statusText}`
    );
  }

  const vectors = json.embeddings.map((e) => e.values ?? []);
  if (vectors.some((v) => v.length === 0)) {
    throw new Error("Gemini Embedding-Fehler: leere Vektoren in der Antwort.");
  }
  return vectors as number[][];
}

/**
 * Embeddet mehrere Texte (batched). Reihenfolge bleibt erhalten.
 * Wirft bei fehlendem Key oder API-Fehler.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType
): Promise<number[][]> {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return [];

  const apiKey = await resolveGeminiKeyServer();
  if (!apiKey) {
    throw new Error("NO_EMBEDDING_KEY");
  }

  const out: number[][] = [];
  for (let i = 0; i < clean.length; i += BATCH_SIZE) {
    const batch = clean.slice(i, i + BATCH_SIZE);
    out.push(...(await embedBatch(apiKey, batch, taskType)));
  }
  return out;
}
