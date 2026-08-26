import { NextResponse } from "next/server";
import { SEED_KNOWLEDGE_UNITS } from "@/lib/knowledge/seedKnowledge";
import { storeKnowledgeUnits } from "@/lib/knowledge/store";
import { countChunks } from "@/lib/knowledge/store";
import type { KnowledgeUnit } from "@/types/knowledge";

/**
 * POST /api/kb/seed – füllt die Wissensbasis mit dem kuratierten Kern-Korpus
 * (kanonische Hybrid-Athlete-Prinzipien mit echten Zitationen).
 * Idempotent: Chunks werden über content_hash upgeset, erneutes Aufrufen ist
 * gefahrlos. Empfohlen einmalig nach dem Deployment:
 *   npm run kb -- seed
 */

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Nach Papertitel gruppieren → saubere Dokument-Gruppierung in der Verwaltung.
    const groups = new Map<string, KnowledgeUnit[]>();
    for (const unit of SEED_KNOWLEDGE_UNITS) {
      const title = unit.citation.title;
      const group = groups.get(title) ?? [];
      group.push(unit);
      groups.set(title, group);
    }

    let stored = 0;
    for (const [documentTitle, units] of groups) {
      stored += await storeKnowledgeUnits(units, {
        documentTitle,
        kind: "curated_seed",
        sourceFile: null,
      });
    }

    return NextResponse.json(
      {
        stored,
        seedUnits: SEED_KNOWLEDGE_UNITS.length,
        totalChunks: await countChunks(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "KB_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: { message: "Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." } },
        { status: 503 }
      );
    }
    console.error("[api/kb/seed] Fehler:", err);
    const message =
      err instanceof Error && err.message === "NO_EMBEDDING_KEY"
        ? "Kein Gemini API-Key konfiguriert – Embeddings nicht möglich."
        : "Seeding der Wissensbasis fehlgeschlagen.";
    return NextResponse.json({ error: { message } }, { status: err instanceof Error && err.message === "NO_EMBEDDING_KEY" ? 400 : 500 });
  }
}
