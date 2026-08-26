import { NextResponse } from "next/server";
import { readGoogleTokens } from "@/lib/server/googleTokens";

/**
 * GET /api/calendar/google/status
 *
 * Verbindungsstatus für das UI – KEINE Tokens, nur Metadaten:
 * `{ configured, connected, email, expiresAt, scope }`
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const configured = Boolean(clientId && clientSecret);

  try {
    const tokens = await readGoogleTokens();
    return NextResponse.json({
      success: true,
      configured,
      connected: Boolean(tokens?.refreshToken),
      email: tokens?.email ?? null,
      expiresAt: tokens?.expiresAt ?? null,
      scope: tokens?.scope ?? null,
    });
  } catch (err) {
    console.error("[api/calendar/google/status] failed:", err);
    return NextResponse.json(
      { success: false, configured, connected: false, email: null },
      { status: 500 }
    );
  }
}
