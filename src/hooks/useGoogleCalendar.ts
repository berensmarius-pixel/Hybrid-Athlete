"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GoogleCalendarInfo } from "@/lib/calendar/gcal/types";

/**
 * Client-Hook für die Google-Calendar-Verbindung (OAuth2).
 *
 * Spiegelt das Strava-Muster: CSRF-State in localStorage, Redirect zu
 * Google, Validierung des zurückgegebenen States nach dem Callback.
 * Tokens bleiben komplett serverseitig – hier existieren nur Metadaten.
 */

const OAUTH_STATE_KEY = "hybrid_athlete_gcal_oauth_state";

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  expiresAt: number | null;
}

const DEFAULT_STATUS: GoogleStatus = {
  configured: false,
  connected: false,
  email: null,
  expiresAt: null,
};

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useGoogleCalendar() {
  const [status, setStatus] = useState<GoogleStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const handledRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/google/status");
      if (res.ok) {
        const data = await res.json();
        setStatus({
          configured: Boolean(data.configured),
          connected: Boolean(data.connected),
          email: data.email ?? null,
          expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null,
        });
      }
    } catch {
      // Status bleibt beim letzten Stand
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    if (handledRef.current) return;
    handledRef.current = true;

    // OAuth-Rückkehr verarbeiten (?gcal_connected=1&state=...)
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gcal_connected");
    const error = params.get("gcal_error");
    const returnedState = params.get("state");

    if (!connected && !error) return;

    let oauthError: string | null = null;
    if (error) {
      oauthError =
        error === "access_denied"
          ? "Google-Zugriff wurde verweigert."
          : "Google-Verbindung fehlgeschlagen.";
    } else if (connected) {
      const expectedState = localStorage.getItem(OAUTH_STATE_KEY);
      if (!expectedState || !returnedState || expectedState !== returnedState) {
        oauthError = "OAuth-State ungültig – Verbindung verworfen.";
      }
    }

    localStorage.removeItem(OAUTH_STATE_KEY);

    // URL aufräumen (Tokens/Parameter dürfen nicht im Verlauf kleben)
    params.delete("gcal_connected");
    params.delete("gcal_error");
    params.delete("state");
    params.delete("gcal_email");
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState(null, "", clean);

    if (oauthError) console.warn("[useGoogleCalendar]", oauthError);
    void refreshStatus();
  }, [refreshStatus]);

  /** Startet den OAuth-Flow mit calendar.events + calendar.readonly. */
  const connect = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("NEXT_PUBLIC_GOOGLE_CLIENT_ID fehlt.");
      return;
    }
    const state = randomState();
    localStorage.setItem(OAUTH_STATE_KEY, state);

    const redirectUri = `${window.location.origin}/api/google/callback`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
    );
    // offline + consent ⇒ Refresh-Token wird garantiert ausgestellt
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    window.location.href = authUrl.toString();
  }, []);

  /** Trennt die Verbindung (löscht Server-Tokens + lokale Zuordnungen). */
  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/settings/google-tokens", { method: "DELETE" });
    } catch {
      // Fehler trotzdem lokal abmelden
    }
    setStatus(DEFAULT_STATUS);
    await refreshStatus();
  }, [refreshStatus]);

  return { status, loading, connect, disconnect, refreshStatus };
}

/** Lädt die schreibbaren Ziel-Kalender des Kontos. */
export function fetchGoogleCalendars(): Promise<GoogleCalendarInfo[]> {
  return fetch("/api/calendar/google/calendars")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.success && Array.isArray(d.calendars) ? d.calendars : []))
    .catch(() => []);
}
