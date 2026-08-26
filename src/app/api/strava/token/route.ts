/**
 * POST /api/strava/token
 *
 * Refreshes an expired Strava access token using the stored refresh token.
 * Called by the client when the access token has expired (expires_at < now).
 *
 * Request body: { refresh_token: string }
 * Response:     { access_token, refresh_token, expires_at }
 *
 * Die eigentliche Logik liegt im Integrations-Adapter:
 *   src/modules/integrations/strava/oauth.ts
 */

import { refreshAccessToken } from "@/modules/integrations/strava";

export async function POST(request: Request) {
  const { refresh_token } = await request.json() as { refresh_token: string };

  if (!refresh_token) {
    return Response.json({ error: "refresh_token is required" }, { status: 400 });
  }

  try {
    const tokens = await refreshAccessToken(refresh_token);
    return Response.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    });
  } catch (err) {
    console.error("Strava token refresh failed:", err);
    return Response.json(
      { error: "Token refresh failed" },
      { status: 502 }
    );
  }
}
