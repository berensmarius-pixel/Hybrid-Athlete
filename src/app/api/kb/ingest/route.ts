import { NextRequest, NextResponse } from "next/server";
import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";
import { chunkPlainText } from "@/lib/knowledge/chunker";
import { extractKnowledgeUnitsFromPdf } from "@/lib/knowledge/pdfIngest";
import { storeKnowledgeUnits, storeRawChunks } from "@/lib/knowledge/store";

/**
 * POST /api/kb/ingest – Ingestion wissenschaftlicher Quellen (multipart/form-data).
 *
 *  a) PDF:  fields: file=<PDF>, title?, topics?
 *     → Upload zur Gemini File API, schema-behaftete Extraktion von
 *       Wissenseinheiten, Embedding & Speicherung.
 *  b) Text: fields: text=<plain/markdown>, title?, topics?
 *     → überlappendes Chunking, Embedding & Speicherung.
 *
 * CLI-Helper: `npm run kb -- ingest <pdf|ordner>`
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function csvTopics(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

export async function POST(req: NextRequest) {
  const apiKey = await resolveGeminiKeyServer();
  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "Kein Gemini API-Key konfiguriert.", status: "NO_KEY" } },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: { message: "multipart/form-data erwartet." } }, { status: 400 });
  }

  const file = form.get("file");
  const text = typeof form.get("text") === "string" ? String(form.get("text")).trim() : "";
  const explicitTitle = typeof form.get("title") === "string" ? String(form.get("title")).trim() : "";
  const topics = csvTopics(form.get("topics"));

  try {
    // ── Pfad A: PDF via Gemini File API ──────────────────────────────────────
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const pdfFile = file as File;
      const isPdf =
        pdfFile.type === "application/pdf" || pdfFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return NextResponse.json({ error: { message: "Nur PDF-Dateien werden unterstützt." } }, { status: 415 });
      }
      if (pdfFile.size > MAX_PDF_BYTES) {
        return NextResponse.json({ error: { message: "PDF ist größer als 20 MB." } }, { status: 413 });
      }

      const bytes = new Uint8Array(await pdfFile.arrayBuffer());
      const { units, usedModel } = await extractKnowledgeUnitsFromPdf(bytes, pdfFile.name, apiKey);

      const documentTitle =
        explicitTitle || units[0]?.citation.title || pdfFile.name.replace(/\.pdf$/i, "");

      const stored = await storeKnowledgeUnits(units, {
        documentTitle,
        kind: "paper_extract",
        sourceFile: pdfFile.name,
      });

      return NextResponse.json(
        { stored, extractedUnits: units.length, usedModel, documentTitle },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // ── Pfad B: Rohtext (.txt/.md/Notizen) ───────────────────────────────────
    if (text.length >= 80) {
      const chunks = chunkPlainText(text);
      if (chunks.length === 0) {
        return NextResponse.json({ error: { message: "Text enthält keine verwertbaren Abschnitte." } }, { status: 422 });
      }
      const documentTitle = explicitTitle || `Notiz ${new Date().toISOString().slice(0, 10)}`;
      const stored = await storeRawChunks(chunks, { documentTitle, kind: "text_note" }, topics);

      return NextResponse.json(
        { stored, chunks: chunks.length, documentTitle },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: { message: "Weder gültige PDF-Datei noch Textfeld (min. 80 Zeichen) übergeben." } },
      { status: 400 }
    );
  } catch (err) {
    console.error("[api/kb/ingest] Fehler:", err);
    const message = err instanceof Error ? err.message : "Ingestion fehlgeschlagen.";
    return NextResponse.json({ error: { message } }, { status: 502 });
  }
}
