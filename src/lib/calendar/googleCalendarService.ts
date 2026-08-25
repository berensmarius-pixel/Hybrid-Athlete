import { getLocalDateString } from "@/lib/utils";
import { readStoredJson, writeState } from "@/lib/persistence/stateStore";
// ─── Google Calendar Service ──────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  category: "work" | "meeting" | "study" | "personal" | "workout";
  location?: string;
  description?: string;
  source: "google" | "local";
}

const STORAGE_KEY = "hybrid_athlete_google_calendar_events";
const ICAL_URL_KEY = "hybrid_athlete_google_ical_url";

export function getStoredCalendarEvents(): CalendarEvent[] {
  if (typeof window === "undefined") return [];
  const parsed = readStoredJson<CalendarEvent[] | null>(STORAGE_KEY, null);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveCalendarEvents(events: CalendarEvent[]): void {
  if (typeof window === "undefined") return;
  writeState(STORAGE_KEY, events);
}

export function getSavedIcalUrl(): string {
  if (typeof window === "undefined") return "";
  // Neu: JSON-String via stateStore. Legacy: Plain-String direkt lesen.
  const parsed = readStoredJson<string | null>(ICAL_URL_KEY, null);
  if (parsed) return parsed;
  try {
    return window.localStorage.getItem(ICAL_URL_KEY) || "";
  } catch {
    return "";
  }
}

export function saveIcalUrl(url: string): void {
  if (typeof window === "undefined") return;
  writeState(ICAL_URL_KEY, url.trim());
}

/**
 * Basic ICS string parser to extract event dates, titles, and times
 */
export function parseIcsContent(icsData: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsData.split(/\r\n|\n|\r/);
  let currentEvent: Partial<CalendarEvent> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      currentEvent = { id: `gcal_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, source: "google", category: "work" };
    } else if (line.startsWith("END:VEVENT") && currentEvent) {
      if (currentEvent.title && currentEvent.date) {
        events.push({
          id: currentEvent.id || `gcal_${Date.now()}`,
          title: currentEvent.title || "Termin",
          date: currentEvent.date,
          startTime: currentEvent.startTime || "09:00",
          endTime: currentEvent.endTime || "10:00",
          category: currentEvent.category || "work",
          location: currentEvent.location,
          source: "google",
        });
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith("SUMMARY:")) {
        currentEvent.title = line.substring(8).trim();
      } else if (line.startsWith("LOCATION:")) {
        currentEvent.location = line.substring(9).trim();
      } else if (line.startsWith("DTSTART")) {
        const val = line.split(":")[1];
        if (val && val.length >= 8) {
          const y = val.substr(0, 4);
          const m = val.substr(4, 2);
          const d = val.substr(6, 2);
          currentEvent.date = `${y}-${m}-${d}`;
          if (val.includes("T") && val.length >= 13) {
            const timePart = val.split("T")[1];
            currentEvent.startTime = `${timePart.substr(0, 2)}:${timePart.substr(2, 2)}`;
          } else {
            currentEvent.startTime = "09:00";
          }
        }
      } else if (line.startsWith("DTEND")) {
        const val = line.split(":")[1];
        if (val && val.includes("T") && val.length >= 13) {
          const timePart = val.split("T")[1];
          currentEvent.endTime = `${timePart.substr(0, 2)}:${timePart.substr(2, 2)}`;
        }
      }
    }
  }

  return events;
}
