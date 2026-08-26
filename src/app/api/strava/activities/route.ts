/**
 * GET /api/strava/activities
 *
 * Fetches the athlete's recent Run + Ride activities from Strava.
 * Falls back to clearly-labeled demo data when no credentials are configured.
 *
 * Query params (all optional):
 *   per_page      – activities per page (default: 20)
 *   page          – page number (default: 1)
 *
 * Token-Auflösung inkl. Auto-Refresh läuft zentral im Integrations-Adapter
 * (src/modules/integrations/strava/oauth.ts → getValidAccessToken).
 *
 * Response shape:
 *   { source: "live" | "demo", activities: StravaActivity[] }
 */

import { MOCK_STRAVA_ACTIVITIES } from "@/data/stravaActivities";
import type { StravaActivity } from "@/types";
import { stravaApi, isEnduranceSport } from "@/modules/integrations/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const perPage = url.searchParams.get("per_page") ?? "20";
  const page = url.searchParams.get("page") ?? "1";

  const params = new URLSearchParams({ per_page: perPage, page });

  let res: Response;
  try {
    res = await stravaApi(`/athlete/activities?${params.toString()}`);
  } catch (err) {
    console.warn("Strava credentials unavailable — serving demo data:", err);
    return Response.json({ source: "demo", activities: MOCK_STRAVA_ACTIVITIES });
  }

  // Abgelaufene Tokens trotz Refresh → Demo-Daten statt Fehlerseite
  if (!res.ok) {
    console.error("Strava activities fetch failed:", res.status);
    return Response.json({ source: "demo", activities: MOCK_STRAVA_ACTIVITIES });
  }

  const activities = (await res.json()) as StravaActivity[];

  const endurance = activities.filter(isEnduranceSport);

  return Response.json({ source: "live", activities: endurance });
}
