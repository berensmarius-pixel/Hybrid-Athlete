import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

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

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const { stdout } = await execFileAsync(
      "python",
      [scriptPath, "activity_details", "--activity-id", idParam],
      {
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[api/garmin/activity-details] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Aktivitäts-Details konnten nicht geladen werden. Bitte Garmin-Verbindung in den Einstellungen prüfen.",
      },
      { status: 500 }
    );
  }
}
