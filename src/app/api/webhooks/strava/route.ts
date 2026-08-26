/**
 * Strava Webhook Endpoint
 * =======================
 *
 * GET  /api/webhooks/strava
 *   Subscription-Verifikation beim Anlegen des Webhooks (Strava Hub-Protokoll).
 *   Erfordert STRAVA_WEBHOOK_VERIFY_TOKEN (frei wählbar, wird beim Subscribe
 *   mitgeschickt).
 *
 * POST /api/webhooks/strava
 *   Event-Eingang: Rides/Runs werden nach Dedup-Check ins Trainingslog
 *   übernommen und die Aktivitätsbeschreibung in Strava automatisch mit den
 *   KI-Coaching-Metriken aktualisiert. Die Antwort geht sofort zurück, die
 *   Verarbeitung läuft via `after()` im Hintergrund.
 *
 * Environment:
 *   STRAVA_WEBHOOK_VERIFY_TOKEN       – Pflicht für GET + POST-Absicherung
 *   STRAVA_WEBHOOK_SUBSCRIPTION_ID    – optional, Events fremder Subscriptions ablehnen
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  verifyWebhookChallenge,
  parseWebhookEvent,
  handleWebhookEvent,
  isSubscriptionAllowed,
} from "@/modules/integrations/strava";
import { consumeRateLimit, getClientIp, rateLimitedResponse } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";

/** Subscription-Handshake: hub.challenge nur bei gültigem Verify-Token echoen. */
export async function GET(request: NextRequest) {
  const challenge = verifyWebhookChallenge(
    request.nextUrl.searchParams,
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
  );

  if (!challenge) {
    return NextResponse.json(
      { success: false, error: "WEBHOOK_VERIFICATION_FAILED" },
      { status: 403 }
    );
  }

  return NextResponse.json({ "hub.challenge": challenge });
}

/** Event-Empfang (create/update/delete). Immer 200 – Strava retryt sonst endlos. */
export async function POST(request: NextRequest) {
  if (!consumeRateLimit(getClientIp(request), "/api/webhooks/strava")) {
    return rateLimitedResponse();
  }

  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[api/webhooks/strava] STRAVA_WEBHOOK_VERIFY_TOKEN fehlt");
    return NextResponse.json(
      { success: false, error: "Webhook nicht konfiguriert." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültiger JSON-Body." },
      { status: 400 }
    );
  }

  const event = parseWebhookEvent(body);
  if (!event) {
    return NextResponse.json(
      { success: false, error: "Ungültiges Webhook-Event." },
      { status: 400 }
    );
  }

  // Shared Secret zusätzlich zum Subscription-Filter (Strava signiert nicht)
  const headerToken = request.headers.get("x-strava-verify-token");
  if (headerToken && headerToken !== verifyToken) {
    return NextResponse.json(
      { success: false, error: "Verify-Token ungültig." },
      { status: 403 }
    );
  }

  if (!isSubscriptionAllowed(event, process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID)) {
    return NextResponse.json({ success: true, ignored: "subscription_mismatch" });
  }

  after(async () => {
    try {
      const outcome = await handleWebhookEvent(event);
      console.log(`[api/webhooks/strava] ${event.aspect_type} ${event.object_type} #${event.object_id}:`, outcome.action, outcome.detail ?? "");
    } catch (err) {
      console.error("[api/webhooks/strava] handling failed:", err);
    }
  });

  return NextResponse.json({ success: true });
}
