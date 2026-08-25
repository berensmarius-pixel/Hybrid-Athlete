/**
 * Einfaches In-Memory Rate Limiting (Token Bucket) für API-Routen.
 *
 * Passend zum Self-Hosted-Profil (ein Node-Prozess): kein externer Store.
 * Schützt insbesondere die öffentlichen Login-Route gegen Brute-Force und
 * die Python-spawning Garmin-Routen vor Request-Fluten.
 */

interface Bucket {
  /** Verbleibende Tokens als Fließkommazahl */
  tokens: number;
  /** Timestamp (ms) des letzten Refills */
  lastRefill: number;
}

type LimitRule = {
  prefixes: readonly string[];
  capacity: number;
  refillPerMinute: number;
};

/** Spezifischere Regeln zuerst matchen. */
const RULES: readonly LimitRule[] = [
  // Login: Brute-Force-Schutz
  { prefixes: ["/api/auth/login"], capacity: 5, refillPerMinute: 5 },
  // Garmin & Scale: spawnen Python-Prozesse bzw. schreiben Dateien
  { prefixes: ["/api/garmin/", "/api/scale/webhook"], capacity: 12, refillPerMinute: 8 },
];

const DEFAULT_RULE: LimitRule = {
  prefixes: [],
  capacity: 240,
  refillPerMinute: 120,
};

const buckets = new Map<string, Bucket>();

/** Periodisch leere Buckets wegwerfen (Memory-Hygiene). */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const maxIdleMs = 30 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > maxIdleMs) buckets.delete(key);
  }
}

function matchRule(pathname: string): LimitRule {
  return RULES.find((rule) => rule.prefixes.some((p) => pathname.startsWith(p))) ?? DEFAULT_RULE;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Prüft, ob der Request erlaubt ist. Verbraucht bei `true` ein Token.
 * @param identifier stabiler Schlüssel (z. B. IP oder Session-Hash)
 * @param pathname Request-Pfad zur Regel-Auswahl
 */
export function consumeRateLimit(identifier: string, pathname: string): boolean {
  const rule = matchRule(pathname);
  const now = Date.now();
  const key = `${identifier}:${rule.capacity}:${rule.refillPerMinute}`;
  const refillRatePerMs = rule.refillPerMinute / 60_000;

  cleanup(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: rule.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Nachfüllen seit dem letzten Aufruf
  bucket.tokens = Math.min(
    rule.capacity,
    bucket.tokens + (now - bucket.lastRefill) * refillRatePerMs
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function rateLimitedResponse(): Response {
  return Response.json(
    { success: false, error: "Zu viele Anfragen. Bitte kurz warten." },
    { status: 429, headers: { "Retry-After": "15" } }
  );
}
