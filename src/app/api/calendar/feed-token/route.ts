import { computeSessionToken, isAuthConfigured, verifyRequest } from "@/lib/apiAuth";

/** GET /api/calendar/feed-token → Token für die Kalender-Abo-URL. */
export async function GET(req: Request) {
  if (!isAuthConfigured()) {
    // Kein Schutz konfiguriert → Feed funktioniert ohne Token
    return Response.json({ success: true, protected: false });
  }
  if (!(await verifyRequest(req))) {
    return Response.json({ success: false }, { status: 401 });
  }
  return Response.json({
    success: true,
    protected: true,
    token: await computeSessionToken(),
  });
}
