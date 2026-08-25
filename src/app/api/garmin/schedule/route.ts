import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

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

    // JSON per stdin statt argv – Windows CreateProcess-Limit (~32.767
    // Zeichen) würde große Workouts sonst mit kryptischem Fehler killen.
    // "-" signalisiert dem Skript: von stdin lesen.
    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(
          "python",
          [
            scriptPath,
            "schedule_workout",
            "--date",
            String(date),
            "--workout-json",
            "-",
          ],
          { stdio: ["pipe", "pipe", "pipe"] }
        );

        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("timeout"));
        }, 35000);

        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", () => {
          clearTimeout(timer);
          resolve({ stdout, stderr });
        });

        child.stdin.end(workoutJsonStr, "utf8");
      }
    );

    const parsed = JSON.parse(result.stdout.trim());
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
