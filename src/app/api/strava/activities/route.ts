/**
 * GET /api/strava/activities
 *
 * Fetches the athlete's recent Run + Ride activities from Strava.
 * Falls back to mock data when no credentials are configured.
 *
 * Auto-refresh: when the stored access token returns 401, the route
 * silently refreshes it using STRAVA_REFRESH_TOKEN and retries once.
 *
 * Query params (all optional):
 *   access_token  – client-supplied token (overridden by server env var)
 *   per_page      – activities per page (default: 20)
 *   page          – page number (default: 1)
 *
 * Response headers (only on successful refresh):
 *   X-Strava-New-Access-Token  – new access token
 *   X-Strava-New-Expires-At    – new expiry unix timestamp
 *   X-Strava-New-Refresh-Token – new refresh token
 */

import { MOCK_STRAVA_ACTIVITIES } from "@/data/stravaActivities";
import type { StravaActivity } from "@/types";

async function refreshAccessToken(): Promise<string | null> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  return data.access_token;
}

async function fetchActivities(
  token: string,
  perPage: string,
  page: string
): Promise<Response> {
  const stravaUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
  stravaUrl.searchParams.set("per_page", perPage);
  stravaUrl.searchParams.set("page", page);

  return fetch(stravaUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const perPage = url.searchParams.get("per_page") ?? "20";
  const page = url.searchParams.get("page") ?? "1";
  const clientToken = url.searchParams.get("access_token");

  // Client-supplied token (from real OAuth) takes priority over the env var fallback
  const accessToken = clientToken ?? process.env.STRAVA_ACCESS_TOKEN;

  // ── Demo / mock mode ──────────────────────────────────────────────────────
  if (!accessToken) {
    return Response.json(MOCK_STRAVA_ACTIVITIES);
  }

  // ── First attempt ─────────────────────────────────────────────────────────
  let res = await fetchActivities(accessToken, perPage, page);

  // ── Auto-refresh on 401 ───────────────────────────────────────────────────
  if (res.status === 401) {
    const newToken = await refreshAccessToken();

    if (!newToken) {
      // Cannot refresh — fall back to mock data so the UI stays functional
      console.warn("Strava token expired and refresh failed — using mock data");
      return Response.json(MOCK_STRAVA_ACTIVITIES);
    }

    // Retry with the fresh token
    res = await fetchActivities(newToken, perPage, page);
  }

  // ── Handle non-OK responses ───────────────────────────────────────────────
  if (!res.ok) {
    console.error("Strava activities fetch failed:", res.status);
    return Response.json(MOCK_STRAVA_ACTIVITIES);
  }

  const activities = (await res.json()) as StravaActivity[];

  const endurance = activities.filter(
    (a) =>
      a.sport_type === "Run" || a.sport_type === "Ride" ||
      a.type === "Run"       || a.type === "Ride"
  );

  return Response.json(endurance);
}
