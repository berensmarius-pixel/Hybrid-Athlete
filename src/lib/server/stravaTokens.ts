import type { StravaAthlete } from "@/types";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Server-seitige Speicherung der Strava-OAuth-Tokens.
 *
 * Primär: app_state-Key `hybrid_athlete_strava_tokens` (Supabase).
 * Fallback ohne Supabase: lokale Datei `.server_state/strava_tokens.json`
 * (via .gitignore abgedeckt). Der Browser erhält die Tokens nie zu
 * Gesicht – kein localStorage, keine URL-Parameter.
 */

const TOKENS_KEY = "hybrid_athlete_strava_tokens";
const STATE_DIR = path.join(process.cwd(), ".server_state");
const STATE_FILE = path.join(STATE_DIR, "strava_tokens.json");

export interface StoredStravaTokens {
  accessToken: string;
  refreshToken: string;
  /** UNIX-Sekunden (Strava-Format) */
  expiresAt: number;
  athlete?: StravaAthlete | null;
}

function normalize(value: unknown): StoredStravaTokens | null {
  const v = value as Partial<StoredStravaTokens> | null;
  if (
    v &&
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string"
  ) {
    return {
      accessToken: v.accessToken,
      refreshToken: v.refreshToken,
      expiresAt: typeof v.expiresAt === "number" ? v.expiresAt : 0,
      athlete: v.athlete ?? null,
    };
  }
  return null;
}

async function readFileTokens(): Promise<StoredStravaTokens | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeFileTokens(tokens: StoredStravaTokens): Promise<boolean> {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ ...tokens, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    return true;
  } catch (err) {
    console.error("[stravaTokens] file write failed:", err);
    return false;
  }
}

export async function readStravaTokens(): Promise<StoredStravaTokens | null> {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", TOKENS_KEY)
        .maybeSingle();
      const fromDb = normalize(data?.value);
      if (fromDb) return fromDb;
    } catch (err) {
      console.error("[stravaTokens] supabase read failed:", err);
    }
  }
  return readFileTokens();
}

export async function saveStravaTokens(
  tokens: StoredStravaTokens
): Promise<boolean> {
  // Datei immer mitschreiben (Fallback + lokale Redundanz)
  await writeFileTokens(tokens);

  if (!isSupabaseConfigured()) return true;
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
    console.error("[stravaTokens] supabase save failed:", err);
    // Datei-Fallback erfolgreich → trotzdem ok
    return true;
  }
}

export async function deleteStravaTokens(): Promise<boolean> {
  let ok = true;

  try {
    await unlink(STATE_FILE);
  } catch {
    // Datei existierte evtl. nicht
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await getSupabaseAdmin()
        .from("app_state")
        .delete()
        .eq("key", TOKENS_KEY);
      ok = !error;
    } catch (err) {
      console.error("[stravaTokens] supabase delete failed:", err);
      ok = false;
    }
  }
  return ok;
}
