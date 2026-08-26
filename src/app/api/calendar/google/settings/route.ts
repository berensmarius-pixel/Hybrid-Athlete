import { NextResponse } from "next/server";
import {
  readSchedulingSettings,
  saveSchedulingSettings,
} from "@/lib/server/googleCalendarData";
import { normalizeSchedulingSettings } from "@/lib/calendar/gcal/types";

/**
 * GET  /api/calendar/google/settings → aktuelle Planungs-Regeln (mit Defaults)
 * PUT  /api/calendar/google/settings → Teil-Update der Regeln
 *
 * Body (PUT): Partial<SchedulingSettings> – wird serverseitig normalisiert.
 */
export async function GET() {
  const settings = await readSchedulingSettings();
  return NextResponse.json({ success: true, settings });
}

export async function PUT(req: Request) {
  let patch: unknown;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  if (!patch || typeof patch !== "object") {
    return NextResponse.json(
      { success: false, error: "Ungültiges Settings-Objekt." },
      { status: 400 }
    );
  }

  const current = await readSchedulingSettings();
  const next = normalizeSchedulingSettings({ ...current, ...(patch as object) });
  const ok = await saveSchedulingSettings(next);
  return NextResponse.json({ success: ok, settings: next }, { status: ok ? 200 : 500 });
}
