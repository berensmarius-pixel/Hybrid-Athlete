import {
  readGoogleTokens,
  saveGoogleTokens,
  type StoredGoogleTokens,
} from "./googleTokens";
import type { BusyInterval, GoogleCalendarInfo } from "@/lib/calendar/gcal/types";

/**
 * Minimaler Google-Calendar-API-Client (nur fetch, kein SDK).
 * Behandelt Token-Ablauf proaktiv & reaktiv (401-Retry) und kapselt
 * FreeBusy + Event-CRUD für die Zweiwege-Synchronisation.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_connected"
      | "missing_env"
      | "refresh_failed"
      | "upstream_error",
    readonly status = 500
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarError(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET sind nicht konfiguriert.",
      "missing_env"
    );
  }
  return { clientId, clientSecret };
}

/** Tauscht einen Refresh-Token gegen einen frischen Access-Token. */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const { clientId, clientSecret } = getOAuthCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[googleCalendarClient] token refresh failed:", body.slice(0, 400));
    throw new GoogleCalendarError(
      "Google-Token-Refresh fehlgeschlagen. Bitte neu verbinden.",
      "refresh_failed",
      401
    );
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new GoogleCalendarError("Unerwartete Google-Token-Antwort.", "refresh_failed", 502);
  }
  return {
    accessToken: data.access_token,
    // Google rotiert Refresh-Tokens i.d.R. nicht – alten behalten
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/** Frischer Access-Token inkl. proaktiver Erneuerung & Re-Persistierung. */
export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const tokens = await readGoogleTokens();
  if (!tokens?.refreshToken) {
    throw new GoogleCalendarError(
      "Google Kalender ist nicht verbunden.",
      "not_connected",
      401
    );
  }
  let current: StoredGoogleTokens = tokens;
  if (forceRefresh || tokens.expiresAt - 70_000 < Date.now()) {
    const fresh = await refreshAccessToken(tokens.refreshToken);
    current = { ...tokens, ...fresh };
    await saveGoogleTokens(current);
  }
  return current.accessToken;
}

async function calendarFetch<T>(
  path: string,
  init: RequestInit = {},
  retryOn401 = true
): Promise<{ data: T; status: number }> {
  const accessToken = await getValidAccessToken();
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && retryOn401) {
    // Token könnte widerrufen/veraltet sein → einmal forciert erneuern
    const accessToken2 = await getValidAccessToken(true);
    const res2 = await fetch(`${CALENDAR_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken2}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    return finish<T>(res2);
  }
  return finish<T>(res);
}

async function finish<T>(res: Response): Promise<{ data: T; status: number }> {
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  if (!res.ok) {
    console.error("[googleCalendarClient] API error:", res.status, text.slice(0, 400));
    throw new GoogleCalendarError(
      `Google Calendar API Fehler (${res.status}).`,
      "upstream_error",
      res.status === 403 ? 403 : 502
    );
  }
  return { data, status: res.status };
}

// ── Öffentliche API-Wrapper ──────────────────────────────────────────────────

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
}

export async function listCalendars(): Promise<GoogleCalendarInfo[]> {
  const { data } = await calendarFetch<{
    items?: { id?: string; summary?: string; primary?: boolean; accessRole?: string }[];
  }>("/users/me/calendarList?minAccessRole=writer&maxResults=100");
  return (data.items ?? [])
    .filter((c): c is CalendarListEntry => typeof c.id === "string" && !!c.summary)
    .map((c) => ({
      id: c.id,
      summary: c.primary ? `${c.summary} (Primär)` : c.summary,
      primary: Boolean(c.primary),
      accessRole: c.accessRole ?? "owner",
    }));
}

/** Busy-Intervalle (RFC 3339 UTC) für den Zeitraum. */
export async function queryFreeBusy(
  calendarId: string,
  timeMinMs: number,
  timeMaxMs: number
): Promise<BusyInterval[]> {
  const idParam = encodeURIComponent(calendarId || "primary");
  const { data } = await calendarFetch<{
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  }>(`/freeBusy`, {
    method: "POST",
    body: JSON.stringify({
      timeMin: new Date(timeMinMs).toISOString(),
      timeMax: new Date(timeMaxMs).toISOString(),
      timeZone: "Europe/Berlin",
      items: [{ id: calendarId || "primary" }],
    }),
  });
  return data.calendars?.[idParam]?.busy ?? [];
}

export interface InsertedEvent {
  id: string;
  htmlLink?: string;
}

export async function insertWorkoutEvent(
  calendarId: string,
  payload: unknown
): Promise<InsertedEvent> {
  const id = encodeURIComponent(calendarId || "primary");
  const { data } = await calendarFetch<InsertedEvent>(
    `/calendars/${id}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data;
}

/** Verschiebt/bearbeitet ein bestehendes Event (Start/Ende/Titel/Beschreibung). */
export async function patchEvent(
  calendarId: string,
  eventId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const id = encodeURIComponent(calendarId || "primary");
  await calendarFetch(`/calendars/${id}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Löscht ein Event; 404/410 gelten als Erfolg (schon weg). */
export async function deleteEvent(calendarId: string, eventId: string): Promise<boolean> {
  try {
    const id = encodeURIComponent(calendarId || "primary");
    await calendarFetch(
      `/calendars/${id}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "DELETE" }
    );
    return true;
  } catch (err) {
    if (
      err instanceof GoogleCalendarError &&
      (err.status === 410 || err.status === 404)
    ) {
      return true;
    }
    throw err;
  }
}
