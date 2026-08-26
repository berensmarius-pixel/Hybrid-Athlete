// ─── Garmin Push-Webhook: Authentifizierung & Payload-Normalisierung ─────────
//
// Garmin Connect Push Notifications liefern je nach Datenart unterschiedliche
// Shapes (legacy `{activityId}` vs. modern `{pushDataType, activities[]}`).
// Diese Lib validiert den Absender und normiert alles auf Jobs für den
// Background-Worker – bewusst ohne Import von Next/Node-APIs in den reinen
// Parser-Teilen (testbar in Vitest/node).

import { createHmac, timingSafeEqual } from "node:crypto";

// ─── Konstantzeit-Vergleiche ─────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function constantTimeHexEqual(presented: string, expectedHex: string): boolean {
  const p = presented.trim().toLowerCase();
  if (!/^[a-f0-9]+$/.test(p)) return false;
  return safeEqual(p, expectedHex.trim().toLowerCase());
}

// ─── Signaturprüfung (HMAC-SHA256 über den Roh-Body) ─────────────────────────

/** Erwartetes Format des Headers: `sha256=<hex>`. */
export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyHmacSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;
  return constantTimeHexEqual(match[1], hmacSha256Hex(secret, rawBody));
}

// ─── Request-Auth ────────────────────────────────────────────────────────────

export interface WebhookAuthConfig {
  /** Garmin-Webhook-Secret (`GARMIN_WEBHOOK_SECRET`). */
  webhookSecret?: string;
  /** Fallback auf das App-weite API-Secret (`APP_API_SECRET`). */
  appSecret?: string;
}

function extractPresentedSecret(request: Request): string {
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (apiKey) return apiKey;
  try {
    const url = new URL(request.url);
    return url.searchParams.get("token")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Prüft die Webhook-Authentifizierung in dieser Reihenfolge:
 *  1. HMAC-Signatur (`x-signature`/`x-garmin-signature`) gegen GARMIN_WEBHOOK_SECRET
 *  2. Token (`Authorization: Bearer` / `x-api-key` / `?token=`) gegen GARMIN_WEBHOOK_SECRET
 *  3. Fallback: Token gegen APP_API_SECRET (Betrieb wie Pi-Bridge)
 *  4. Ohne jede Secret-Konfiguration: offen (lokale Entwicklung)
 */
export function verifyWebhookAuth(
  request: Request,
  rawBody: string,
  cfg: WebhookAuthConfig = {}
): boolean {
  const webhookSecret = (cfg.webhookSecret ?? process.env.GARMIN_WEBHOOK_SECRET ?? "").trim();
  const appSecret = (cfg.appSecret ?? process.env.APP_API_SECRET ?? "").trim();

  if (!webhookSecret && !appSecret) return true;

  // HMAC-Signatur gegen jedes konfigurierte Secret prüfen (Garmin signiert
  // mit dem registrierten Secret; lokale Automationen oft mit dem App-Secret)
  const signature =
    request.headers.get("x-signature") ?? request.headers.get("x-garmin-signature");
  if (signature) {
    for (const candidate of [webhookSecret, appSecret]) {
      if (candidate && verifyHmacSignature(candidate, rawBody, signature)) return true;
    }
  }

  if (webhookSecret) {
    const presented = extractPresentedSecret(request);
    if (presented && safeEqual(presented, webhookSecret)) return true;
  }

  if (appSecret) {
    const presented = extractPresentedSecret(request);
    if (presented && safeEqual(presented, appSecret)) return true;
  }

  return false;
}

// ─── Payload-Normalisierung ──────────────────────────────────────────────────

export type GarminPushKind =
  | "ACTIVITY_DETAILS"
  | "SLEEP"
  | "PULSE_OX"
  | "BODY_COMPOSITION"
  | "EPOCHS"
  | "OTHER";

export interface NormalizedGarminPush {
  kind: GarminPushKind;
  rawKind: string | null;
  userId?: string;
  /** Numerische Garmin-Aktivitäts-IDs, dedupliziert in Reihenfolge des Auftretens */
  activityIds: string[];
}

const KNOWN_KINDS: readonly GarminPushKind[] = [
  "ACTIVITY_DETAILS",
  "SLEEP",
  "PULSE_OX",
  "BODY_COMPOSITION",
  "EPOCHS",
];

function asNumericString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && /^\d{1,20}$/.test(value.trim())) return value.trim();
  return null;
}

/**
 * Normiert alle bekannten Garmin-Push-Varianten:
 *  - Modern:  { pushDataType: "ACTIVITY_DETAILS", activities: [{ activityId }] }
 *  - Legacy:  { activityId: 1234567, userId: "…" }
 *  - Health:  { pushDataType: "SLEEP" | "PULSE_OX" | …, sleeps/pulseOx: […] }
 */
export function normalizeGarminPush(raw: unknown): NormalizedGarminPush {
  const result: NormalizedGarminPush = {
    kind: "OTHER",
    rawKind: null,
    activityIds: [],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;

  const obj = raw as Record<string, unknown>;

  if (typeof obj.userId === "string" && obj.userId.trim()) {
    result.userId = obj.userId.trim().slice(0, 128);
  }

  const rawKind =
    typeof obj.pushDataType === "string" && obj.pushDataType.trim()
      ? obj.pushDataType.trim().toUpperCase()
      : typeof obj.dataType === "string" && obj.dataType.trim()
        ? obj.dataType.trim().toUpperCase()
        : null;
  result.rawKind = rawKind;

  // Aktivitäts-IDs einsammeln (modernes Array + legacy Top-Level-Feld)
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const id = asNumericString(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      result.activityIds.push(id);
    }
  };

  if (Array.isArray(obj.activities)) {
    for (const item of obj.activities) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        push((item as Record<string, unknown>).activityId);
      } else {
        push(item); // Toleranz: Array von IDs statt Objekten
      }
    }
  }
  push(obj.activityId);

  // Kind ableiten
  const known = KNOWN_KINDS.find((k) => k === rawKind);
  if (known) {
    result.kind = known;
  } else if (result.activityIds.length > 0) {
    // Legacy-Payload ohne pushDataType ⇒ Aktivitäts-Update annehmen
    result.kind = "ACTIVITY_DETAILS";
  }

  return result;
}
