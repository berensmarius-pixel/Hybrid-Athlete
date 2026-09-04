/**
 * Zentrale Definition aller serverseitig synchronisierten Storage-Keys.
 *
 * Wird von Client (stateStore / usePersistentState) UND Server
 * (/api/state Allowlist) importiert – daher ohne Browser-APIs.
 */

/** Server-gepflegte Keys der Garmin-Webhook-Pipeline (Worker ↔ Dashboard). */
export const TRAINING_LOAD_STATE_KEY = "hybrid_athlete_training_load";
export const DEBRIEFS_STATE_KEY = "hybrid_athlete_debriefs";
export const REPLENISHMENT_STATE_KEY = "hybrid_athlete_replenishment";
export const GARMIN_ACTIVITIES_STATE_KEY = "hybrid_athlete_garmin_activities";

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
  // Trainingslast & Post-Workout-Feed (vom Garmin-Webhook-Worker gepflegt)
  TRAINING_LOAD_STATE_KEY,
  DEBRIEFS_STATE_KEY,
  REPLENISHMENT_STATE_KEY,
  // Coach
  "hybrid_athlete_chat",
  "hybrid_athlete_coach_memory",
  "hybrid_athlete_deload_applied",
  // Körper & Gesundheit
  "hybrid_athlete_body_weight",
  "hybrid_athlete_checkins",
  // Ernährung & Vorrat
  "hybrid_athlete_nutrition_logs",
  "hybrid_athlete_nutrition_goals",
  "hybrid_athlete_custom_foods",
  "hybrid_athlete_shopping_list",
  "hybrid_athlete_refuel_plans",
  "hybrid_athlete_pantry_items",
  // Mikronährstoffe & Biomarker
  "hybrid_athlete_biomarkers",
  "hybrid_athlete_micro_profile",
  // Garmin
  "hybrid_athlete_garmin_health",
  GARMIN_ACTIVITIES_STATE_KEY,
  // Background-Pipeline (Inngest): Trainings-Metriken & Debriefs
  "hybrid_athlete_power_duration_curve",
  "hybrid_athlete_daily_tss",
  "hybrid_athlete_fitness_fatigue",
  "hybrid_athlete_activity_debriefs",
  // Strava (Basis-Daten; Tokens separat, siehe SECRET_KEYS)
  "hybrid_athlete_strava",
  "hybrid_athlete_strava_activities",
  // Kalender & Standort
  "hybrid_athlete_google_calendar_events",
  "hybrid_athlete_google_ical_url",
  "hybrid_athlete_saved_location",
  "hybrid_athlete_home_address",
  "hybrid-athlete-calendar-overrides",
  // Fitness-Profil & Power-Benchmarks
  "hybrid_athlete_fitness_profile",
  "hybrid_athlete_power_benchmarks",
  "hybrid_athlete_power_zones",
] as const;

/**
 * Secrets: haben eigene dedizierte Server-Endpoints (siehe unten) und werden
 * bewusst vom Backup-Export ausgeschlossen sowie im Client nie abgelegt.
 */
export const SECRET_STRAVA_TOKENS_KEY = "hybrid_athlete_strava_tokens";
export const SECRET_GEMINI_KEY = "hybrid_athlete_gemini_key";
export const SECRET_GOOGLE_TOKENS_KEY = "hybrid_athlete_google_tokens";

export const SECRET_KEYS = [
  SECRET_STRAVA_TOKENS_KEY,
  SECRET_GEMINI_KEY,
  SECRET_GOOGLE_TOKENS_KEY,
] as const;

/**
 * Secrets laufen bewusst NICHT über /api/state – sie haben eigene,
 * dedizierte Endpoints (/api/settings/gemini-key, /api/settings/strava-tokens),
 * damit GET /api/state niemals Credentials ausliefern kann.
 */
export function isSecretKey(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

/** Keys, die die Server-Route akzeptiert (bewusst ohne Secrets). */
export const ALLOWED_KEYS: readonly string[] = [...SYNCED_KEYS];

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
  "hybrid_athlete_gcal_oauth_state",
] as const;
