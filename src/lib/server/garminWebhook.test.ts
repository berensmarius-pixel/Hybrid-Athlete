import { describe, expect, it } from "vitest";
import {
  hmacSha256Hex,
  normalizeGarminPush,
  verifyHmacSignature,
  verifyWebhookAuth,
} from "./garminWebhook";

describe("normalizeGarminPush", () => {
  it("parst moderne ACTIVITY_DETAILS-Payloads mit activities[]", () => {
    const push = normalizeGarminPush({
      userId: "abc-123",
      pushDataType: "ACTIVITY_DETAILS",
      activities: [{ activityId: 1849302918 }, { activityId: "283749102" }],
    });
    expect(push.kind).toBe("ACTIVITY_DETAILS");
    expect(push.userId).toBe("abc-123");
    expect(push.activityIds).toEqual(["1849302918", "283749102"]);
  });

  it("parst Legacy-Payload ohne pushDataType", () => {
    const push = normalizeGarminPush({ activityId: 1234567890, userId: "u1" });
    expect(push.kind).toBe("ACTIVITY_DETAILS");
    expect(push.activityIds).toEqual(["1234567890"]);
  });

  it("erkennt SLEEP/PULSE_OX als Health-Events ohne Aktivität", () => {
    const sleep = normalizeGarminPush({ pushDataType: "SLEEP", sleeps: [{ summaryId: "s1" }] });
    expect(sleep.kind).toBe("SLEEP");
    expect(sleep.activityIds).toEqual([]);

    const ox = normalizeGarminPush({ pushDataType: "pulse_ox", pulseOxs: [] });
    expect(ox.kind).toBe("PULSE_OX");
  });

  it("dedupliziert doppelte IDs und ignoriert ungültige Werte", () => {
    const push = normalizeGarminPush({
      pushDataType: "ACTIVITY_DETAILS",
      activityId: 42,
      activities: [{ activityId: 42 }, { activityId: "drop-table" }, null],
    });
    expect(push.activityIds).toEqual(["42"]);
  });

  it("andere Datenarten landen als OTHER", () => {
    const push = normalizeGarminPush({ pushDataType: "EPOCHS", epochs: [] });
    expect(push.kind).toBe("EPOCHS");
  });

  it("überlebt Müll-Eingaben", () => {
    expect(normalizeGarminPush(null).kind).toBe("OTHER");
    expect(normalizeGarminPush("nope").activityIds).toEqual([]);
    expect(normalizeGarminPush([1, 2]).kind).toBe("OTHER");
  });
});

describe("verifyHmacSignature", () => {
  const secret = "whsec_test_123";
  const body = JSON.stringify({ pushDataType: "ACTIVITY_DETAILS", activityId: 99 });
  const sig = `sha256=${hmacSha256Hex(secret, body)}`;

  it("akzeptiert korrekte Signatur", () => {
    expect(verifyHmacSignature(secret, body, sig)).toBe(true);
    // case-insensitive Hex + Whitespace-Toleranz
    expect(verifyHmacSignature(secret, body, sig.toUpperCase())).toBe(true);
    expect(verifyHmacSignature(secret, body, ` sha256=${hmacSha256Hex(secret, body)} `)).toBe(true);
  });

  it("lehnt fremde/geänderte Signaturen ab", () => {
    expect(verifyHmacSignature("other-secret", body, sig)).toBe(false);
    expect(verifyHmacSignature(secret, `${body} `, sig)).toBe(false);
    expect(verifyHmacSignature(secret, body, "sha256=deadbeef")).toBe(false);
    expect(verifyHmacSignature(secret, body, null)).toBe(false);
    expect(verifyHmacSignature(secret, body, "md5=abcdef")).toBe(false);
  });
});

describe("verifyWebhookAuth", () => {
  const makeRequest = (headers: Record<string, string> = {}, token?: string) =>
    new Request(`https://app.local/api/webhooks/garmin${token ? `?token=${token}` : ""}`, {
      method: "POST",
      headers,
      body: "{}",
    });

  it("offen ohne konfigurierte Secrets (Dev-Betrieb)", () => {
    expect(
      verifyWebhookAuth(makeRequest(), "{}", { webhookSecret: "", appSecret: "" })
    ).toBe(true);
  });

  it("akzeptiert Token via x-api-key / Bearer / Query", () => {
    for (const req of [
      makeRequest({ "x-api-key": "sec1" }),
      makeRequest({ authorization: "Bearer sec1" }),
      makeRequest({}, "sec1"),
    ]) {
      expect(verifyWebhookAuth(req, "{}", { webhookSecret: "sec1", appSecret: "" })).toBe(true);
    }
  });

  it("lehnt falsches Token ab", () => {
    const req = makeRequest({ "x-api-key": "wrong" });
    expect(verifyWebhookAuth(req, "{}", { webhookSecret: "sec1", appSecret: "" })).toBe(false);
  });

  it("fällt auf APP_API_SECRET zurück", () => {
    const req = makeRequest({ "x-api-key": "appsecret" });
    expect(verifyWebhookAuth(req, "{}", { webhookSecret: "sec1", appSecret: "appsecret" })).toBe(
      true
    );
  });

  it("HMAC-Signatur genügt auch ohne Token-Header", () => {
    const body = JSON.stringify({ pushDataType: "SLEEP" });
    const sig = `sha256=${hmacSha256Hex("sec1", body)}`;
    const req = new Request("https://app.local/api/webhooks/garmin", {
      method: "POST",
      headers: { "x-signature": sig },
      body,
    });
    expect(verifyWebhookAuth(req, body, { webhookSecret: "sec1", appSecret: "" })).toBe(true);
  });

  it("HMAC gegen APP_API_SECRET wird akzeptiert, wenn kein Webhook-Secret gesetzt ist", () => {
    const body = JSON.stringify({ pushDataType: "ACTIVITY_DETAILS", activityId: 7 });
    const sig = `sha256=${hmacSha256Hex("appsecret", body)}`;
    const req = new Request("https://app.local/api/webhooks/garmin", {
      method: "POST",
      headers: { "x-signature": sig },
      body,
    });
    expect(verifyWebhookAuth(req, body, { webhookSecret: "", appSecret: "appsecret" })).toBe(
      true
    );
  });
});
