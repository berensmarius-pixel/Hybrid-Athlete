import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Server-seitige Gemini-Key-Auflösung:
 * 1. app_state `hybrid_athlete_gemini_key` (via UI gesetzt)
 * 2. Env GEMINI_API_KEY (serverseitig, nicht Teil des Client-Bundles)
 *
 * Der Key verlässt den Server nie Richtung Client.
 */
export async function resolveGeminiKeyServer(): Promise<string> {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("app_state")
        .select("value")
        .eq("key", "hybrid_athlete_gemini_key")
        .maybeSingle();
      const stored = data?.value;
      if (typeof stored === "string" && stored.trim()) return stored.trim();
    } catch { /* fall through zu Env */ }
  }
  return process.env.GEMINI_API_KEY?.trim() || "";
}
