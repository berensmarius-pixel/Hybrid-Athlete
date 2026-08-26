import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Server-seitige Gemini-Key-Auflösung:
 * 1. app_state `hybrid_athlete_gemini_key` (via UI gesetzt)
 * 2. Fallback ohne Supabase: lokale Datei `.server_state/gemini_key.txt`
 * 3. Env GEMINI_API_KEY + optional GEMINI_BACKUP_API_KEY (zweites AI-Studio-
 *    Projekt; der Router rotiert bei 429/Quota automatisch auf den Backup-Key)
 *
 * Der Key verlässt den Server nie Richtung Client.
 */

const STATE_DIR = path.join(process.cwd(), ".server_state");
const STATE_FILE = path.join(STATE_DIR, "gemini_key.txt");
const APP_STATE_KEY = "hybrid_athlete_gemini_key";

async function readFileKey(): Promise<string> {
  try {
    const raw = (await readFile(STATE_FILE, "utf8")).trim();
    return raw;
  } catch {
    return "";
  }
}

export async function resolveGeminiKeyServer(): Promise<string> {
  return (await resolveGeminiKeysServer())[0] ?? "";
}

/**
 * Alle konfigurierten Keys in Prioritäts-Reihenfolge (dedupliziert).
 * Der AI-Router probiert sie bei 429/Quota/503 nacheinander durch.
 */
export async function resolveGeminiKeysServer(): Promise<string[]> {
  const keys: string[] = [];

  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", APP_STATE_KEY)
        .maybeSingle();
      const stored = data?.value;
      if (typeof stored === "string" && stored.trim()) keys.push(stored.trim());
    } catch { /* fall through zu Datei/Env */ }
  }

  const fileKey = await readFileKey();
  if (fileKey) keys.push(fileKey);

  for (const envKey of [process.env.GEMINI_API_KEY, process.env.GEMINI_BACKUP_API_KEY]) {
    const trimmed = envKey?.trim();
    if (trimmed) keys.push(trimmed);
  }

  return [...new Set(keys)];
}

/** Speichert den Key serverseitig (Supabase wenn konfiguriert + Datei-Fallback). */
export async function saveGeminiKeyServer(key: string): Promise<boolean> {
  const clean = key.trim();
  if (!clean) return false;

  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, `${clean}\n`, "utf8");
  } catch (err) {
    console.error("[geminiKey] file write failed:", err);
  }

  if (isSupabaseConfigured()) {
    try {
      const { error } = await getSupabaseAdmin()
        .from("app_state")
        .upsert(
          { key: APP_STATE_KEY, value: clean, updatedAt: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    } catch (err) {
      console.error("[geminiKey] supabase save failed:", err);
    }
  }
  return true;
}

export async function deleteGeminiKeyServer(): Promise<boolean> {
  try {
    await unlink(STATE_FILE);
  } catch { /* evtl. nicht vorhanden */ }

  if (!isSupabaseConfigured()) return true;
  try {
    const { error } = await getSupabaseAdmin()
      .from("app_state")
      .delete()
      .eq("key", APP_STATE_KEY);
    return !error;
  } catch (err) {
    console.error("[geminiKey] delete failed:", err);
    return false;
  }
}
