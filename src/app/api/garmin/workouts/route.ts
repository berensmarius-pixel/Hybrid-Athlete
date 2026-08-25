import { NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const { stdout } = await execFileAsync("python", [scriptPath, "list_workouts"], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Fehler beim Laden der Garmin Workouts" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let workoutId = url.searchParams.get("id");

    if (!workoutId) {
      const body = await req.json().catch(() => ({}));
      workoutId = body.workoutId || body.id;
    }

    if (!workoutId) {
      return NextResponse.json(
        { success: false, error: "Keine Workout-ID zum Löschen angegeben" },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "garmin_sync.py");
    const { stdout } = await execFileAsync("python", [scriptPath, "delete_workout", "--workout-id", String(workoutId)], {
      timeout: 25000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const parsed = JSON.parse(stdout.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Fehler beim Löschen des Garmin Workouts" },
      { status: 500 }
    );
  }
}
