import { NextResponse } from "next/server";
import { runGarminJson, garminErrorResponse } from "@/lib/garmin/garminCli";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";

    // Strikte Validierung – der Parameter landet als argv im Kindprozess
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

    const args = ["sync"];
    if (date) args.push("--date", date);

    const parsed = await runGarminJson(args, { timeoutMs: 35_000 });
    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "sync",
      err,
      "Garmin-Sync fehlgeschlagen. Bitte Garmin-Verbindung in den Einstellungen prüfen."
    );
  }
}
