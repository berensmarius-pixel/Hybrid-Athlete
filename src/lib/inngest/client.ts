// ─── Inngest Client (Event-Backbone der Background-Pipeline) ─────────────────

import { Inngest } from "inngest";

export const GARMIN_ACTIVITY_RECEIVED = "garmin/activity.received";

export interface GarminActivityEventData {
  garminId: string;
  name?: string;
  type?: "running" | "cycling" | "gym" | "other";
  startTime?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  ftpWatts?: number;
  /**
   * true = der Auslöser (Webhook-Worker) generiert selbst einen
   * Planned-vs-Actual-Debrief; die FIT-Pipeline überspringt ihren eigenen.
   */
  skipDebrief?: boolean;
}

export function isGarminActivityEventData(data: unknown): data is GarminActivityEventData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.garminId === "string" &&
    /^\d{4,}$/.test(d.garminId)
  );
}

export const inngest = new Inngest({
  id: "hybrid-athlete",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
