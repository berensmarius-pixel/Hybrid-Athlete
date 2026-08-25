import { NextResponse } from "next/server";
import { runGarminJson, garminErrorResponse } from "@/lib/garmin/garminCli";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id") || "";

    // Strikte Validierung – die ID landet als argv im Kindprozess
    if (!/^\d{1,20}$/.test(idParam)) {
      return NextResponse.json(
        { success: false, error: "Keine gültige Garmin Activity-ID angegeben" },
        { status: 400 }
      );
    }

    const parsed = await runGarminJson(
      ["activity_details", "--activity-id", idParam],
      { timeoutMs: 60_000 }
    );
    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "activity-details",
      err,
      "Aktivitäts-Details konnten nicht geladen werden. Bitte Garmin-Verbindung in den Einstellungen prüfen."
    );
  }
}
