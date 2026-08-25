import { NextRequest, NextResponse } from "next/server";
import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";

/**
 * POST /api/gemini/[...path]
 *
 * Auth-gated Proxy zum Gemini-API. Der API-Key wird serverseitig aufgelöst
 * (app_state `hybrid_athlete_gemini_key`, Fallback: Env GEMINI_API_KEY)
 * und gelangt nie in den Browser/Bundel.
 *
 * Beispiel: POST /api/gemini/v1beta/interactions
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/gemini/[...path]">
) {
  const { path: segments } = await ctx.params;

  // Nur echte Gemini-API-Pfade durchlassen
  if (
    !Array.isArray(segments) ||
    segments.length < 1 ||
    !["v1", "v1beta"].includes(segments[0]) ||
    segments.some((s) => s.includes(".."))
  ) {
    return NextResponse.json(
      { error: { message: "Ungültiger Gemini-Pfad." } },
      { status: 400 }
    );
  }

  const apiKey = await resolveGeminiKeyServer();
  if (!apiKey) {
    return NextResponse.json(
      { error: { message: "Kein Gemini API-Key konfiguriert.", status: "NO_KEY" } },
      { status: 400 }
    );
  }

  // Segmente sind gegen ".." und Nicht-v1-Pfade geprüft; ":" im Model-Namen
  // (z. B. models/…:generateContent) muss literal bleiben.
  const target = `https://generativelanguage.googleapis.com/${segments.join("/")}`;

  try {
    const body = await req.text();
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/gemini proxy] failed:", err);
    return NextResponse.json(
      { error: { message: "Gemini-Anfrage fehlgeschlagen." } },
      { status: 502 }
    );
  }
}
