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
 * Authorization:
 *   1. Server-gespeicherte OAuth-Tokens (aus /api/strava/callback)
 *   2. Optionaler `Authorization: Bearer <access_token>` Header (Legacy)
 *   3. STRAVA_ACCESS_TOKEN aus der Server-Umgebung
 *
 * Response shape:
 *   { source: "live" | "demo", activities: StravaActivity[] }
 */

import { MOCK_STRAVA_ACTIVITIES } from "@/data/stravaActivities";
import type { StravaActivity } from "@/types";
import {
  readStravaTokens,
  saveStravaTokens,
} from "@/lib/server/stravaTokens";

async function exchangeRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
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

  // Legacy-Client-Token ausschließlich per Authorization-Header – niemals
  // als URL-Parameter (leckt in Logs/History).
  const authHeader = request.headers.get("authorization") ?? "";
  const clientToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  // ── Token-Auflösung: Server-Store → Legacy-Client-Token → Env ────────────
  let accessToken = clientToken || process.env.STRAVA_ACCESS_TOKEN || "";
  let storedTokens = await readStravaTokens();
  if (!accessToken && storedTokens) {
    accessToken = storedTokens.accessToken;
  }

  // ── Demo / mock mode ─────────────────────────────────────────────────────
  if (!accessToken) {
    return Response.json({ source: "demo", activities: MOCK_STRAVA_ACTIVITIES });
  }

  // ── Proaktiver Refresh, wenn Server-Tokens abgelaufen sind ───────────────
  if (
    !clientToken &&
    storedTokens &&
    storedTokens.expiresAt &&
    storedTokens.expiresAt < Math.floor(Date.now() / 1000) + 60
  ) {
    const refreshed = await exchangeRefreshToken(storedTokens.refreshToken);
    if (refreshed) {
      storedTokens = {
        ...storedTokens,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      };
      await saveStravaTokens(storedTokens);
      accessToken = refreshed.accessToken;
    }
  }

  // ── First attempt ────────────────────────────────────────────────────────
  let res = await fetchActivities(accessToken, perPage, page);

  // ── Auto-refresh on 401 ──────────────────────────────────────────────────
  if (res.status === 401 && !clientToken) {
    const refreshToken =
      storedTokens?.refreshToken || process.env.STRAVA_REFRESH_TOKEN;

    if (refreshToken) {
      const refreshed = await exchangeRefreshToken(refreshToken);

      if (refreshed) {
        // Neue Tokens persistieren (Server-Store bevorzugt)
        await saveStravaTokens({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.expiresAt,
          athlete: storedTokens?.athlete ?? null,
        });

        // Retry with the fresh token
        res = await fetchActivities(refreshed.accessToken, perPage, page);
      }
    }

    if (!res.ok) {
      console.warn("Strava token expired and refresh failed — serving demo data");
      return Response.json({ source: "demo", activities: MOCK_STRAVA_ACTIVITIES });
    }
  }

  // ── Handle non-OK responses ──────────────────────────────────────────────
  if (!res.ok) {
    console.error("Strava activities fetch failed:", res.status);
    return Response.json({ source: "demo", activities: MOCK_STRAVA_ACTIVITIES });
  }

  const activities = (await res.json()) as StravaActivity[];

  const endurance = activities.filter(
    (a) =>
      a.sport_type === "Run" || a.sport_type === "Ride" ||
      a.type === "Run"       || a.type === "Ride"
  );

  return Response.json({ source: "live", activities: endurance });
}
