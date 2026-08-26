import { type NextRequest, NextResponse } from "next/server";
import {
  GoogleCalendarError,
  getValidAccessToken,
  queryFreeBusy,
} from "@/lib/server/googleCalendarClient";
import { readSchedulingSettings } from "@/lib/server/googleCalendarData";
import { CALENDAR_TIME_ZONE } from "@/lib/calendar/gcal/timezone";

/**
 * GET /api/calendar/google/busy?days=10
 *
 * Liefert die gemergten Busy-Slots des Ziel-Kalenders für den
 * Planungshorizont – Basis für Frei-Slot-Erkennung & Vorschau im UI.
 */
export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) ? Math.min(21, Math.max(1, Math.round(daysParam))) : 10;

  try {
    await getValidAccessToken();
    const settings = await readSchedulingSettings();
    const fromMs = Date.now();
    const toMs = fromMs + days * 24 * 60 * 60_000;
    const busy = await queryFreeBusy(settings.calendarId, fromMs, toMs);
    return NextResponse.json({
      success: true,
      timeZone: CALENDAR_TIME_ZONE,
      range: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
      busy,
    });
  } catch (err) {
    if (err instanceof GoogleCalendarError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.status }
      );
    }
    console.error("[api/calendar/google/busy] failed:", err);
    return NextResponse.json(
      { success: false, error: "Busy-Slots konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
