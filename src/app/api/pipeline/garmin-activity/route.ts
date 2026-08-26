// ─── Pipeline-Trigger: Garmin-Aktivität → Inngest Event ─────────────────────
//
// POST /api/pipeline/garmin-activity
// Body: { garminId: string, name?, type?, startTime?, durationSeconds?,
//         distanceMeters?, ftpWatts? }
//
// Nimmt Aktivitäts-Metadaten entgegen (Automation, manueller Trigger oder
// Garmin-Push-Fan-out) und startet die durable Inngest-Pipeline
// `process-garmin-activity`. Antwort sofort mit 202 – Download, Binär-
// FIT-Decoding, TSS/PDC-Berechnung und Debrief laufen im Hintergrund.

import { NextRequest, NextResponse } from "next/server";
import {
  GARMIN_ACTIVITY_RECEIVED,
  inngest,
  isGarminActivityEventData,
} from "@/lib/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["running", "cycling", "gym", "other"] as const;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  if (!isGarminActivityEventData(body)) {
    return NextResponse.json(
      {
        success: false,
        error: "garminId (numerischer String, min. 4 Stellen) ist erforderlich.",
      },
      { status: 422 }
    );
  }

  const data = { ...body };
  if (data.type && !(VALID_TYPES as readonly string[]).includes(data.type)) {
    data.type = "other";
  }

  try {
    const ids = await inngest.send({
      // Idempotenz-Key: derselbe Garmin-Import wird nicht doppelt verarbeitet
      id: `garmin-activity-${data.garminId}`,
      name: GARMIN_ACTIVITY_RECEIVED,
      data,
    });

    return NextResponse.json(
      {
        success: true,
        queued: true,
        eventId: ids.ids[0] ?? null,
        functionId: "process-garmin-activity",
      },
      { status: 202 }
    );
  } catch (err) {
    console.error("[api/pipeline/garmin-activity POST] inngest.send failed:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Event konnte nicht an die Pipeline übergeben werden (Inngest nicht erreichbar?).",
      },
      { status: 502 }
    );
  }
}
