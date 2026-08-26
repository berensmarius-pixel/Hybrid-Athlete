import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_MAX_CHUNKS,
  DEFAULT_MIN_SIMILARITY,
  formatScientificContext,
  retrieveKnowledgeChunks,
} from "@/lib/knowledge/retriever";
import { countChunks } from "@/lib/knowledge/store";
import type { KbQueryResponse, ScientificGrounding } from "@/types/knowledge";

/**
 * POST /api/kb/query – Retrieval-Step für den Coach-Prompt.
 *
 * Body: { query?: string; queries?: string[]; maxChunks?: number }
 * Response: { grounding: ScientificGrounding | null; matches; available }
 * `available=false` signalisiert dem Client, dass die Wissensbasis leer ist
 * (Client cacht das und überspringt künftige Queries).
 */

const MAX_QUERIES = 3;

function collectQueries(body: {
  query?: unknown;
  queries?: unknown;
}): string[] {
  const out: string[] = [];
  if (typeof body.query === "string" && body.query.trim()) out.push(body.query.trim());
  if (Array.isArray(body.queries)) {
    for (const q of body.queries) {
      if (typeof q === "string" && q.trim()) out.push(q.trim());
    }
  }
  return Array.from(new Set(out)).slice(0, MAX_QUERIES);
}

export async function POST(req: NextRequest) {
  let body: { query?: unknown; queries?: unknown; maxChunks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Ungültiger Request-Body." } }, { status: 400 });
  }

  const queries = collectQueries(body);
  if (queries.length === 0) {
    return NextResponse.json({ error: { message: "Keine Suchanfrage übergeben." } }, { status: 400 });
  }

  const requestedMax = Number(body.maxChunks);
  const maxChunks =
    Number.isFinite(requestedMax) && requestedMax >= 1
      ? Math.min(8, Math.round(requestedMax))
      : DEFAULT_MAX_CHUNKS;

  const total = await countChunks();

  try {
    const matches = await retrieveKnowledgeChunks(
      queries,
      maxChunks,
      DEFAULT_MIN_SIMILARITY
    );
    const context = formatScientificContext(matches);

    const grounding: ScientificGrounding | null = context
      ? {
          context,
          sources: matches.map((m) => m.citation).filter((c): c is NonNullable<typeof c> => Boolean(c)),
          queryUsed: queries,
        }
      : null;

    const payload: KbQueryResponse = {
      grounding,
      matches,
      available: total > 0,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/kb/query] Fehler:", err);
    return NextResponse.json({ error: { message: "Wissensbasis-Abfrage fehlgeschlagen." } }, { status: 500 });
  }
}
