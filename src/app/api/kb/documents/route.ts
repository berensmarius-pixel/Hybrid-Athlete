import { NextRequest, NextResponse } from "next/server";
import { countChunks, deleteDocument, listDocuments } from "@/lib/knowledge/store";

/**
 * GET    /api/kb/documents – Liste aller Dokumente mit Chunk-Zählern.
 * DELETE /api/kb/documents?title=<document_title> – löscht alle Chunks eines Dokuments.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [documents, total] = await Promise.all([listDocuments(), countChunks()]);
    return NextResponse.json(
      { documents, totalChunks: total },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "KB_NOT_CONFIGURED") {
      return NextResponse.json({ documents: [], totalChunks: 0 });
    }
    console.error("[api/kb/documents] GET Fehler:", err);
    return NextResponse.json({ error: { message: "Wissensbasis-Lesen fehlgeschlagen." } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  if (!title) {
    return NextResponse.json({ error: { message: "Parameter 'title' fehlt." } }, { status: 400 });
  }

  try {
    const deleted = await deleteDocument(title);
    return NextResponse.json({ deleted, totalChunks: await countChunks() });
  } catch (err) {
    console.error("[api/kb/documents] DELETE Fehler:", err);
    const message = err instanceof Error ? err.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
