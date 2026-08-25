/**
 * Zentraler API-Auth-Layer (Edge-kompatibel, nur Web Crypto).
 *
 * Schutzmodell für LAN-Betrieb:
 *  - APP_API_SECRET gesetzt  → alle /api/* Routen verlangen entweder
 *    einen gültigen Session-Cookie (Browser, via /api/auth/login) oder
 *    `Authorization: Bearer <APP_API_SECRET>` / `x-api-key` (Geräte wie die Pi-Bridge).
 *  - APP_API_SECRET nicht gesetzt → offen (reine lokale Entwicklung).
 */

const SESSION_COOKIE = "ha_session";
const MIN_SECRET_LENGTH = 16;

function getApiSecret(): string | null {
  const secret = process.env.APP_API_SECRET;
  if (typeof secret !== "string") return null;
  const trimmed = secret.trim();
  return trimmed.length >= MIN_SECRET_LENGTH ? trimmed : null;
}

export function isAuthConfigured(): boolean {
  return getApiSecret() !== null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Konstantzeit-Vergleich für gleich lange Hex-Strings. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Wert des HttpOnly Session-Cookies – abgeleitet aus dem Secret, zustandslos. */
export async function computeSessionToken(): Promise<string> {
  return sha256Hex(`${getApiSecret()}:hybrid-athlete-session-v1`);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const secret = getApiSecret();
  if (!secret || !password) return false;
  const presented = await sha256Hex(password);
  const expected = await sha256Hex(secret);
  return constantTimeEqual(presented, expected);
}

/** Prüft Cookie ODER Bearer/x-api-key gegen das konfigurierte Secret. */
export async function verifyRequest(request: Request): Promise<boolean> {
  const secret = getApiSecret();
  if (!secret) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const apiKeyHeader = request.headers.get("x-api-key")?.trim() ?? "";
  const presentedSecret = bearer || apiKeyHeader;

  if (presentedSecret) {
    const presentedHash = await sha256Hex(presentedSecret);
    const expectedHash = await sha256Hex(secret);
    if (constantTimeEqual(presentedHash, expectedHash)) return true;
  }

  const cookieMatch = request.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (cookieMatch) {
    let presentedCookie = cookieMatch[1];
    try {
      presentedCookie = decodeURIComponent(presentedCookie);
    } catch {
      // roher Wert verwenden
    }
    if (constantTimeEqual(presentedCookie, await computeSessionToken())) {
      return true;
    }
  }

  return false;
}

/** Kalender-Clients können keine Header senden → Token als Query-Parameter. */
export async function verifyFeedToken(token: string): Promise<boolean> {
  const secret = getApiSecret();
  if (!secret) return true;
  if (!token) return false;
  return constantTimeEqual(token, await computeSessionToken());
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { success: false, error: "Nicht autorisiert" },
    { status: 401 }
  );
}
