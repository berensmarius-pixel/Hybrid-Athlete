import { NextResponse } from "next/server";
import {
  GoogleCalendarError,
  getValidAccessToken,
  listCalendars,
} from "@/lib/server/googleCalendarClient";

/**
 * GET /api/calendar/google/calendars
 *
 * Listet die Kalender des verbundenen Google-Kontos (nur mit Schreibrecht),
 * damit der Nutzer den Ziel-Kalender (primär oder "Hybrid Training") wählt.
 */
export async function GET() {
  try {
    // Vorab prüfen – wirft "not_connected" mit Status 401
    await getValidAccessToken();
    const calendars = await listCalendars();
    return NextResponse.json({ success: true, calendars });
  } catch (err) {
    if (err instanceof GoogleCalendarError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status }
      );
    }
    console.error("[api/calendar/google/calendars] failed:", err);
    return NextResponse.json(
      { success: false, error: "Kalender konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
