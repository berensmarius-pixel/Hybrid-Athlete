"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { StravaActivity, StravaConnection, StravaAthlete } from "@/types";
import { usePersistentState } from "@/hooks/usePersistentState";

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_KEY = "hybrid_athlete_strava";
const ACTIVITIES_KEY = "hybrid_athlete_strava_activities";
const OAUTH_STATE_KEY = "hybrid_athlete_strava_oauth_state";

/**
 * Muss mit STRAVA_OAUTH_SCOPE im Server-Adapter übereinstimmen
 * (src/modules/integrations/strava/types.ts). activity:write erlaubt dem
 * Adapter, die Beschreibung mit KI-Coaching-Metriken zu aktualisieren.
 */
const OAUTH_SCOPE = "read,activity:read_all,activity:write";

const DEFAULT_CONNECTION: StravaConnection = {
  isConnected: false,
  athlete: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  lastSynced: null,
};

/** Tokens verlassen den Browser nicht mehr – beim Persistieren strippen. */
function sanitizeConnection(conn: StravaConnection | null | undefined): StravaConnection {
  if (!conn || typeof conn !== "object") return DEFAULT_CONNECTION;
  return { ...conn, accessToken: null, refreshToken: null };
}

interface LegacyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Einmalige Migration: ältere Installationen hatten OAuth-Tokens im
 * localStorage. Sie werden hier synchron extrahiert (BEVOR der
 * Persistenz-Effekt den Key überschreibt) und danach serverseitig gespiegelt.
 */
function extractLegacyTokens(): LegacyTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StravaConnection>;
    if (
      parsed.accessToken &&
      parsed.refreshToken &&
      parsed.accessToken !== "demo_token"
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt ?? 0,
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface StravaContextValue {
  connection: StravaConnection;
  activities: StravaActivity[];
  isSyncing: boolean;
  /** Connect via real Strava OAuth redirect */
  connectWithStrava: () => void;
  /** Apply athlete data received after a real OAuth callback (Tokens bleiben serverseitig) */
  applyOAuthResult: (params: {
    athlete: StravaAthlete;
  }) => void;
  disconnect: () => void;
  /** Fetch activities from /api/strava/activities */
  sync: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StravaContext = createContext<StravaContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StravaProvider({ children }: { children: React.ReactNode }) {
  // Legacy-Tokens VOR allen Effekten sichern (Render-Zeit, siehe oben)
  const [legacyTokens] = useState<LegacyTokens | null>(() => extractLegacyTokens());

  const [connection, setConnection] = usePersistentState<StravaConnection>(
    STORAGE_KEY,
    DEFAULT_CONNECTION,
    {
      validate: (raw) => sanitizeConnection(raw as StravaConnection | null | undefined),
      transformForStorage: sanitizeConnection,
    }
  );
  const [activities, setActivities] = usePersistentState<StravaActivity[]>(
    ACTIVITIES_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as StravaActivity[]) : null) }
  );

  const [isSyncing, setIsSyncing] = useState(false);

  // ── Legacy-Migration: Tokens einmalig serverseitig ablegen ────────────────
  useEffect(() => {
    if (!legacyTokens) return;
    let cancelled = false;
    void (async () => {
      try {
        await fetch("/api/settings/strava-tokens", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            value: {
              accessToken: legacyTokens.accessToken,
              refreshToken: legacyTokens.refreshToken,
              expiresAt: legacyTokens.expiresAt,
            },
          }),
        });
        if (!cancelled) {
          // Lokalen Key von Tokens befreien (Persist-Effekt schreibt ohnehin
          // sanitisiert – hier zusätzlich hart aufräumen)
          try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as Partial<StravaConnection>;
              window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(sanitizeConnection(parsed as StravaConnection))
              );
            }
          } catch { /* ignore */ }
        }
      } catch { /* offline → nächster Start erneut */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [legacyTokens]);

  // ── Check URL for OAuth callback params (after Strava redirect) ────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.get("strava_connected")) return;

    // ── OAuth-State validieren (CSRF-Schutz) ──────────────────────────────────
    const returnedState = sp.get("state");
    const expectedState = window.localStorage.getItem(OAUTH_STATE_KEY);
    window.localStorage.removeItem(OAUTH_STATE_KEY);

    if (!expectedState || returnedState !== expectedState) {
      console.warn("Strava OAuth: state-Validierung fehlgeschlagen – Token werden verworfen.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const athlete: StravaAthlete = {
      id: Number(sp.get("strava_athlete_id") ?? 0),
      firstname: sp.get("strava_firstname") ?? "",
      lastname: sp.get("strava_lastname") ?? "",
      profile: decodeURIComponent(sp.get("strava_profile") ?? ""),
    };

    // Tokens liegen inzwischen vollständig serverseitig (Supabase oder
    // lokale Datei) – der Client erhält sie nicht mehr.
    applyOAuthResult({ athlete });

    // Clean up URL
    const clean = new URL(window.location.href);
    ["strava_connected","strava_athlete_id","strava_firstname",
     "strava_lastname","strava_profile","state"].forEach(k => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
 
  const connectWithStrava = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
    if (!clientId) {
      console.warn("Strava Client ID nicht konfiguriert (NEXT_PUBLIC_STRAVA_CLIENT_ID fehlt).");
      return;
    }
    // OAuth-State gegen CSRF: zufälliger Wert wird vor der Weiterleitung
    // gespeichert und nach dem Callback validiert.
    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    window.localStorage.setItem(OAUTH_STATE_KEY, state);

    const redirectUri = encodeURIComponent(`${window.location.origin}/api/strava/callback`);
    const scope = OAUTH_SCOPE;
    window.location.href =
      `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=${scope}&state=${state}`;
  }, []);

  function applyOAuthResult(params: {
    athlete: StravaAthlete;
  }) {
    setConnection((prev) => ({
      ...prev,
      isConnected: true,
      athlete: params.athlete,
      accessToken: null,
      refreshToken: null,
      lastSynced: null,
    }));
  }

  const disconnect = useCallback(() => {
    setConnection(DEFAULT_CONNECTION);
    setActivities([]);
    // Server-seitige Tokens entfernen (Fire-and-forget)
    void fetch("/api/settings/strava-tokens", { method: "DELETE" }).catch(() => {});
  }, [setConnection, setActivities]);

  /** Fetch activities – Token-Auflösung & Refresh passieren komplett serverseitig */
  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const params = new URLSearchParams({ per_page: "20", page: "1" });

      const res = await fetch(`/api/strava/activities?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        source: "live" | "cached";
        activities: StravaActivity[];
      };
      setActivities(data.activities ?? []);

      setConnection((prev) => ({
        ...prev,
        isConnected: prev.isConnected || data.source === "live" || (data.activities && data.activities.length > 0),
        lastSynced: new Date().toISOString(),
      }));
    } catch (err) {
      console.error("Strava sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [setActivities, setConnection]);

  return (
    <StravaContext.Provider
      value={{
        connection,
        activities,
        isSyncing,
        connectWithStrava,
        applyOAuthResult,
        disconnect,
        sync,
      }}
    >
      {children}
    </StravaContext.Provider>
  );
}

export function useStrava(): StravaContextValue {
  const ctx = useContext(StravaContext);
  if (!ctx) throw new Error("useStrava must be used inside <StravaProvider>");
  return ctx;
}
