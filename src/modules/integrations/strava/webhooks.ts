/**
 * Strava Webhook-Verarbeitung.
 *
 * GET  /api/webhooks/strava → Subscription-Verification (hub.challenge Echo)
 * POST /api/webhooks/strava → Events (create/update/delete für activity/athlete)
 *
 * Event-Routing:
 *   activity create → Detail-Fetch → Dedup-Ingest → Beschreibungs-Upload
 *   activity update → Beschreibung mit frischen Metriken aktualisieren
 *   activity delete → automatisch importierte Session entfernen
 *   athlete  update (authorized=false) → serverseitige Tokens löschen (Deauthorize)
 */

import type { StravaActivity } from "@/types";
import {
  getStravaActivity,
  getStravaActivityZones,
  updateStravaActivityDescription,
} from "./client";
import { ingestStravaActivity, removeStravaImport } from "./sync";
import { computeCoachingMetrics } from "./metrics";
import { buildCoachingDescription } from "./description";
import type { StravaWebhookEvent } from "./types";
import { deleteStravaTokens } from "@/lib/server/stravaTokens";

// ─── Subscription-Verifikation ────────────────────────────────────────────────

/**
 * Validiert den Subscription-Handshake. Gibt das zu echoende Challenge zurück
 * oder null bei ungültigem/falschem Verify-Token.
 */
export function verifyWebhookChallenge(
  params: URLSearchParams,
  expectedVerifyToken: string | undefined
): string | null {
  if (!expectedVerifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (params.get("hub.verify_token") !== expectedVerifyToken) return null;

  const challenge = params.get("hub.challenge");
  // Strava verlangt ein nicht-leeres Challenge-Echo
  return challenge && challenge.length > 0 ? challenge : null;
}

// ─── Event-Parsing ────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Strava sendet IDs/Timestamps als echte JSON-Numbers – strikt prüfen. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Strikte Validierung des Webhook-Body (Schutz vor manipulierten Requests). */
export function parseWebhookEvent(body: unknown): StravaWebhookEvent | null {
  if (!isRecord(body)) return null;

  const objectType = body.object_type;
  const aspectType = body.aspect_type;

  if (objectType !== "activity" && objectType !== "athlete") return null;
  if (aspectType !== "create" && aspectType !== "update" && aspectType !== "delete") {
    return null;
  }
  if (
    !isFiniteNumber(body.object_id) ||
    !isFiniteNumber(body.owner_id) ||
    !isFiniteNumber(body.subscription_id) ||
    !isFiniteNumber(body.event_time)
  ) {
    return null;
  }

  const updates: Record<string, string> = {};
  if (isRecord(body.updates)) {
    for (const [k, v] of Object.entries(body.updates)) {
      if (typeof v === "string") updates[k] = v;
    }
  }

  return {
    object_type: objectType,
    aspect_type: aspectType,
    object_id: body.object_id,
    owner_id: body.owner_id,
    subscription_id: body.subscription_id,
    event_time: body.event_time,
    updates,
  };
}

/** Optional: Events fremder Subscriptions ablehnen (Env STRAVA_WEBHOOK_SUBSCRIPTION_ID). */
export function isSubscriptionAllowed(
  event: StravaWebhookEvent,
  expectedSubscriptionId: string | undefined
): boolean {
  if (!expectedSubscriptionId) return true; // nicht konfiguriert → alle akzeptieren
  return String(event.subscription_id) === expectedSubscriptionId;
}

// ─── Event-Handling ───────────────────────────────────────────────────────────

export interface WebhookOutcome {
  action:
    | "imported"
    | "duplicate"
    | "description_refreshed"
    | "description_unchanged"
    | "session_removed"
    | "deauthorized"
    | "ignored"
    | "error";
  detail?: string;
}

async function refreshDescription(objectId: number): Promise<WebhookOutcome> {
  const detailed = await getStravaActivity(objectId);
  if (!detailed) {
    return { action: "error", detail: `Aktivität ${objectId} nicht abrufbar` };
  }

  // Kein Sync-Ziel (z. B. Gewichtheben) → keine Beschreibung anfassen
  if (
    !(
      detailed.sport_type === "Run" ||
      detailed.sport_type === "Ride" ||
      detailed.type === "Run" ||
      detailed.type === "Ride"
    )
  ) {
    return { action: "ignored", detail: `sport ${detailed.sport_type ?? detailed.type}` };
  }

  const zones = await getStravaActivityZones(objectId).catch(() => null);
  const metrics = computeCoachingMetrics(detailed, zones);

  // Beschreibung nur schreiben, wenn sich etwas ändert (idempotente PUTs sparen)
  const next = buildCoachingDescription(metrics);
  if (detailed.description?.trim() === next) {
    return { action: "description_unchanged" };
  }

  const ok = await updateStravaActivityDescription(objectId, next);
  return ok ? { action: "description_refreshed" } : { action: "error", detail: "PUT fehlgeschlagen" };
}

/** Verarbeitet einen einzelnen validierten Webhook-Event. */
export async function handleWebhookEvent(
  event: StravaWebhookEvent
): Promise<WebhookOutcome> {
  // Deauthorize: User hat die App in den Strava-Einstellungen entfernt
  if (
    event.object_type === "athlete" &&
    event.aspect_type === "update" &&
    event.updates?.authorized === "false"
  ) {
    await deleteStravaTokens();
    return { action: "deauthorized" };
  }

  if (event.object_type !== "activity") {
    return { action: "ignored" };
  }

  switch (event.aspect_type) {
    case "create": {
      const detailed = await getStravaActivity(event.object_id);
      const summary: StravaActivity | null = detailed
        ? {
            id: detailed.id,
            name: detailed.name,
            type: detailed.type,
            sport_type: detailed.sport_type,
            start_date: detailed.start_date,
            start_date_local: detailed.start_date_local,
            distance: detailed.distance,
            moving_time: detailed.moving_time,
            elapsed_time: detailed.elapsed_time,
            average_heartrate: detailed.average_heartrate,
            max_heartrate: detailed.max_heartrate,
            average_speed: detailed.average_speed,
            total_elevation_gain: detailed.total_elevation_gain,
            map: detailed.map,
          }
        : null;

      if (!summary) {
        return { action: "error", detail: `Aktivität ${event.object_id} nicht abrufbar` };
      }

      const result = await ingestStravaActivity(summary, { detailed });
      return {
        action:
          result.status === "imported"
            ? "imported"
            : result.status === "duplicate"
              ? "duplicate"
              : "ignored",
        detail: result.detail,
      };
    }

    case "update":
      return refreshDescription(event.object_id);

    case "delete": {
      const removed = await removeStravaImport(event.object_id);
      return removed
        ? { action: "session_removed" }
        : { action: "ignored", detail: "keine importierte Session gefunden" };
    }

    default:
      return { action: "ignored" };
  }
}
