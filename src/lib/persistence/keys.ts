/**
 * Zentrale Definition aller serverseitig synchronisierten Storage-Keys.
 *
 * Wird von Client (stateStore / usePersistentState) UND Server
 * (/api/state Allowlist) importiert – daher ohne Browser-APIs.
 */

/** Keys, die per Write-through nach Supabase gespiegelt werden. */
export const SYNCED_KEYS = [
  // Plan & Templates
  "hybrid-athlete-weekly-plan",
  "hybrid-athlete-gym-templates",
  "hybrid_athlete_endurance_templates",
  // Training
  "hybrid_athlete_sessions",
  "hybrid_athlete_active_session",
  "hybrid_athlete_prs",
  "hybrid_athlete_routes",
  // Coach
  "hybrid_athlete_chat",
  "hybrid_athlete_coach_memory",
  // Körper & Gesundheit
  "hybrid_athlete_body_weight",
  // Ernährung
  "hybrid_athlete_nutrition_logs",
  "hybrid_athlete_nutrition_goals",
  "hybrid_athlete_custom_foods",
  "hybrid_athlete_shopping_list",
  // Garmin
  "hybrid_athlete_garmin_health",
  "hybrid_athlete_garmin_activities",
  // Strava (Basis-Daten; Tokens separat, siehe SECRET_KEYS)
  "hybrid_athlete_strava",
  "hybrid_athlete_strava_activities",
  // Kalender & Standort
  "hybrid_athlete_google_calendar_events",
  "hybrid_athlete_google_ical_url",
  "hybrid_athlete_saved_location",
  "hybrid_athlete_home_address",
] as const;

/**
 * Secrets: laufen ebenfalls über app_state, werden aber bewusst vom
 * Backup-Export ausgeschlossen und im Client nie in localStorage abgelegt.
 */
export const SECRET_STRAVA_TOKENS_KEY = "hybrid_athlete_strava_tokens";
export const SECRET_GEMINI_KEY = "hybrid_athlete_gemini_key";

export const SECRET_KEYS = [
  SECRET_STRAVA_TOKENS_KEY,
  SECRET_GEMINI_KEY,
] as const;

/** Alle Keys, die die Server-Route akzeptiert. */
export const ALLOWED_KEYS: readonly string[] = [...SYNCED_KEYS, ...SECRET_KEYS];

export function isAllowedKey(key: string): boolean {
  return ALLOWED_KEYS.includes(key);
}

/**
 * Backup-Coverage: alles synchronisierte außer Secrets
 * (Secrets landen nicht in exportierbaren Dateien).
 */
export const BACKUP_KEYS: readonly string[] = [...SYNCED_KEYS];

/** Device-lokale Caches, die NICHT gespiegelt werden. */
export const LOCAL_ONLY_KEYS = [
  "hybrid_athlete_weather_cache",
  "hybrid_athlete_strava_oauth_state",
] as const;
