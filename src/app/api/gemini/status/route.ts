import { NextResponse } from "next/server";
import { resolveGeminiKeyServer } from "@/lib/server/geminiKey";

/**
 * GET /api/gemini/status
 * Liefert NUR, ob ein Key konfiguriert ist – niemals den Key selbst.
 */
export async function GET() {
  const key = await resolveGeminiKeyServer();
  return NextResponse.json({ success: true, configured: Boolean(key) });
}
