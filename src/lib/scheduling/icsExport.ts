import type { ScheduledWorkout } from "./types";

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(dateIso: string, timeHhMm: string): string {
  const compactDate = dateIso.replace(/-/g, "");
  const compactTime = `${timeHhMm.replace(":", "")}00`;
  return `TZID=Europe/Berlin:${compactDate}T${compactTime}`;
}

export function buildWeeklyIcs(
  placements: ScheduledWorkout[],
  weekStartIso: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hybrid Athlete//Constraint Scheduler//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hybrid Athlete Solved Week",
    "X-WR-TIMEZONE:Europe/Berlin",
  ];

  for (const p of placements) {
    const why = p.explanations.join(" | ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:sched_${p.date}_${p.session_id}@hybridathlete.app`,
      `DTSTAMP:${weekStartIso.replace(/-/g, "")}T000000Z`,
      `DTSTART;${icsDate(p.date, p.start_time)}`,
      `DTEND;${icsDate(p.date, p.end_time)}`,
      `SUMMARY:${escapeIcsText(p.title)}`,
      `DESCRIPTION:${escapeIcsText(
        `Kategorie: ${p.category}\nDauer: ${p.duration_min} Min\nPlatzierung: ${why}`
      )}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
