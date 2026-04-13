/**
 * POST /api/strava/token
 *
 * Refreshes an expired Strava access token using the stored refresh token.
 * Called by the client when the access token has expired (expires_at < now).
 *
 * Request body: { refresh_token: string }
 * Response:     { access_token, refresh_token, expires_at }
 *
 * Environment variables required:
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 */

export async function POST(request: Request) {
  const { refresh_token } = await request.json() as { refresh_token: string };

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Server not configured: missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  if (!refresh_token) {
    return Response.json({ error: "refresh_token is required" }, { status: 400 });
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return Response.json({ error: "Token refresh failed", detail: body }, { status: 502 });
  }

  const data = await res.json();
  return Response.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  });
}
