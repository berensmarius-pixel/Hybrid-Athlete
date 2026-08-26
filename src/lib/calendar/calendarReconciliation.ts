// ─── Calendar Reconciliation (Google Calendar Event-Update) ──────────────────
//
// Hängt die tatsächlichen Leistungskennzahlen einer Aktivität an den
// passenden Kalender-Termin:
//   1. Google Calendar API – passender Auto-Eintrag aus der Zweiwege-
//      Synchronisation (hybrid_athlete_google_schedule_map, Datum + Typ).
//   2. Fallback: lokaler Kalender-Mirror (app_state), damit die In-App-
//      Kalenderansicht das Ergebnis trotzdem zeigt.

import type { PowerMetrics } from "@/lib/training/powerMetrics";
import { getValidAccessToken } from "@/lib/server/googleCalendarClient";
import { readScheduledWorkouts } from "@/lib/server/googleCalendarData";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const MIRROR_KEY = "hybrid_athlete_google_calendar_events";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface ReconciliationResult {
  mode: "google" | "mirror";
  matchedEvents: number;
  error?: string;
}

const TYPE_KEYWORDS: Record<string, string[]> = {
  cycling: ["rad", "ride", "bike", "cycling", "rennrad", "gravel", "mtb", "ausfahrt"],
  running: ["lauf", "run", "running", "jogging", "tempo", "dlm"],
  gym: ["gym", "kraft", "strength", "training"],
  other: [],
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function buildMetricsAppendix(
  metrics: PowerMetrics,
  durationSeconds: number,
  debriefMarkdown: string
): string {
  const peaks = metrics.peakPowers
    .map((p) =>
      `${p.durationSeconds >= 60 ? `${p.durationSeconds / 60}min` : `${p.durationSeconds}s`}: ${p.watts ?? "–"}W`
    )
    .join(" · ");
  const zones = metrics.zones
    .filter((z) => z.minutes > 0)
    .map((z) => `${z.name}: ${z.minutes}′`)
    .join(" · ");

  return [
    `─── Ergebnis (Hybrid Athlete Pipeline) ───`,
    `Dauer: ${formatDuration(durationSeconds)} · Ø ${metrics.avgPowerWatts ?? "–"} W · NP ${metrics.normalizedPower ?? "–"} W · IF ${metrics.intensityFactor ?? "–"} · TSS ${metrics.trainingStressScore ?? "–"}`,
    peaks ? `Peaks: ${peaks}` : "",
    zones ? `Zonen: ${zones}` : "",
    ``,
    debriefMarkdown,
  ]
    .filter(Boolean)
    .join("\n");
}

function matchesType(title: string, workoutType: string): boolean {
  if (!workoutType || workoutType === "other") return true;
  const haystack = title.toLowerCase();
  const keywords = TYPE_KEYWORDS[workoutType] ?? [];
  return keywords.some((k) => haystack.includes(k));
}

interface GoogleEventDetails {
  id?: string;
  summary?: string;
  description?: string;
}

async function fetchEventDescription(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<string | null> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const details = (await res.json()) as GoogleEventDetails;
  return details.description ?? "";
}

// ─── Lokaler Mirror-Fallback ──────────────────────────────────────────────────

interface MirrorEvent {
  id?: unknown;
  title?: unknown;
  date?: unknown;
  category?: unknown;
  description?: unknown;
}

function mirrorMatches(ev: MirrorEvent, dateISO: string, activityName: string, activityType: string): boolean {
  if (ev.date !== dateISO) return false;
  if (ev.category !== "workout") return false;
  const title = typeof ev.title === "string" ? ev.title : "";
  const desc = typeof ev.description === "string" ? ev.description : "";
  const name = activityName.toLowerCase();
  if (name.length > 3 && (`${title} ${desc}`.toLowerCase().includes(name.slice(0, 8)))) return true;
  return matchesType(`${title} ${desc}`, activityType);
}

async function patchMirrorEvents(
  dateISO: string,
  activityName: string,
  activityType: string,
  appendix: string
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data } = await getSupabaseAdmin()
    .from("app_state")
    .select("value")
    .eq("key", MIRROR_KEY)
    .maybeSingle();

  const stored = data?.value;
  if (!Array.isArray(stored)) return 0;
  const events = [...(stored as MirrorEvent[])];

  let matched = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!mirrorMatches(ev, dateISO, activityName, activityType)) continue;
    const currentDesc = typeof ev.description === "string" ? ev.description : "";
    if (currentDesc.includes("Ergebnis (Hybrid Athlete Pipeline)")) continue;
    events[i] = { ...ev, description: `${currentDesc}\n\n${appendix}` };
    matched++;
  }

  if (matched > 0) {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .upsert({ key: MIRROR_KEY, value: events }, { onConflict: "key" });
    if (error) throw new Error(`Mirror-Update fehlgeschlagen: ${error.message}`);
  }
  return matched;
}

/**
 * Aktualisiert den passenden Kalender-Eintrag mit den Ist-Leistungswerten:
 * bevorzugt der automatisch geplante Google-Calendar-Termin desselben Datums,
 * sonst der lokale Kalender-Mirror der App.
 */
export async function reconcileCalendarEvent(input: {
  dateISO: string;
  activityName: string;
  activityType?: string;
  metrics: PowerMetrics;
  durationSeconds: number;
  debriefMarkdown: string;
}): Promise<ReconciliationResult> {
  const appendix = buildMetricsAppendix(
    input.metrics,
    input.durationSeconds,
    input.debriefMarkdown
  );
  const activityType = input.activityType ?? "other";

  // 1) Google Calendar: Auto-scheduling-Mapping nach Datum matchen
  try {
    const scheduled = await readScheduledWorkouts();
    const candidates = scheduled.filter(
      (w) =>
        w.date === input.dateISO &&
        matchesType(`${w.title} ${w.description}`, activityType)
    );

    if (candidates.length > 0) {
      const accessToken = await getValidAccessToken();
      let patched = 0;
      for (const candidate of candidates.slice(0, 5)) {
        try {
          const description = await fetchEventDescription(
            accessToken,
            candidate.calendarId,
            candidate.googleEventId
          );
          if (description === null) continue;
          if (description.includes("Ergebnis (Hybrid Athlete Pipeline)")) continue;

          const url = `${CALENDAR_API}/calendars/${encodeURIComponent(candidate.calendarId)}/events/${encodeURIComponent(candidate.googleEventId)}`;
          const res = await fetch(url, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              description: `${description}\n\n${appendix}`,
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) patched++;
        } catch (err) {
          console.error(
            `[calendar-reconcile] PATCH fehlgeschlagen (${candidate.googleEventId}):`,
            err
          );
        }
      }
      if (patched > 0) return { mode: "google", matchedEvents: patched };
    }
  } catch (err) {
    console.error("[calendar-reconcile] Google-Pfad fehlgeschlagen:", err);
  }

  // 2) Fallback: lokaler Mirror
  try {
    const matched = await patchMirrorEvents(
      input.dateISO,
      input.activityName,
      activityType,
      appendix
    );
    return { mode: "mirror", matchedEvents: matched };
  } catch (err) {
    return {
      mode: "mirror",
      matchedEvents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
