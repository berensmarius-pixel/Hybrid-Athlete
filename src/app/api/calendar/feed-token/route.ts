import { isAuthConfigured, verifyRequest } from "@/lib/apiAuth";
import { getFeedToken, rotateFeedToken } from "@/lib/server/feedToken";

/**
 * GET /api/calendar/feed-token → aktuelles Feed-Token für die Abo-URL.
 * POST /api/calendar/feed-token → rotiert das Token (alte URLs werden ungültig).
 *
 * Beide Varianten verlangen eine gültige Session (verifyRequest).
 */
async function guard(req: Request): Promise<Response | null> {
  if (!isAuthConfigured()) {
    // Kein Schutz konfiguriert → Feed funktioniert ohne Token
    return Response.json({ success: true, protected: false });
  }
  if (!(await verifyRequest(req))) {
    return Response.json({ success: false }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const early = await guard(req);
  if (early) return early;
  try {
    return Response.json({
      success: true,
      protected: true,
      token: await getFeedToken(),
    });
  } catch (err) {
    console.error("[feed-token GET] failed:", err);
    return Response.json(
      { success: false, error: "Feed-Token konnte nicht gelesen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const early = await guard(req);
  if (early) return early;
  try {
    return Response.json({
      success: true,
      protected: true,
      token: await rotateFeedToken(),
    });
  } catch (err) {
    console.error("[feed-token POST] failed:", err);
    return Response.json(
      { success: false, error: "Feed-Token konnte nicht rotiert werden." },
      { status: 500 }
    );
  }
}
