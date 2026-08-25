import { NextResponse } from "next/server";
import {
  runGarminJson,
  garminErrorResponse,
  invalidateListWorkoutsCache,
  wasRecentlyScheduled,
  markScheduled,
  isValidWorkoutPayload,
} from "@/lib/garmin/garminCli";

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

    // Schema-Check bevor der Payload an das Python-Skript geht
    if (!isValidWorkoutPayload(workout)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ungültiges Workout-Format (name, type [gym|strength|running|cycling], optionale exercises erwartet).",
        },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) {
      return NextResponse.json(
        { success: false, error: "Ungültiges Datum (YYYY-MM-DD erwartet)." },
        { status: 400 }
      );
    }

    // Duplikat-Schutz: gleiches Workout + Datum innerhalb kurzer Zeit
    // (Doppelklick / doppelter Wochen-Sync) nicht erneut hochladen.
    if (wasRecentlyScheduled(String(date), workout.name)) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        workoutName: workout.name,
        date,
        message: `Workout '${workout.name}' wurde für ${date} bereits kürzlich geplant – übersprungen.`,
      });
    }

    const workoutJsonStr =
      typeof workout === "string" ? workout : JSON.stringify(workout);

    if (workoutJsonStr.length > MAX_WORKOUT_JSON_LENGTH) {
      return NextResponse.json(
        { success: false, error: "Workout-Daten zu groß." },
        { status: 413 }
      );
    }

    // JSON per stdin statt argv – Windows CreateProcess-Limit (~32.767
    // Zeichen) würde große Workouts sonst mit kryptischem Fehler killen.
    // "-" signalisiert dem Skript: von stdin lesen.
    const parsed = await runGarminJson(
      ["schedule_workout", "--date", String(date), "--workout-json", "-"],
      { timeoutMs: 35_000, stdin: workoutJsonStr }
    );

    if (parsed.success) {
      markScheduled(String(date), String(workout.name));
      invalidateListWorkoutsCache();
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "schedule",
      err,
      "Workout konnte nicht im Garmin-Kalender geplant werden. Bitte Garmin-Verbindung prüfen."
    );
  }
}
