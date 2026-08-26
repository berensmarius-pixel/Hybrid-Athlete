/**
 * Authentifizierter Strava-API-Client (Server-seitig).
 *
 * Jeder Request löst den Access Token über die OAuth-Auto-Refresh-Logik auf;
 * bei 401 wird einmalig erzwungen erneuert und der Request wiederholt.
 */

import type {
  StravaDetailedActivity,
  StravaZoneBucket,
  StravaZonesResponse,
} from "./types";
import { getValidAccessToken, forceRefresh } from "./oauth";

const API_BASE = "https://www.strava.com/api/v3";

async function authorizedFetch(
  path: string,
  init: RequestInit | undefined,
  token: string
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
}

/**
 * Führt einen authentifizierten Strava-API-Call aus.
 * Bei 401: einmaliger Force-Refresh + Retry. Wirft bei sonstigen Fehlern.
 */
export async function stravaApi(
  path: string,
  init?: RequestInit
): Promise<Response> {
  let token = await getValidAccessToken();
  if (!token) throw new Error("Keine gültigen Strava-Credentials");

  let res = await authorizedFetch(path, init, token);

  if (res.status === 401) {
    token = await forceRefresh();
    if (!token) throw new Error("Strava-Token-Refresh nach 401 fehlgeschlagen");
    res = await authorizedFetch(path, init, token);
  }

  return res;
}

/** GET /athlete/activities – Liste letzter Aktivitäten (Summary-Shape). */
export async function listAthleteActivities(options?: {
  perPage?: number;
  page?: number;
  /** UNIX-Sekunden */
  after?: number;
}): Promise<unknown[]> {
  const params = new URLSearchParams({
    per_page: String(options?.perPage ?? 30),
    page: String(options?.page ?? 1),
  });
  if (options?.after) params.set("after", String(Math.floor(options.after)));

  const res = await stravaApi(`/athlete/activities?${params.toString()}`);
  if (!res.ok) throw new Error(`Strava activities fetch failed (${res.status})`);
  return (await res.json()) as unknown[];
}

/** GET /activities/{id} – DetailedActivity inkl. Kalorien/Kilojoule. */
export async function getStravaActivity(
  activityId: number
): Promise<StravaDetailedActivity | null> {
  const res = await stravaApi(`/activities/${activityId}`);
  if (!res.ok) {
    console.error(`[strava/client] activity ${activityId}: HTTP ${res.status}`);
    return null;
  }
  return (await res.json()) as StravaDetailedActivity;
}

/** GET /activities/{id}/zones – HR-Zonenverteilung (Zeit je Bucket). */
export async function getStravaActivityZones(
  activityId: number
): Promise<StravaZoneBucket[] | null> {
  const res = await stravaApi(`/activities/${activityId}/zones`);
  if (!res.ok) return null;

  const zones = (await res.json()) as StravaZonesResponse[] | null;
  const hr = Array.isArray(zones)
    ? zones.find((z) => z.type === "heartrate")
    : undefined;
  if (!hr) return null;

  const buckets = hr.distribution_buckets ?? hr.buckets ?? [];
  return buckets.length > 0 ? buckets : null;
}

/**
 * PUT /activities/{id} – aktualisiert die Beschreibung einer Aktivität.
 * Form-Encoded (Strava-Konvention für Activity-Updates).
 */
export async function updateStravaActivityDescription(
  activityId: number,
  description: string
): Promise<boolean> {
  const body = new URLSearchParams({ description });

  const res = await stravaApi(`/activities/${activityId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error(
      `[strava/client] description update ${activityId}: HTTP ${res.status}`
    );
    return false;
  }
  return true;
}
