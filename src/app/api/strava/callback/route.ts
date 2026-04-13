/**
 * GET /api/strava/callback
 *
 * Strava redirects here after the user authorises the app.
 * Query params: ?code=<auth_code>&scope=...&state=...
 *
 * This handler exchanges the auth code for access + refresh tokens,
 * then redirects back to the dashboard with the tokens as URL params
 * so the client can persist them to localStorage.
 *
 * Environment variables required:
 *   STRAVA_CLIENT_ID      – your numeric Strava application ID
 *   STRAVA_CLIENT_SECRET  – your Strava client secret
 */

import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // User denied permission
  if (error || !code) {
    return NextResponse.redirect(
      new URL("/?strava_error=access_denied", request.url)
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/?strava_error=missing_env", request.url)
    );
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Strava token exchange failed:", body);
      return NextResponse.redirect(
        new URL("/?strava_error=token_exchange_failed", request.url)
      );
    }

    const data = await tokenRes.json();

    // Pass token data back to the client via query params.
    // In production you would store these server-side (DB / encrypted cookie).
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("strava_connected", "1");
    redirectUrl.searchParams.set("strava_access_token", data.access_token);
    redirectUrl.searchParams.set("strava_refresh_token", data.refresh_token);
    redirectUrl.searchParams.set("strava_expires_at", String(data.expires_at));
    redirectUrl.searchParams.set("strava_athlete_id", String(data.athlete.id));
    redirectUrl.searchParams.set("strava_firstname", data.athlete.firstname);
    redirectUrl.searchParams.set("strava_lastname", data.athlete.lastname);
    redirectUrl.searchParams.set("strava_profile", encodeURIComponent(data.athlete.profile ?? ""));

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Strava callback error:", err);
    return NextResponse.redirect(
      new URL("/?strava_error=server_error", request.url)
    );
  }
}
