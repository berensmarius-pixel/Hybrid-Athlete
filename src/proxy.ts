import { NextRequest, NextResponse } from "next/server";
import { isAuthConfigured, verifyFeedToken, verifyRequest } from "@/lib/apiAuth";

const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/strava/callback"];
const FEED_PATH = "/api/calendar/feed.ics";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Kalender-Abo: externe Clients authentifizieren sich per ?token=
  if (pathname === FEED_PATH) {
    if (!isAuthConfigured()) return NextResponse.next();
    const token = request.nextUrl.searchParams.get("token") ?? "";
    if (await verifyFeedToken(token)) return NextResponse.next();
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
