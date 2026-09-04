/**
 * GET /api/strava/activities
 *
 * Fetches the athlete's recent Run + Ride activities from Strava.
 * Falls back to cached activities in Supabase app_state when credentials
 * are not configured or when the remote request fails.
 *
 * Query params (all optional):
 *   per_page      – activities per page (default: 20)
 *   page          – page number (default: 1)
 *
 * Token-Auflösung inkl. Auto-Refresh läuft zentral im Integrations-Adapter
 * (src/modules/integrations/strava/oauth.ts → getValidAccessToken).
 *
 * Response shape:
 *   { source: "live" | "cached", activities: StravaActivity[] }
 */

import type { StravaActivity } from "@/types";
import { stravaApi, isEnduranceSport } from "@/modules/integrations/strava";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

const STRAVA_ACTIVITIES_KEY = "hybrid_athlete_strava_activities";

async function getCachedActivities(): Promise<StravaActivity[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data } = await getSupabaseAdmin()
      .from("app_state")
      .select("value")
      .eq("key", STRAVA_ACTIVITIES_KEY)
      .maybeSingle();
    const val = data?.value;
    return Array.isArray(val) ? (val as StravaActivity[]) : [];
  } catch (err) {
    console.error("[api/strava/activities] Failed to read cached activities:", err);
    return [];
  }
}

async function cacheActivities(activities: StravaActivity[]): Promise<void> {
  if (!isSupabaseConfigured() || activities.length === 0) return;
  try {
    await getSupabaseAdmin()
      .from("app_state")
      .upsert({ key: STRAVA_ACTIVITIES_KEY, value: activities }, { onConflict: "key" });
  } catch (err) {
    console.error("[api/strava/activities] Failed to write cache:", err);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const perPage = url.searchParams.get("per_page") ?? "20";
  const page = url.searchParams.get("page") ?? "1";

  const params = new URLSearchParams({ per_page: perPage, page });

  let res: Response;
  try {
    res = await stravaApi(`/athlete/activities?${params.toString()}`);
  } catch (err) {
    console.warn("Strava credentials unavailable — serving cached activities:", err);
    const cached = await getCachedActivities();
    return Response.json({ source: "cached", activities: cached });
  }

  if (!res.ok) {
    console.error("Strava activities fetch failed:", res.status);
    const cached = await getCachedActivities();
    return Response.json({ source: "cached", activities: cached });
  }

  const activities = (await res.json()) as StravaActivity[];
  const endurance = activities.filter(isEnduranceSport);

  // Persist live endurance activities to Supabase app_state cache
  void cacheActivities(endurance);

  return Response.json({ source: "live", activities: endurance });
}
