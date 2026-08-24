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

export const DEFAULT_MOCK_EVENTS: CalendarEvent[] = [
  {
    id: "gcal_1",
    title: "Projekt-Sync & Team Meeting",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:30",
    endTime: "11:00",
    category: "work",
    location: "Google Meet",
    source: "google",
  },
  {
    id: "gcal_2",
    title: "Vorlesung / Fokuszeit",
    date: new Date().toISOString().split("T")[0],
    startTime: "13:30",
    endTime: "16:00",
    category: "study",
    location: "Campus / Büro",
    source: "google",
  },
  {
    id: "gcal_3",
    title: "Wöchentlicher Call / Abstimmung",
    date: new Date().toISOString().split("T")[0],
    startTime: "17:00",
    endTime: "18:00",
    category: "meeting",
    location: "Telefon",
    source: "google",
  },
];

export function getStoredCalendarEvents(): CalendarEvent[] {
  if (typeof window === "undefined") return DEFAULT_MOCK_EVENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_MOCK_EVENTS));
      return DEFAULT_MOCK_EVENTS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_MOCK_EVENTS;
  }
}

export function saveCalendarEvents(events: CalendarEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function getSavedIcalUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ICAL_URL_KEY) || "";
}

export function saveIcalUrl(url: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ICAL_URL_KEY, url.trim());
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
