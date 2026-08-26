/**
 * Strava-Integrations-Adapter (OAuth2, bidirektionaler Sync, Webhooks,
 * Beschreibungs-Upload mit KI-Coaching-Metriken).
 */

export * from "./types";
export {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  getValidAccessToken,
  forceRefresh,
  getOAuthConfig,
  EXPIRY_BUFFER_SECONDS,
} from "./oauth";
export {
  stravaApi,
  listAthleteActivities,
  getStravaActivity,
  getStravaActivityZones,
  updateStravaActivityDescription,
} from "./client";
export {
  TIMESTAMP_TOLERANCE_MS,
  DURATION_TOLERANCE_SECONDS,
  isWithinTolerance,
  findDuplicate,
  sessionToCandidate,
  garminToCandidate,
  type DedupCandidate,
} from "./dedup";
export {
  computeZoneCompliance,
  computeWorkKJ,
  computeCoachingMetrics,
  bucketsToZoneSeconds,
  TARGET_ZONE_INDICES,
  type CoachingMetrics,
} from "./metrics";
export {
  buildCoachingDescription,
  formatThousands,
  DESCRIPTION_SIGNATURE,
} from "./description";
export {
  ingestStravaActivity,
  syncRecentActivities,
  removeStravaImport,
  loadDedupContext,
  isEnduranceSport,
  pushAiCoachingDescription,
} from "./sync";
export {
  verifyWebhookChallenge,
  parseWebhookEvent,
  handleWebhookEvent,
  isSubscriptionAllowed,
  type WebhookOutcome,
} from "./webhooks";
