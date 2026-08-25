import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * GET /api/files/chat-images/[...path]
 * Auth-gated Auslieferung privater Chat-Bilder aus dem Storage-Bucket.
 * (Der Bucket selbst hat keine öffentlichen Policies.)
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/files/chat-images/[...path]">
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: false }, { status: 503 });
  }

  const { path: segments } = await ctx.params;
  if (!Array.isArray(segments) || segments.length === 0 || segments.some((s) => !s || s.includes(".."))) {
    return NextResponse.json({ success: false, error: "Ungültiger Pfad." }, { status: 400 });
  }
  const objectPath = segments.join("/");

  try {
    const { data, error } = await getSupabaseAdmin()
      .storage
      .from("chat-images")
      .download(objectPath);

    if (error || !data) {
      return NextResponse.json({ success: false, error: "Nicht gefunden." }, { status: 404 });
    }

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
        // Uploads sind clientkontrolliert → niemals vom Browser als
        // HTML/JS interpretieren lassen.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    console.error("[api/files/chat-images GET] failed:", err);
    return NextResponse.json({ success: false, error: "Abruf fehlgeschlagen." }, { status: 500 });
  }
}
