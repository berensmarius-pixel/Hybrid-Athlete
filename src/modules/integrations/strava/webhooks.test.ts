import { describe, expect, it } from "vitest";
import {
  verifyWebhookChallenge,
  parseWebhookEvent,
  isSubscriptionAllowed,
} from "./webhooks";

describe("verifyWebhookChallenge", () => {
  it("echoes hub.challenge on a valid handshake", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret",
      "hub.challenge": "abc123",
    });
    expect(verifyWebhookChallenge(params, "secret")).toBe("abc123");
  });

  it("rejects wrong verify token", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "abc123",
    });
    expect(verifyWebhookChallenge(params, "secret")).toBeNull();
  });

  it("rejects denials and unconfigured state", () => {
    const deny = new URLSearchParams({ "hub.mode": "denied", "hub.verify_token": "s", "hub.challenge": "c" });
    expect(verifyWebhookChallenge(deny, "s")).toBeNull();
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "s", "hub.challenge": "c" });
    expect(verifyWebhookChallenge(ok, undefined)).toBeNull();
  });
});

describe("parseWebhookEvent", () => {
  const valid = {
    object_type: "activity",
    object_id: 12345678,
    aspect_type: "create",
    updates: {},
    owner_id: 87654321,
    subscription_id: 1,
    event_time: 1_782_000_000,
  };

  it("accepts a valid activity create event", () => {
    const event = parseWebhookEvent(valid);
    expect(event).toEqual(valid);
  });

  it("rejects numeric strings (Strava sendet echte JSON-Numbers)", () => {
    expect(parseWebhookEvent({ ...valid, object_id: "12345678" })).toBeNull();
  });

  it("filters non-string update values", () => {
    const event = parseWebhookEvent({
      ...valid,
      updates: { title: "Morning Ride", junk: 42 },
    });
    expect(event?.updates).toEqual({ title: "Morning Ride" });
  });

  it("rejects malformed payloads", () => {
    expect(parseWebhookEvent(null)).toBeNull();
    expect(parseWebhookEvent("string")).toBeNull();
    expect(parseWebhookEvent({ ...valid, object_type: "photo" })).toBeNull();
    expect(parseWebhookEvent({ ...valid, aspect_type: "teleport" })).toBeNull();
    expect(parseWebhookEvent({ ...valid, object_id: "NaN" })).toBeNull();
    expect(parseWebhookEvent({ ...valid, owner_id: null })).toBeNull();
    expect(parseWebhookEvent({ ...valid, subscription_id: undefined })).toBeNull();
  });

  it("parses deauthorization events", () => {
    const event = parseWebhookEvent({
      object_type: "athlete",
      object_id: 99,
      aspect_type: "update",
      updates: { authorized: "false" },
      owner_id: 99,
      subscription_id: 1,
      event_time: 123,
    });
    expect(event?.updates?.authorized).toBe("false");
  });
});

describe("isSubscriptionAllowed", () => {
  const event = parseWebhookEvent({
    object_type: "activity",
    object_id: 1,
    aspect_type: "create",
    owner_id: 1,
    subscription_id: 7,
    event_time: 1,
  })!;

  it("allows everything when no expected id is configured", () => {
    expect(isSubscriptionAllowed(event, undefined)).toBe(true);
  });

  it("filters foreign subscriptions", () => {
    expect(isSubscriptionAllowed(event, "7")).toBe(true);
    expect(isSubscriptionAllowed(event, "8")).toBe(false);
  });
});
