import { NextResponse } from "next/server";
import {
  runGarminJson,
  garminErrorResponse,
  invalidateListWorkoutsCache,
  invalidateScheduledWorkoutsCache,
  listScheduledWorkouts,
  wasRecentlyScheduled,
  markScheduled,
  isValidWorkoutPayload,
} from "@/lib/garmin/garminCli";

const MAX_WORKOUT_JSON_LENGTH = 100_000;

/**
 * GET /api/garmin/schedule
 * Liefert die Workouts, die aktuell im Garmin-KALENDER geplant sind
 * (aktueller + Folgemonat, mit Datum). Basis für Duplikat-/Überschneidungs-
 * erkenntnis und die Bereinigung falscher Einträge.
 */
export async function GET() {
  try {
    const data = await listScheduledWorkouts();
    return NextResponse.json(data);
  } catch (err) {
    return garminErrorResponse(
      "schedule GET",
      err,
      "Geplante Garmin-Workouts konnten nicht geladen werden. Bitte Garmin-Verbindung prüfen."
    );
  }
}

/** Normalisierter Name für den Duplikat-Vergleich. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workout, date } = body;
    const force = body.force === true;

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

    // Duplikat-Schutz Stufe 1: gleiches Workout + Datum innerhalb kurzer Zeit
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

    // Duplikat-Schutz Stufe 2: echten Garmin-Kalender abfragen – existiert an
    // diesem Datum bereits ein Workout mit demselben (normalisierten) Namen,
    // wird nicht doppelt geplant. Mit body.force bewusst überschreibbar.
    if (!force) {
      try {
        const scheduled = await listScheduledWorkouts();
        if (scheduled.success && scheduled.workouts?.some(
          (s) => s.date === String(date) && normalizeName(s.name) === normalizeName(workout.name)
        )) {
          return NextResponse.json({
            success: true,
            duplicate: true,
            duplicateOfCalendar: true,
            workoutName: workout.name,
            date,
            message: `Workout '${workout.name}' liegt bereits am ${date} im Garmin-Kalender – kein Doppel-Eintrag erstellt.`,
          });
        }
      } catch {
        // Kalender nicht erreichbar → Planung normal fortsetzen
      }
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
      invalidateScheduledWorkoutsCache();
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

/**
 * DELETE /api/garmin/schedule?id=<scheduledWorkoutId>
 * Entfernt einen Termin aus dem Garmin-Kalender (unschedule).
 * Das Workout bleibt in der Bibliothek – endgültig löschen geht über
 * DELETE /api/garmin/workouts?id=...
 */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    let scheduleId = url.searchParams.get("id");
    if (!scheduleId) {
      const body = await req.json().catch(() => ({}));
      scheduleId = body.scheduledWorkoutId || body.scheduleId || body.id;
    }

    if (!scheduleId || !/^\d{1,15}$/.test(String(scheduleId))) {
      return NextResponse.json(
        { success: false, error: "Keine gültige scheduledWorkoutId angegeben." },
        { status: 400 }
      );
    }

    const parsed = await runGarminJson(
      ["unschedule_workout", "--schedule-id", String(scheduleId)],
      { timeoutMs: 25_000 }
    );

    if (parsed.success) invalidateScheduledWorkoutsCache();

    return NextResponse.json(parsed);
  } catch (err) {
    return garminErrorResponse(
      "schedule DELETE",
      err,
      "Termin konnte nicht aus dem Garmin-Kalender entfernt werden. Bitte Garmin-Verbindung prüfen."
    );
  }
}
