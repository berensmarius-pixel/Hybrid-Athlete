/**
 * Strava OAuth2 – Authorization-Code-Flow und Token-Auto-Refresh.
 *
 * Tokens werden ausschließlich serverseitig gespeichert
 * (Supabase app_state `hybrid_athlete_strava_tokens`, Fallback: lokale
 * Datei `.server_state/strava_tokens.json`). Der Browser erhält sie nie.
 *
 * Environment: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 */

import type { StravaAthlete } from "@/types";
import type { StravaTokenSet } from "./types";
import { STRAVA_OAUTH_SCOPE } from "./types";
import {
  readStravaTokens,
  saveStravaTokens,
} from "@/lib/server/stravaTokens";

const OAUTH_TOKEN_URL = "https://www.strava.com/oauth/token";
const OAUTH_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";

/** Proaktiver Refresh-Puffer: Token < 60 s vor Ablauf wird erneuert. */
export const EXPIRY_BUFFER_SECONDS = 60;

export { STRAVA_OAUTH_SCOPE };

export interface StravaOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** Liefert die konfigurierte App oder null (inkl. Log bei Fehlkonfiguration). */
export function getOAuthConfig(): StravaOAuthConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Baut die Authorize-URL für den Browser-Redirect.
 * Scope enthält `activity:write`, damit der Adapter Coaching-Metriken in die
 * Aktivitätsbeschreibung schreiben darf.
 */
export function buildAuthorizeUrl(
  redirectUri: string,
  state: string,
  config?: StravaOAuthConfig | null
): string {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) throw new Error("Strava OAuth nicht konfiguriert");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_OAUTH_SCOPE,
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  athlete?: unknown;
}

/** Token-Set inkl. Athlete-Metadaten (nur beim Code-Grant gesetzt). */
export interface StravaTokenExchange extends StravaTokenSet {
  athlete: StravaAthlete | null;
}

function normalizeAthlete(raw: unknown): StravaAthlete | null {
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "number") return null;
  return {
    id: a.id,
    firstname: typeof a.firstname === "string" ? a.firstname : "",
    lastname: typeof a.lastname === "string" ? a.lastname : "",
    profile: typeof a.profile === "string" ? a.profile : "",
  };
}

function normalizeTokenExchange(raw: RawTokenResponse): StravaTokenExchange {
  const tokens = normalizeTokenSet(raw);
  return { ...tokens, athlete: normalizeAthlete(raw.athlete) };
}

function normalizeTokenSet(raw: RawTokenResponse): StravaTokenSet {
  if (
    typeof raw.access_token !== "string" ||
    typeof raw.refresh_token !== "string"
  ) {
    throw new Error("Unerwartete Strava-Token-Antwort");
  }
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt:
      typeof raw.expires_at === "number" ? raw.expires_at : 0,
  };
}

/** Tauscht den Authorization Code gegen Access-/Refresh-Token (inkl. Athlete). */
export async function exchangeAuthorizationCode(
  code: string,
  config?: StravaOAuthConfig | null
): Promise<StravaTokenExchange> {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) throw new Error("Strava OAuth nicht konfiguriert");

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava Code-Exchange fehlgeschlagen (${res.status})`);
  }
  return normalizeTokenExchange((await res.json()) as RawTokenResponse);
}

/** Erneuert ein Access Token anhand des Refresh Tokens. */
export async function refreshAccessToken(
  refreshToken: string,
  config?: StravaOAuthConfig | null
): Promise<StravaTokenSet> {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) throw new Error("Strava OAuth nicht konfiguriert");

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava Token-Refresh fehlgeschlagen (${res.status})`);
  }
  return normalizeTokenSet((await res.json()) as RawTokenResponse);
}

/**
 * Zentrale Auto-Refresh-Logik: löst einen gültigen Access Token auf.
 *
 * Reihenfolge:
 *   1. Server-Store → proaktiver Refresh kurz vor Ablauf (+ Persistenz)
 *   2. Env-Fallbacks STRAVA_ACCESS_TOKEN / STRAVA_REFRESH_TOKEN
 *
 * Gibt null zurück, wenn keine verwendbaren Credentials existieren.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  let stored = await readStravaTokens();

  if (stored) {
    if (!stored.expiresAt || stored.expiresAt - nowSec > EXPIRY_BUFFER_SECONDS) {
      return stored.accessToken;
    }

    // Abgelaufen bzw. läuft gleich ab → proaktiv erneuern
    try {
      const fresh = await refreshAccessToken(stored.refreshToken);
      stored = { ...stored, ...fresh };
      await saveStravaTokens(stored);
      return fresh.accessToken;
    } catch (err) {
      console.error("[strava/oauth] proaktiver Refresh fehlgeschlagen:", err);
      // Weiter unten Env-Fallback versuchen
    }
  }

  // Env-Fallback (Legacy-Setup ohne OAuth-Flow)
  const envAccess = process.env.STRAVA_ACCESS_TOKEN;
  if (envAccess) return envAccess;

  const envRefresh = process.env.STRAVA_REFRESH_TOKEN;
  if (envRefresh) {
    try {
      const fresh = await refreshAccessToken(envRefresh);
      await saveStravaTokens({
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        expiresAt: fresh.expiresAt,
        athlete: stored?.athlete ?? null,
      });
      return fresh.accessToken;
    } catch (err) {
      console.error("[strava/oauth] Env-Refresh fehlgeschlagen:", err);
    }
  }

  return null;
}

/**
 * Erzwingt einen Refresh über den gespeicherten Refresh-Token (nach 401)
 * und persistiert das Ergebnis. Gibt den neuen Access Token zurück oder null.
 */
export async function forceRefresh(): Promise<string | null> {
  const stored = await readStravaTokens();
  const refreshToken = stored?.refreshToken || process.env.STRAVA_REFRESH_TOKEN;
  if (!refreshToken) return null;

  try {
    const fresh = await refreshAccessToken(refreshToken);
    await saveStravaTokens({
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: fresh.expiresAt,
      athlete: stored?.athlete ?? null,
    });
    return fresh.accessToken;
  } catch (err) {
    console.error("[strava/oauth] forceRefresh fehlgeschlagen:", err);
    return null;
  }
}
