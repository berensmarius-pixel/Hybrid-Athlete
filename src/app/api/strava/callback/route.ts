/**
 * GET /api/strava/callback
 *
 * Strava redirects here after the user authorises the app.
 * Query params: ?code=<auth_code>&scope=...&state=...
 *
 * This handler exchanges the auth code for access + refresh tokens and
 * stores them SERVER-side (Supabase app_state, Fallback: lokale Datei).
 * Der Browser-Redirect enthält ausschließlich nicht-sensible
 * Athlete-Metadaten – Tokens verlassen den Server nie.
 *
 * Environment variables required:
 *   STRAVA_CLIENT_ID      – your numeric Strava application ID
 *   STRAVA_CLIENT_SECRET  – your Strava client secret
 */

import { type NextRequest, NextResponse } from "next/server";
import { saveStravaTokens } from "@/lib/server/stravaTokens";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // OAuth-State wird an den Client durchgereicht – dieser validiert ihn
  // gegen den vor der Weiterleitung gespeicherten Wert (CSRF-Schutz).
  const state = searchParams.get("state");

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

    const athlete = {
      id: Number(data.athlete?.id ?? 0),
      firstname: String(data.athlete?.firstname ?? ""),
      lastname: String(data.athlete?.lastname ?? ""),
      profile: String(data.athlete?.profile ?? ""),
    };

    const stored = await saveStravaTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athlete,
    });

    if (!stored) {
      console.error("Strava token persistence failed on server");
      return NextResponse.redirect(
        new URL("/?strava_error=storage_failed", request.url)
      );
    }

    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("strava_connected", "1");
    if (state) redirectUrl.searchParams.set("state", state);
    redirectUrl.searchParams.set("strava_athlete_id", String(athlete.id));
    redirectUrl.searchParams.set("strava_firstname", athlete.firstname);
    redirectUrl.searchParams.set("strava_lastname", athlete.lastname);
    redirectUrl.searchParams.set("strava_profile", encodeURIComponent(athlete.profile));

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Strava callback error:", err);
    return NextResponse.redirect(
      new URL("/?strava_error=server_error", request.url)
    );
  }
}
