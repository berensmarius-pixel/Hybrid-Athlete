import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, verifyRequest } from "@/lib/apiAuth";
import { verifyFeedTokenValue } from "@/lib/server/feedToken";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitedResponse,
} from "@/lib/server/rateLimit";

const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/strava/callback",
  // Google-OAuth-Callback: Google leitet den Browser hierher zurück
  "/api/google/callback",
  // Inngest verifiziert Requests selbst über die x-inngest-signatur
  "/api/inngest",
  // Garmin-Push-Webhook authentifiziert sich selbst über
  // GARMIN_WEBHOOK_SECRET/HMAC (siehe lib/server/garminWebhook.ts) – ein
  // Browser-Session-Cookie ist hier nicht vorhanden.
  "/api/webhooks/garmin",
];
const FEED_PATH = "/api/calendar/feed.ics";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate Limiting (auch für öffentliche Routen – Brute-Force-Schutz)
  if (
    !consumeRateLimit(getClientIp(request), pathname)
  ) {
    return rateLimitedResponse();
  }

  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Kalender-Abo: externe Clients authentifizieren sich per ?token=
  // (separates, rotierbares Feed-Token – nicht der Session-Token)
  if (pathname === FEED_PATH) {
    if (!isAuthConfigured()) return NextResponse.next();
    const token = request.nextUrl.searchParams.get("token") ?? "";
    if (await verifyFeedTokenValue(token)) return NextResponse.next();
    return NextResponse.json(
      { success: false, error: "Nicht autorisiert" },
      { status: 401 }
    );
  }

  if (!isAuthConfigured()) return NextResponse.next();

  if (await verifyRequest(request)) return NextResponse.next();

  return NextResponse.json(
    { success: false, error: "Nicht autorisiert" },
    { status: 401 }
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
