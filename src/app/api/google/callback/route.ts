/**
 * GET /api/google/callback
 *
 * Google leitet nach der OAuth-Zustimmung hierher:
 * ?code=<auth_code>&state=...&scope=...
 *
 * Der Handler tauscht den Code gegen Access- + Refresh-Tokens und legt sie
 * SERVER-seitig ab (Supabase app_state, Fallback: lokale Datei). Der
 * Browser-Redirect enthält ausschließlich nicht-sensible Kontodaten
 * (E-Mail) – Tokens verlassen den Server nie.
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */

import { type NextRequest, NextResponse } from "next/server";
import { saveGoogleTokens } from "@/lib/server/googleTokens";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payloadPart = idToken.split(".")[1];
    if (!payloadPart) return null;
    const json = Buffer.from(payloadPart, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { email?: string };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // OAuth-State wird an den Client durchgereicht – dieser validiert ihn
  // gegen den vor der Weiterleitung gespeicherten Wert (CSRF-Schutz).
  const state = searchParams.get("state");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?gcal_error=access_denied", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?gcal_error=missing_env", request.url));
  }

  try {
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Google token exchange failed:", body.slice(0, 500));
      return NextResponse.redirect(
        new URL("/?gcal_error=token_exchange_failed", request.url)
      );
    }

    const data = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
    };

    if (!data.access_token || !data.refresh_token) {
      // Ohne refresh_token wäre die Verbindung beim nächsten Ablauf tot
      console.error("Google OAuth: missing refresh_token (prompt=consent erzwingen)");
      return NextResponse.redirect(new URL("/?gcal_error=no_refresh_token", request.url));
    }

    const stored = await saveGoogleTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      email: decodeIdTokenEmail(data.id_token),
      scope: data.scope ?? null,
    });

    if (!stored) {
      console.error("Google token persistence failed on server");
      return NextResponse.redirect(new URL("/?gcal_error=storage_failed", request.url));
    }

    const email = decodeIdTokenEmail(data.id_token) ?? "";
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("gcal_connected", "1");
    if (state) redirectUrl.searchParams.set("state", state);
    if (email) redirectUrl.searchParams.set("gcal_email", email);

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Google callback error:", err);
    return NextResponse.redirect(new URL("/?gcal_error=server_error", request.url));
  }
}
