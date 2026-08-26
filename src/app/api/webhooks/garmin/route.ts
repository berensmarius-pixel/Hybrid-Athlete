// ─── Garmin Push-Notification Webhook ────────────────────────────────────────
//
// POST /api/webhooks/garmin
//
// Empfängt Garmin Connect Push Notifications (ACTIVITY_DETAILS, SLEEP,
// PULSE_OX, …), validiert den Absender und quittiert SOFORT mit 200 OK
// (Garmin-Webhook-SLA). Die komplette Verarbeitung (FIT/JSON-Download,
// Metriken-Parsing, ATL/CTL/TSB-Update, AI-Debrief, Push) läuft als
// Hintergrund-Job via next/server `after()`.
//
// Authentifizierung (siehe lib/server/garminWebhook.ts):
//   1. HMAC-SHA256-Signatur  → Header `x-signature: sha256=<hex>` über den Roh-Body
//   2. Shared Secret         → `Authorization: Bearer`, `x-api-key` oder `?token=`
//      gegen GARMIN_WEBHOOK_SECRET (Fallback: APP_API_SECRET wie die Pi-Bridge)
//
// Registration in Garmin Connect:
//   PUSH-Endpoint-URL: https://<host>/api/webhooks/garmin?token=<GARMIN_WEBHOOK_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  normalizeGarminPush,
  verifyWebhookAuth,
} from "@/lib/server/garminWebhook";
import {
  processActivityWebhook,
  recordSkippedEvent,
} from "@/lib/server/garminWebhookWorker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: Konfigurations-/Health-Probe (gleiche Auth wie POST). */
export async function GET(req: NextRequest) {
  const raw = "";
  if (!verifyWebhookAuth(req, raw)) {
    return NextResponse.json({ success: false, error: "Nicht autorisiert" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    endpoint: "garmin-push",
    configured: Boolean(
      process.env.GARMIN_WEBHOOK_SECRET?.trim() || process.env.APP_API_SECRET?.trim()
    ),
    supportedDataTypes: ["ACTIVITY_DETAILS", "SLEEP", "PULSE_OX"],
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ success: false, error: "Body nicht lesbar" }, { status: 400 });
  }

  if (!verifyWebhookAuth(req, rawBody)) {
    return NextResponse.json({ success: false, error: "Nicht autorisiert" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || "{}");
  } catch {
    // Garmin erwartet auch bei Müll kein Retry-Sturm – 200 mit Quittung
    return NextResponse.json({ received: true, note: "ungültiges JSON ignoriert" });
  }

  const push = normalizeGarminPush(parsed);
  const jobs: Promise<void>[] = [];

  for (const activityId of push.activityIds.slice(0, 10)) {
    const eventKey = `${push.kind}:${activityId}`;
    const job = processActivityWebhook(
      activityId,
      { dataType: push.kind, eventKey, userId: push.userId, source: "garmin-push" },
      parsed
    );
    jobs.push(job);
  }

  // Health-/Nicht-Aktivitäts-Events: protokollieren, keine Pipeline
  if (jobs.length === 0 && push.kind !== "OTHER") {
    const eventKey = `${push.kind}:health:${new Date().toISOString()}`;
    after(() =>
      recordSkippedEvent(
        { dataType: push.kind, eventKey, userId: push.userId, source: "garmin-push" },
        "Health-Event ohne Aktivitäts-ID – noch nicht verarbeitet"
      )
    );
  }

  // Hintergrundverarbeitung NACH der Antwort (Garmin-SLA: schnelles ACK)
  if (jobs.length > 0) {
    after(() => Promise.allSettled(jobs));
  }

  return NextResponse.json({
    received: true,
    kind: push.kind,
    activitiesQueued: jobs.length,
  });
}
