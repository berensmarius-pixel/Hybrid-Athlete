// ─── Conflict & Free-Slot Detection Engine ───────────────────────────────────

import { CalendarEvent } from "./googleCalendarService";
import { DayPlan } from "@/types";

export interface FreeTimeSlot {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  quality: "optimal" | "good" | "tight";
  recommendationNote: string;
}

export interface TrainingCalendarConflict {
  hasConflict: boolean;
  conflictingEvent?: CalendarEvent;
  plannedWorkoutTime: string; // e.g. "17:30"
  workoutDurationMinutes: number;
  suggestedFreeSlots: FreeTimeSlot[];
  resolutionSummary: string;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function detectTrainingConflicts(
  events: CalendarEvent[],
  todayPlan: DayPlan | undefined,
  targetDate: string,
  preferredWorkoutTime = "17:00",
  workoutDurationMinutes = 60
): TrainingCalendarConflict {
  const dayEvents = events
    .filter((e) => e.date === targetDate)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const workoutStartMins = timeToMinutes(preferredWorkoutTime);
  const workoutEndMins = workoutStartMins + workoutDurationMinutes;

  // Check for direct overlap
  const conflictingEvent = dayEvents.find((e) => {
    const evStart = timeToMinutes(e.startTime);
    const evEnd = timeToMinutes(e.endTime);
    return workoutStartMins < evEnd && workoutEndMins > evStart;
  });

  // Calculate free slots between 06:30 and 22:00
  const dayStart = 6 * 60 + 30; // 06:30
  const dayEnd = 22 * 60; // 22:00

  const freeSlots: FreeTimeSlot[] = [];
  let currentPointer = dayStart;

  for (const ev of dayEvents) {
    const evStart = timeToMinutes(ev.startTime);
    const evEnd = timeToMinutes(ev.endTime);

    if (evStart > currentPointer) {
      const freeDur = evStart - currentPointer;
      if (freeDur >= workoutDurationMinutes) {
        freeSlots.push({
          startTime: minutesToTime(currentPointer),
          endTime: minutesToTime(evStart),
          durationMinutes: freeDur,
          quality: freeDur >= workoutDurationMinutes + 30 ? "optimal" : "good",
          recommendationNote:
            currentPointer < 10 * 60
              ? "Morgens vor den Terminen (bester Fokus & Hormonstatus)"
              : currentPointer < 14 * 60
              ? "Mittagspause / Lunch-Workout"
              : "Abends nach Feierabend",
        });
      }
    }
    currentPointer = Math.max(currentPointer, evEnd);
  }

  if (dayEnd > currentPointer) {
    const freeDur = dayEnd - currentPointer;
    if (freeDur >= workoutDurationMinutes) {
      freeSlots.push({
        startTime: minutesToTime(currentPointer),
        endTime: minutesToTime(dayEnd),
        durationMinutes: freeDur,
        quality: "optimal",
        recommendationNote: "Abend-Fenster nach allen beruflichen Terminen",
      });
    }
  }

  if (conflictingEvent) {
    return {
      hasConflict: true,
      conflictingEvent,
      plannedWorkoutTime: preferredWorkoutTime,
      workoutDurationMinutes,
      suggestedFreeSlots: freeSlots,
      resolutionSummary: `Kollision mit "${conflictingEvent.title}" (${conflictingEvent.startTime}–${conflictingEvent.endTime}). Wir haben ${freeSlots.length} freie Trainingsfenster für dich gefunden!`,
    };
  }

  return {
    hasConflict: false,
    plannedWorkoutTime: preferredWorkoutTime,
    workoutDurationMinutes,
    suggestedFreeSlots: freeSlots,
    resolutionSummary: `Dein Zeitfenster um ${preferredWorkoutTime} Uhr ist frei von Terminen!`,
  };
}
