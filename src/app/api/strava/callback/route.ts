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
 * Die OAuth-Logik (Code-Exchange) liegt im Integrations-Adapter:
 *   src/modules/integrations/strava/oauth.ts
 *
 * Environment variables required:
 *   STRAVA_CLIENT_ID      – your numeric Strava application ID
 *   STRAVA_CLIENT_SECRET  – your Strava client secret
 */

import { type NextRequest, NextResponse } from "next/server";
import { saveStravaTokens } from "@/lib/server/stravaTokens";
import { exchangeAuthorizationCode, getOAuthConfig } from "@/modules/integrations/strava";

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

  const config = getOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/?strava_error=missing_env", request.url)
    );
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, config);

    const athlete = {
      id: Number(tokens.athlete?.id ?? 0),
      firstname: String(tokens.athlete?.firstname ?? ""),
      lastname: String(tokens.athlete?.lastname ?? ""),
      profile: String(tokens.athlete?.profile ?? ""),
    };

    const stored = await saveStravaTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
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
      new URL("/?strava_error=token_exchange_failed", request.url)
    );
  }
}
