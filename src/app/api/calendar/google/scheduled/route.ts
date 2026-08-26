import { type NextRequest, NextResponse } from "next/server";
import {
  GoogleCalendarError,
  deleteEvent,
  patchEvent,
} from "@/lib/server/googleCalendarClient";
import {
  readScheduledWorkouts,
  saveScheduledWorkouts,
} from "@/lib/server/googleCalendarData";
import { zonedToUtcMs, zonedTimeString } from "@/lib/calendar/gcal/timezone";

/**
 * GET    /api/calendar/google/scheduled            → verwaltete Workouts
 * PATCH  /api/calendar/google/scheduled            → Reschedule (Zweiweg):
 *        Body { id, date?, startTime? } – verschiebt das Google-Event mit.
 * DELETE /api/calendar/google/scheduled?id=...     → Event löschen + Zuordnung
 *                                                    entfernen (Workout absagen).
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorResponse(err: unknown) {
  if (err instanceof GoogleCalendarError) {
    return NextResponse.json(
      { success: false, error: err.message, code: err.code },
      { status: err.status }
    );
  }
  console.error("[api/calendar/google/scheduled] failed:", err);
  return NextResponse.json(
    { success: false, error: "Aktion fehlgeschlagen." },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const items = await readScheduledWorkouts();
    items.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  let body: { id?: unknown; date?: unknown; startTime?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const newDate = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : null;
  const newStart =
    typeof body.startTime === "string" && TIME_RE.test(body.startTime) ? body.startTime : null;

  if (!id || (!newDate && !newStart)) {
    return NextResponse.json(
      { success: false, error: "id sowie date oder startTime erforderlich." },
      { status: 400 }
    );
  }

  try {
    const items = await readScheduledWorkouts();
    const item = items.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Eintrag nicht gefunden." },
        { status: 404 }
      );
    }

    const date = newDate ?? item.date;
    const startTime = newStart ?? item.startTime;

    // Dauer des bestehenden Eintrags erhalten
    const oldStartMs = zonedToUtcMs(item.date, item.startTime);
    const oldEndMs = zonedToUtcMs(item.date, item.endTime);
    const durationMs = Math.max(15 * 60_000, oldEndMs - oldStartMs);
    const startMs = zonedToUtcMs(date, startTime);
    const endMs = startMs + durationMs;

    await patchEvent(item.calendarId, item.googleEventId, {
      start: { dateTime: new Date(startMs).toISOString(), timeZone: "Europe/Berlin" },
      end: { dateTime: new Date(endMs).toISOString(), timeZone: "Europe/Berlin" },
    });

    const updated: typeof items = items.map((i) =>
      i.id === id
        ? {
            ...i,
            date,
            startTime,
            endTime: zonedTimeString(endMs),
          }
        : i
    );
    await saveScheduledWorkouts(updated);
    return NextResponse.json({ success: true, item: updated.find((i) => i.id === id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Query-Parameter id fehlt." },
      { status: 400 }
    );
  }

  try {
    const items = await readScheduledWorkouts();
    const item = items.find((i) => i.id === id);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Eintrag nicht gefunden." },
        { status: 404 }
      );
    }
    await deleteEvent(item.calendarId, item.googleEventId);
    await saveScheduledWorkouts(items.filter((i) => i.id !== id));
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
