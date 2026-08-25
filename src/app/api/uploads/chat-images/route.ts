import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * POST /api/uploads/chat-images   (multipart/form-data, field: "file")
 * Lädt ein Chat-Foto in den privaten Storage-Bucket `chat-images`.
 * Antwort: { success, path } – Auslieferung erfolgt auth-gated über
 * GET /api/files/chat-images/[...path].
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server-Persistenz nicht konfiguriert." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiges Form-Data." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Feld 'file' fehlt." },
      { status: 400 }
    );
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { success: false, error: `Dateityp nicht erlaubt (${mime || "unbekannt"}).` },
      { status: 415 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Datei zu groß (max. 10 MB)." },
      { status: 413 }
    );
  }

  const ext = EXT_BY_MIME[mime] ?? "bin";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await getSupabaseAdmin()
      .storage
      .from("chat-images")
      .upload(path, buffer, { contentType: mime, upsert: false });

    if (error) throw error;

    return NextResponse.json({ success: true, path });
  } catch (err) {
    console.error("[api/uploads/chat-images POST] failed:", err);
    return NextResponse.json(
      { success: false, error: "Upload fehlgeschlagen." },
      { status: 500 }
    );
  }
}
