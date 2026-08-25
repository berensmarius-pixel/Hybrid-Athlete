import { NextResponse } from "next/server";
import {
  deleteGeminiKeyServer,
  saveGeminiKeyServer,
} from "@/lib/server/geminiKey";

/**
 * PUT /api/settings/gemini-key   Body: { key: string }
 * DELETE /api/settings/gemini-key
 *
 * Dedizierter Endpoint für den Gemini-API-Key – der Key läuft bewusst
 * NICHT über /api/state (dort nur noch Sync-Daten, keine Secrets).
 * Ein GET existiert absichtlich nicht: Der Key verlässt den Server nie.
 */
export async function PUT(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { key?: unknown };
    if (typeof body?.key === "string") key = body.key;
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  if (!key.trim()) {
    return NextResponse.json(
      { success: false, error: "API-Key erforderlich." },
      { status: 400 }
    );
  }

  if (key.trim().length > 512) {
    return NextResponse.json(
      { success: false, error: "API-Key ungewöhnlich lang." },
      { status: 413 }
    );
  }

  const ok = await saveGeminiKeyServer(key);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: "API-Key konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const ok = await deleteGeminiKeyServer();
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 500 });
}
