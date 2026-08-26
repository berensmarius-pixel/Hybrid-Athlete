/**
 * Zeit-Helfer für die Google-Calendar-Planung.
 *
 * Die App lebt in Europe/Berlin (siehe ICS-Feed). Sämtliche Planungs-
 * Mathematik arbeitet auf Epoch-ms; Wand-Zeiten ("HH:mm" / "YYYY-MM-DD")
 * werden deterministisch über die echte TZ-Datenbank-Offset via
 * Intl.DateTimeFormat aufgelöst – DSGVO-tauglich auch bei DST-Wechseln
 * und unabhängig von der Server-Zeitzone.
 */

export const CALENDAR_TIME_ZONE = "Europe/Berlin";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(ms: number, timeZone: string): Parts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(ms)) parts[p.type] = p.value;
  // Mitternachts-Kantfall: Intl liefert "24" statt "00"
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

function offsetMs(timeZone: string, ms: number): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Interpretiert Datum+Uhrzeit als Wand-Zeit in der Ziel-Zeitzone → Epoch-ms. */
export function zonedToUtcMs(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let result = guess - offsetMs(CALENDAR_TIME_ZONE, guess);
  // Zweiter Durchgang fängt DST-Kanten ab (nicht-existente/gedoppelte Zeiten)
  result = guess - offsetMs(CALENDAR_TIME_ZONE, result);
  return result;
}

/** YYYY-MM-DD in der Kalender-Zeitzone. */
export function zonedDateString(ms: number): string {
  const p = zonedParts(ms, CALENDAR_TIME_ZONE);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** HH:mm in der Kalender-Zeitzone. */
export function zonedTimeString(ms: number): string {
  const p = zonedParts(ms, CALENDAR_TIME_ZONE);
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Wochentag im deutschen Schema: 0 = Montag … 6 = Sonntag. */
export function berlinWeekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0);
  return (new Date(utcNoon).getUTCDay() + 6) % 7;
}

/** Liste der nächsten `days` Kalendertage (inkl. heute) als YYYY-MM-DD. */
export function upcomingBerlinDates(fromMs: number, days: number): string[] {
  const dates: string[] = [];
  const first = zonedDateString(fromMs);
  for (let i = 0; i < days; i++) {
    const [y, m, d] = first.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d + i, 12, 0);
    dates.push(zonedDateString(ms));
  }
  return dates;
}

/** HH:mm + Minuten → HH:mm (Wrap um Mitternacht wird geklemmt). */
export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = Math.max(0, Math.min(24 * 60 - 1, h * 60 + m + minutes));
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Differenz zweier HH:mm-Werte in Minuten. */
export function timeDiffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}
