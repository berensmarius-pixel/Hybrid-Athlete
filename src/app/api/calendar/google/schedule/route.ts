import { NextResponse } from "next/server";
import { DEFAULT_WEEKLY_PLAN } from "@/data/weeklyPlan";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { DayPlan } from "@/types";
import {
  GoogleCalendarError,
  deleteEvent,
  getValidAccessToken,
  insertWorkoutEvent,
  queryFreeBusy,
} from "@/lib/server/googleCalendarClient";
import {
  readScheduledWorkouts,
  readSchedulingSettings,
  saveScheduledWorkouts,
} from "@/lib/server/googleCalendarData";
import { planSchedule } from "@/lib/calendar/gcal/engine";
import { buildEventPayload } from "@/lib/calendar/gcal/eventBuilder";
import { zonedDateString, zonedToUtcMs, zonedTimeString } from "@/lib/calendar/gcal/timezone";
import {
  isSchedulableType,
  type ScheduleProposal,
  type ScheduledGoogleWorkout,
} from "@/lib/calendar/gcal/types";

/**
 * POST /api/calendar/google/schedule
 *
 * Intelligentes, regelbasiertes Einplanen der Workouts in freie
 * Google-Kalender-Slots.
 *
 *   mode=preview  → berechnet Platzierungsvorschläge (keine Schreibzugriffe)
 *   mode=apply    → erzeugt Google-Events für die bestätigten Vorschläge und
 *                   speichert die google_event_id-Zuordnung (Zweiweg-Basis)
 */

const PLAN_KEY = "hybrid-athlete-weekly-plan";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDayPlan(raw: unknown): raw is DayPlan {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Partial<DayPlan>;
  return (
    typeof d.dayIndex === "number" &&
    typeof d.title === "string" &&
    typeof d.workoutType === "string"
  );
}

async function loadWeeklyPlan(): Promise<DayPlan[]> {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", PLAN_KEY)
        .maybeSingle();
      const value = data?.value;
      if (Array.isArray(value) && value.length > 0 && value.every(isValidDayPlan)) {
        return value;
      }
    } catch (err) {
      console.error("[api/calendar/google/schedule] plan load failed:", err);
    }
  }
  return DEFAULT_WEEKLY_PLAN;
}

function errorResponse(err: unknown) {
  if (err instanceof GoogleCalendarError) {
    return NextResponse.json(
      { success: false, error: err.message, code: err.code },
      { status: err.status }
    );
  }
  console.error("[api/calendar/google/schedule] failed:", err);
  return NextResponse.json(
    { success: false, error: "Planung fehlgeschlagen." },
    { status: 500 }
  );
}

/** Validiert einen Client-Vorschlag (nach UI-Anpassungen) strikt. */
function parseProposal(raw: unknown): ScheduleProposal | null {
  const p = raw as Partial<ScheduleProposal>;
  if (!p || typeof p !== "object") return null;
  const id = typeof p.id === "string" ? p.id : "";
  const date = typeof p.date === "string" ? p.date : "";
  const startTime = typeof p.startTime === "string" ? p.startTime : "";
  const endTimeRaw = typeof p.endTime === "string" ? p.endTime : "";
  if (
    !id ||
    !DATE_RE.test(date) ||
    !TIME_RE.test(startTime) ||
    !TIME_RE.test(endTimeRaw) ||
    !isSchedulableType(p.workoutType)
  ) {
    return null;
  }
  const startMs = zonedToUtcMs(date, startTime);
  let endMs = zonedToUtcMs(date, endTimeRaw);
  // Ende vor Start → über Mitternacht
  if (endMs <= startMs) endMs += 24 * 60 * 60_000;
  if (endMs - startMs > 16 * 60 * 60_000) return null;
  return {
    id: id.slice(0, 80),
    date,
    startTime,
    endTime: zonedTimeString(endMs),
    workoutType: p.workoutType,
    title: String(p.title ?? "Training").slice(0, 140),
    description: String(p.description ?? "").slice(0, 1200),
    durationMinutes: Math.round((endMs - startMs) / 60_000),
    score: Number.isFinite(p.score) ? Number(p.score) : 0,
    reason: String(p.reason ?? "").slice(0, 300),
  };
}

async function handlePreview(body: Record<string, unknown>) {
  await getValidAccessToken(); // wirft not_connected früh & klar
  const settings = await readSchedulingSettings();
  const days =
    typeof body.days === "number"
      ? Math.min(14, Math.max(7, Math.round(body.days)))
      : settings.planningDays;
  const [weeklyPlan, busy, existingScheduled] = await Promise.all([
    loadWeeklyPlan(),
    queryFreeBusy(settings.calendarId, Date.now(), Date.now() + days * 24 * 60 * 60_000),
    readScheduledWorkouts(),
  ]);

  const result = planSchedule({
    fromMs: Date.now(),
    days,
    weeklyPlan,
    busy,
    settings,
    existingScheduled,
  });
  return NextResponse.json({ success: true, mode: "preview", ...result });
}

async function handleApply(body: Record<string, unknown>) {
  const rawProposals = Array.isArray(body.proposals) ? body.proposals : [];
  if (rawProposals.length === 0) {
    return NextResponse.json(
      { success: false, error: "Keine Vorschläge zum Übernehmen übergeben." },
      { status: 400 }
    );
  }
  if (rawProposals.length > 40) {
    return NextResponse.json(
      { success: false, error: "Maximal 40 Events pro Lauf." },
      { status: 400 }
    );
  }
  const proposals = rawProposals.map(parseProposal);
  if (proposals.some((p) => p === null)) {
    return NextResponse.json(
      { success: false, error: "Ein oder mehrere Vorschläge sind ungültig." },
      { status: 400 }
    );
  }

  const settings = await readSchedulingSettings();
  const calendarId = settings.calendarId || "primary";

  // Bestehende Auto-Einträge im Horizont optional ersetzen (Re-Plan)
  const replaceExisting = body.replaceExisting !== false;
  const existing = await readScheduledWorkouts();
  const todayStr = zonedDateString(Date.now());
  const stale = replaceExisting ? existing.filter((i) => i.date >= todayStr) : [];
  for (const item of stale) {
    try {
      await deleteEvent(item.calendarId, item.googleEventId);
    } catch (err) {
      console.warn(`[apply] stale event ${item.googleEventId} konnte nicht gelöscht werden:`, err);
    }
  }
  const keep = existing.filter((i) => !stale.includes(i));

  const created: ScheduledGoogleWorkout[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const proposal of proposals as ScheduleProposal[]) {
    try {
      const startIso = new Date(zonedToUtcMs(proposal.date, proposal.startTime)).toISOString();
      const endIso = new Date(zonedToUtcMs(proposal.date, proposal.endTime)).toISOString();
      const payload = buildEventPayload({
        workoutType: proposal.workoutType,
        title: proposal.title,
        description: proposal.description,
        scheduleId: proposal.id,
        durationMinutes: proposal.durationMinutes,
        startIso,
        endIso,
      });
      const inserted = await insertWorkoutEvent(calendarId, payload);
      created.push({
        id: proposal.id,
        googleEventId: inserted.id,
        calendarId,
        workoutType: proposal.workoutType,
        title: payload.summary,
        description: proposal.description,
        date: proposal.date,
        startTime: proposal.startTime,
        endTime: proposal.endTime,
        sourceDayIndex: (new Date(`${proposal.date}T12:00:00Z`).getUTCDay() + 6) % 7,
        htmlLink: inserted.htmlLink,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[apply] event ${proposal.id} failed:`, err);
      failed.push({
        id: proposal.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }

  await saveScheduledWorkouts([...keep, ...created]);

  return NextResponse.json({
    success: failed.length < proposals.length || created.length > 0,
    created,
    failed,
    replaced: stale.length,
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  try {
    if (body.mode === "apply") return await handleApply(body);
    return await handlePreview(body);
  } catch (err) {
    return errorResponse(err);
  }
}
