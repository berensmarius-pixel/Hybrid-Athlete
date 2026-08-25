import type { StravaAthlete } from "@/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Server-seitige Speicherung der Strava-OAuth-Tokens.
 * Ablageort: app_state-Key `hybrid_athlete_strava_tokens` – der Browser
 * erhält die Tokens nie zu Gesicht (kein localStorage, keine URL-Params).
 */

const TOKENS_KEY = "hybrid_athlete_strava_tokens";

export interface StoredStravaTokens {
  accessToken: string;
  refreshToken: string;
  /** UNIX-Sekunden (Strava-Format) */
  expiresAt: number;
  athlete?: StravaAthlete | null;
}

export async function readStravaTokens(): Promise<StoredStravaTokens | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await getSupabaseAdmin()
      .from("app_state")
      .select("value")
      .eq("key", TOKENS_KEY)
      .maybeSingle();

    const value = data?.value as Partial<StoredStravaTokens> | null;
    if (
      value &&
      typeof value.accessToken === "string" &&
      typeof value.refreshToken === "string"
    ) {
      return {
        accessToken: value.accessToken,
        refreshToken: value.refreshToken,
        expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
        athlete: value.athlete ?? null,
      };
    }
    return null;
  } catch (err) {
    console.error("[stravaTokens] read failed:", err);
    return null;
  }
}

export async function saveStravaTokens(
  tokens: StoredStravaTokens
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .upsert(
        { key: TOKENS_KEY, value: { ...tokens, updatedAt: new Date().toISOString() } },
        { onConflict: "key" }
      );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[stravaTokens] save failed:", err);
    return false;
  }
}

export async function deleteStravaTokens(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .delete()
      .eq("key", TOKENS_KEY);
    return !error;
  } catch (err) {
    console.error("[stravaTokens] delete failed:", err);
    return false;
  }
}
