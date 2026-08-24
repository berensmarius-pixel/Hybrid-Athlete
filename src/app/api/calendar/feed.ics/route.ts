import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WEEKLY_PLAN } from "@/data/weeklyPlan";

/**
 * RFC 5545 iCalendar Feed Endpoint
 * Allows 1-Click Subscription in Google Calendar, Apple Calendar, or Outlook.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  // Generate events for the next 4 weeks based on the weekly schedule
  let icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hybrid Athlete//Training Schedule//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hybrid Athlete Training",
    "X-WR-TIMEZONE:Europe/Berlin",
    "X-WR-CALDESC:Dein adaptiver Trainingsplan für Kraft, Ausdauer & Regeneration",
  ];

  // Map each day of the next 28 days
  for (let offset = -7; offset < 28; offset++) {
    const targetDate = new Date(currentYear, currentMonth, currentDate + offset);
    const dayIndex = (targetDate.getDay() + 6) % 7; // 0 = Mo ... 6 = So
    const plan = DEFAULT_WEEKLY_PLAN.find((d) => d.dayIndex === dayIndex);

    if (plan && plan.workoutType !== "rest") {
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, "0");
      const day = String(targetDate.getDate()).padStart(2, "0");

      const dateStr = `${year}${month}${day}`;
      const defaultStartHour = plan.workoutType === "gym" ? "170000" : "180000";
      const defaultEndHour = plan.workoutType === "gym" ? "183000" : "191500";

      const uid = `workout_${dateStr}_${plan.workoutType}@hybridathlete.app`;
      const emoji = plan.workoutType === "gym" ? "🏋️" : plan.workoutType === "cycling" ? "🚴‍♂️" : "🏃";
      const summary = `${emoji} ${plan.title}`;
      const description = `${plan.description}\\n\\nTyp: ${plan.workoutType.toUpperCase()}\\nAdaptiv gesteuert durch Garmin Connect & Hybrid Athlete OS.`;

      icsContent.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dateStr}T000000Z`,
        `DTSTART;TZID=Europe/Berlin:${dateStr}T${defaultStartHour}`,
        `DTEND;TZID=Europe/Berlin:${dateStr}T${defaultEndHour}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "END:VEVENT"
      );
    }
  }

  icsContent.push("END:VCALENDAR");

  const icsBody = icsContent.join("\r\n");

  return new NextResponse(icsBody, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="hybrid-athlete-training.ics"',
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
    },
  });
}
