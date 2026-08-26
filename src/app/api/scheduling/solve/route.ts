import { NextRequest, NextResponse } from "next/server";
import { solveSchedule } from "@/lib/scheduling/solver";
import { normalizeBlueprints } from "@/lib/scheduling/contentGenerator";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body muss ein Objekt sein." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const sessions = normalizeBlueprints(payload.sessions);

  if (sessions.length === 0) {
    return NextResponse.json(
      { error: "Keine gültigen Trainingseinheiten (sessions) übergeben." },
      { status: 400 }
    );
  }

  const result = solveSchedule({
    sessions,
    busy_events: payload.busy_events,
    preferences: payload.preferences,
    week_start_date:
      typeof payload.week_start_date === "string" ? payload.week_start_date : undefined,
  });

  return NextResponse.json(result);
}
