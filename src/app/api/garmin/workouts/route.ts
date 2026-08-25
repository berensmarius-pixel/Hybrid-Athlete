import { NextResponse } from "next/server";
import {
  runGarminJson,
  garminErrorResponse,
  listWorkoutsCached,
  invalidateListWorkoutsCache,
} from "@/lib/garmin/garminCli";

export async function GET() {
  try {
    const parsed = await listWorkoutsCached();
    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "workouts GET",
      err,
      "Garmin Workouts konnten nicht geladen werden. Bitte Garmin-Verbindung prüfen."
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

    // Strikte Validierung – der Wert landet als argv im Kindprozess
    if (!workoutId || !/^[A-Za-z0-9_-]{1,64}$/.test(String(workoutId))) {
      return NextResponse.json(
        { success: false, error: "Keine gültige Workout-ID angegeben" },
        { status: 400 }
      );
    }

    const parsed = await runGarminJson(
      ["delete_workout", "--workout-id", String(workoutId)],
      { timeoutMs: 25_000 }
    );

    if (parsed.success) invalidateListWorkoutsCache();

    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "workouts DELETE",
      err,
      "Workout konnte nicht gelöscht werden. Bitte Garmin-Verbindung prüfen."
    );
  }
}
