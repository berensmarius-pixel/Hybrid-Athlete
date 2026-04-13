"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { StravaActivity, StravaConnection, StravaAthlete } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "hybrid_athlete_strava";
const ACTIVITIES_KEY = "hybrid_athlete_strava_activities";

const DEFAULT_CONNECTION: StravaConnection = {
  isConnected: false,
  athlete: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  lastSynced: null,
};

// ─── Context shape ────────────────────────────────────────────────────────────

interface StravaContextValue {
  connection: StravaConnection;
  activities: StravaActivity[];
  isSyncing: boolean;
  /** Mock OAuth connect – immediately enters "connected" state */
  mockConnect: () => void;
  /** Connect via real Strava OAuth redirect */
  connectWithStrava: () => void;
  /** Apply token data received after a real OAuth callback */
  applyOAuthResult: (params: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
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
  const [connection, setConnectionState] = useState<StravaConnection>(DEFAULT_CONNECTION);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // ── Hydrate from localStorage ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setConnectionState(JSON.parse(raw) as StravaConnection);

      const acts = localStorage.getItem(ACTIVITIES_KEY);
      if (acts) setActivities(JSON.parse(acts) as StravaActivity[]);
    } catch { /* ignore */ }
  }, []);

  // ── Check URL for OAuth callback params (after Strava redirect) ────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.get("strava_connected")) return;

    const athlete: StravaAthlete = {
      id: Number(sp.get("strava_athlete_id") ?? 0),
      firstname: sp.get("strava_firstname") ?? "",
      lastname: sp.get("strava_lastname") ?? "",
      profile: decodeURIComponent(sp.get("strava_profile") ?? ""),
    };

    applyOAuthResult({
      accessToken: sp.get("strava_access_token") ?? "",
      refreshToken: sp.get("strava_refresh_token") ?? "",
      expiresAt: Number(sp.get("strava_expires_at") ?? 0),
      athlete,
    });

    // Clean up URL
    const clean = new URL(window.location.href);
    ["strava_connected","strava_access_token","strava_refresh_token",
     "strava_expires_at","strava_athlete_id","strava_firstname",
     "strava_lastname","strava_profile"].forEach(k => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist helpers ────────────────────────────────────────────────────────
  const persistConnection = useCallback((conn: StravaConnection) => {
    setConnectionState(conn);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conn)); } catch { /* ignore */ }
  }, []);

  const persistActivities = useCallback((acts: StravaActivity[]) => {
    setActivities(acts);
    try { localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(acts)); } catch { /* ignore */ }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const mockConnect = useCallback(() => {
    const conn: StravaConnection = {
      isConnected: true,
      athlete: {
        id: 99999,
        firstname: "Max",
        lastname: "Mustermann",
        profile: "",
      },
      accessToken: "demo_token",
      refreshToken: "demo_refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 21600, // +6h
      lastSynced: null,
    };
    persistConnection(conn);
  }, [persistConnection]);

  const connectWithStrava = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
    if (!clientId) {
      // Fallback to mock if client ID not configured
      mockConnect();
      return;
    }
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/strava/callback`);
    const scope = "read,activity:read_all";
    window.location.href =
      `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=${scope}`;
  }, [mockConnect]);

  function applyOAuthResult(params: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    athlete: StravaAthlete;
  }) {
    const conn: StravaConnection = {
      isConnected: true,
      athlete: params.athlete,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: params.expiresAt,
      lastSynced: null,
    };
    persistConnection(conn);
  }

  const disconnect = useCallback(() => {
    persistConnection(DEFAULT_CONNECTION);
    persistActivities([]);
  }, [persistConnection, persistActivities]);

  /** Refresh access token if expired, then fetch activities */
  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      let token = connection.accessToken;
      let conn = connection;

      // ── Auto-refresh if token is expired ──────────────────────────────────
      const nowSec = Math.floor(Date.now() / 1000);
      if (conn.expiresAt && conn.expiresAt < nowSec && conn.refreshToken) {
        const refreshRes = await fetch("/api/strava/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: conn.refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshed = await refreshRes.json() as {
            access_token: string;
            refresh_token: string;
            expires_at: number;
          };
          token = refreshed.access_token;
          conn = {
            ...conn,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            expiresAt: refreshed.expires_at,
          };
          persistConnection(conn);
        }
      }

      // ── Fetch activities ───────────────────────────────────────────────────
      const params = new URLSearchParams({ per_page: "20", page: "1" });
      if (token && token !== "demo_token") {
        params.set("access_token", token);
      }

      const res = await fetch(`/api/strava/activities?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as StravaActivity[];
      persistActivities(data);

      persistConnection({
        ...conn,
        lastSynced: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Strava sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [connection, persistConnection, persistActivities]);

  return (
    <StravaContext.Provider
      value={{
        connection,
        activities,
        isSyncing,
        mockConnect,
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
