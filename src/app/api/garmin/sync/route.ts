import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || "";

    // Strikte Validierung – der Parameter landet als argv im Kindprozess
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const args = [scriptPath, "sync"];
    if (date) args.push("--date", date);

    const { stdout } = await execFileAsync("python", args, {
      timeout: 35000,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[api/garmin/sync] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Garmin-Sync fehlgeschlagen. Bitte Garmin-Verbindung in den Einstellungen prüfen.",
      },
      { status: 500 }
    );
  }
}
