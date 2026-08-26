import {
  getSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Server-seitige Speicherung der Google-OAuth-Tokens (Calendar API).
 *
 * Primär: app_state-Key `hybrid_athlete_google_tokens` (Supabase).
 * Fallback ohne Supabase: lokale Datei `.server_state/google_tokens.json`
 * (via .gitignore abgedeckt). Der Browser erhält die Tokens nie zu
 * Gesicht – kein localStorage, keine URL-Parameter.
 */

const TOKENS_KEY = "hybrid_athlete_google_tokens";
const STATE_DIR = path.join(process.cwd(), ".server_state");
const STATE_FILE = path.join(STATE_DIR, "google_tokens.json");

export interface StoredGoogleTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch-ms – Google liefert `expires_in` (Sekunden relativ zu jetzt). */
  expiresAt: number;
  /** E-Mail aus dem id_token – reine Anzeige im UI. */
  email?: string | null;
  /** Bewilligte Scopes (Audit-Zweck). */
  scope?: string | null;
}

function normalize(value: unknown): StoredGoogleTokens | null {
  const v = value as Partial<StoredGoogleTokens> | null;
  if (
    v &&
    typeof v.accessToken === "string" &&
    typeof v.refreshToken === "string"
  ) {
    return {
      accessToken: v.accessToken,
      refreshToken: v.refreshToken,
      expiresAt: typeof v.expiresAt === "number" ? v.expiresAt : 0,
      email: typeof v.email === "string" ? v.email : null,
      scope: typeof v.scope === "string" ? v.scope : null,
    };
  }
  return null;
}

async function readFileTokens(): Promise<StoredGoogleTokens | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeFileTokens(tokens: StoredGoogleTokens): Promise<boolean> {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(
      STATE_FILE,
      JSON.stringify({ ...tokens, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
    return true;
  } catch (err) {
    console.error("[googleTokens] file write failed:", err);
    return false;
  }
}

export async function readGoogleTokens(): Promise<StoredGoogleTokens | null> {
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
      console.error("[googleTokens] supabase read failed:", err);
    }
  }
  return readFileTokens();
}

export async function saveGoogleTokens(tokens: StoredGoogleTokens): Promise<boolean> {
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
    console.error("[googleTokens] supabase save failed:", err);
    // Datei-Fallback erfolgreich → trotzdem ok
    return true;
  }
}

export async function deleteGoogleTokens(): Promise<boolean> {
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
      console.error("[googleTokens] supabase delete failed:", err);
      ok = false;
    }
  }
  return ok;
}
