/**
 * GET /api/strava/debug
 * Temporary diagnostic route — delete after confirming the integration works.
 */
export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const accessToken = process.env.STRAVA_ACCESS_TOKEN;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  // Step 1: check env vars are present
  const envCheck = {
    STRAVA_CLIENT_ID: clientId ? `✓ (${clientId})` : "✗ MISSING",
    STRAVA_CLIENT_SECRET: clientSecret ? `✓ (${clientSecret.slice(0, 6)}…)` : "✗ MISSING",
    STRAVA_ACCESS_TOKEN: accessToken ? `✓ (${accessToken.slice(0, 6)}…)` : "✗ MISSING",
    STRAVA_REFRESH_TOKEN: refreshToken ? `✓ (${refreshToken.slice(0, 6)}…)` : "✗ MISSING",
  };

  // Step 2: try the access token directly
  let accessTokenResult: unknown = "skipped";
  if (accessToken) {
    const r = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    accessTokenResult = {
      status: r.status,
      ok: r.ok,
      body: r.ok ? await r.json() : await r.text(),
    };
  }

  // Step 3: try the refresh token
  let refreshResult: unknown = "skipped";
  if (clientId && clientSecret && refreshToken) {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    refreshResult = {
      status: r.status,
      ok: r.ok,
      body: await r.json(),
    };
  }

  // Step 4: try the activities endpoint directly
  let activitiesResult: unknown = "skipped";
  if (accessToken) {
    const r = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=5&page=1",
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    activitiesResult = {
      status: r.status,
      ok: r.ok,
      body: await r.json(),
    };
  }

  return Response.json({ envCheck, accessTokenResult, refreshResult, activitiesResult }, { status: 200 });
}
