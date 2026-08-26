import type { StravaActivity } from "@/types";

/**
 * Typen für den Strava-Integrations-Adapter (OAuth, Sync, Webhooks).
 * Globale Domänen-Typen bleiben in @/types – hier ausschließlich
 * Integration-spezifische Shapes.
 */

// ─── OAuth ────────────────────────────────────────────────────────────────────

/** OAuth-Scope: Basis-Lesezugriff + alle Aktivitäten + Beschreibungs-Upload. */
export const STRAVA_OAUTH_SCOPE = "read,activity:read_all,activity:write";

export interface StravaTokenSet {
  accessToken: string;
  refreshToken: string;
  /** UNIX-Sekunden (Strava-Format) */
  expiresAt: number;
}

// ─── Strava API ───────────────────────────────────────────────────────────────

/** DetailedActivity aus GET /api/v3/activities/{id} (Superset des Summary-Shapes). */
export interface StravaDetailedActivity extends StravaActivity {
  description?: string;
  calories?: number;
  kilojoules?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  device_watts?: boolean;
  athlete_weight?: number;
}

/** Zone-Bucket aus GET /api/v3/activities/{id}/zones */
export interface StravaZoneBucket {
  min: number;
  max: number;
  /** Verweildauer in Sekunden innerhalb des Buckets */
  time: number;
}

export interface StravaZonesResponse {
  type: string;
  distribution_buckets?: StravaZoneBucket[];
  buckets?: StravaZoneBucket[];
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

/** Event-Payload gemäß https://developers.strava.com/docs/webhooks/ */
export interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  /** Nur bei update: betroffene Felder (z. B. {"title": "..."} oder {"authorized": "false"}) */
  updates?: Record<string, string>;
  owner_id: number;
  subscription_id: number;
  /** UNIX-Sekunden */
  event_time: number;
}

// ─── Sync-Ergebnisse ──────────────────────────────────────────────────────────

export type IngestStatus =
  | "imported"
  | "duplicate"
  | "unsupported_sport"
  | "not_persisted"
  | "error";

export interface IngestResult {
  status: IngestStatus;
  stravaId: number;
  /** ID der erzeugten EnduranceSession (nur bei imported) */
  sessionId?: string;
  detail?: string;
}

export interface SyncResult {
  fetched: number;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
}
