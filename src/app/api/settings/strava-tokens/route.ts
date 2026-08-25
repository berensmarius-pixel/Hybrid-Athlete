import { NextResponse } from "next/server";
import {
  deleteStravaTokens,
  saveStravaTokens,
} from "@/lib/server/stravaTokens";

/**
 * PUT /api/settings/strava-tokens
 * Body: { value: { accessToken, refreshToken, expiresAt, athlete? } }
 *
 * DELETE /api/settings/strava-tokens
 *
 * Dedizierter Endpoint für Strava-OAuth-Tokens (Legacy-Migration aus dem
 * Browser-Storage + Disconnect). Kein GET: Tokens verlassen den Server nie.
 */
export async function PUT(req: Request) {
  let tokens: unknown;
  try {
    const body = (await req.json()) as { value?: unknown };
    tokens = body?.value;
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  const t = tokens as
    | { accessToken?: unknown; refreshToken?: unknown; expiresAt?: unknown; athlete?: unknown }
    | null
    | undefined;

  if (
    !t ||
    typeof t.accessToken !== "string" ||
    typeof t.refreshToken !== "string" ||
    !t.accessToken ||
    !t.refreshToken
  ) {
    return NextResponse.json(
      { success: false, error: "accessToken und refreshToken erforderlich." },
      { status: 400 }
    );
  }

  const ok = await saveStravaTokens({
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: typeof t.expiresAt === "number" ? t.expiresAt : 0,
    athlete: (t.athlete ?? null) as never,
  });

  return NextResponse.json({ success: ok }, { status: ok ? 200 : 500 });
}

export async function DELETE() {
  const ok = await deleteStravaTokens();
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 500 });
}
