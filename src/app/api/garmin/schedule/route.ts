import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

const MAX_WORKOUT_JSON_LENGTH = 100_000;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workout, date } = body;

    if (!workout) {
      return NextResponse.json(
        { success: false, error: "Keine Workout-Daten übergeben." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Datum (YYYY-MM-DD erwartet)." },
        { status: 400 }
      );
    }

    const workoutJsonStr =
      typeof workout === "string" ? workout : JSON.stringify(workout);

    if (workoutJsonStr.length > MAX_WORKOUT_JSON_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Workout-Daten zu groß." },
        { status: 413 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");

    const args = [
      scriptPath,
      "schedule_workout",
      "--date",
      String(date),
      "--workout-json",
      workoutJsonStr,
    ];

    const { stdout } = await execFileAsync("python", args, {
      timeout: 35000,
      maxBuffer: 2 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[api/garmin/schedule] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error:
          "Workout konnte nicht im Garmin-Kalender geplant werden. Bitte Garmin-Verbindung prüfen.",
      },
      { status: 500 }
    );
  }
}
