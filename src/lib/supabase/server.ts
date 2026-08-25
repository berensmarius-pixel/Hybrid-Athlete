import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-seitiger Supabase-Admin-Client (Singleton).
 *
 * Nutzt ausschließlich den Service-Role-Key und wird NUR in API-Routen
 * (Node-Runtime) importiert – niemals im Client-Bundle.
 * RLS ist auf app_state deny-all; der Service-Role-Key umgeht RLS.
 */

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase nicht konfiguriert: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen."
    );
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
