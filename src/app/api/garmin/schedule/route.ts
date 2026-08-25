import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workout, date, email, password } = body;

    if (!workout) {
      return NextResponse.json(
        { success: false, error: "Keine Workout-Daten übergeben." },
        { status: 400 }
      );
    }

    const targetDate = date || new Date().toISOString().split("T")[0];
    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");

    const workoutJsonStr = typeof workout === "string" ? workout : JSON.stringify(workout);

    const args = [
      scriptPath,
      "schedule_workout",
      "--date",
      targetDate,
      "--workout-json",
      workoutJsonStr,
    ];

    if (email && password) {
      args.push("--email", email, "--password", password);
    }

    const { stdout } = await execFileAsync("python", args, {
      timeout: 35000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Fehler beim Planen des Garmin Workouts.",
      },
      { status: 500 }
    );
  }
}
