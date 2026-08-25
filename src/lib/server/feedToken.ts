import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { constantTimeEqual } from "@/lib/apiAuth";

/**
 * Server-seitiges, rotierbares Kalender-Feed-Token.
 *
 * Bewusst vom Session-Cookie entkoppelt: Wer die ICS-Abo-URL leakt
 * (Kalender-App, Logs), verliert maximal den Feed-Zugriff – nicht den
 * gesamten API-Zugriff. Rotation über POST /api/calendar/feed-token.
 *
 * Ablageort: `.server_state/feed_token.json` (nur SHA-256-Hash des Tokens,
 * nie der Klartext). Das Verzeichnis ist via .gitignore abgedeckt.
 */

const STATE_DIR = path.join(process.cwd(), ".server_state");
const STATE_FILE = path.join(STATE_DIR, "feed_token.json");

interface FeedTokenState {
  /** SHA-256-Hex des aktiven Feed-Tokens. */
  tokenHash: string;
  createdAt: string;
  rotatedAt?: string;
}

function sha256Hex(input: string): Promise<string> {
  return Promise.resolve(createHash("sha256").update(input).digest("hex"));
}

async function readState(): Promise<FeedTokenState | null> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<FeedTokenState>;
    if (typeof parsed?.tokenHash === "string" && parsed.tokenHash.length === 64) {
      return { tokenHash: parsed.tokenHash, createdAt: parsed.createdAt ?? "" };
    }
    return null;
  } catch {
    return null;
  }
}

async function writeState(state: FeedTokenState): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

/** Erzeugt ein neues zufälliges Feed-Token und speichert nur dessen Hash. */
export async function rotateFeedToken(): Promise<string> {
  const previous = await readState();
  const token = randomBytes(32).toString("hex");
  await writeState({
    tokenHash: await sha256Hex(token),
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    rotatedAt: new Date().toISOString(),
  });
  return token;
}

/**
 * Liefert das aktuelle Feed-Token in Klartext (für die Abo-URL im UI).
 * Erzeugt lazy ein neues Token beim ersten Aufruf. Der Klartext liegt
 * ausschließlich serverseitig in `.server_state/feed_token.txt`.
 */
export async function getFeedToken(): Promise<string> {
  const plain = await readPlainToken();
  if (plain) return plain;
  return rotateAndGet();
}

const PLAIN_FILE = path.join(STATE_DIR, "feed_token.txt");

async function readPlainToken(): Promise<string | null> {
  try {
    const raw = (await readFile(PLAIN_FILE, "utf8")).trim();
    return raw.length >= 32 ? raw : null;
  } catch {
    return null;
  }
}

async function rotateAndGet(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await writeState({
    tokenHash: await sha256Hex(token),
    createdAt: new Date().toISOString(),
  });
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(PLAIN_FILE, `${token}\n`, "utf8");
  return token;
}

/**
 * Prüft ein präsentiertes Feed-Token: immer zuerst hashen (gleiche
 * Länge wie Vergleichswert), dann konstantzeit-vergleichen – kein
 * Timing-Leak über die Eingabelänge.
 */
export async function verifyFeedTokenValue(presented: string): Promise<boolean> {
  if (!presented) return false;
  const state = await readState();
  if (!state) {
    // Noch kein Token initialisiert → erstes GET erzeugt eines;
    // unbekannte Tokens ablehnen.
    return false;
  }
  const presentedHash = await sha256Hex(presented);
  return constantTimeEqual(presentedHash, state.tokenHash);
}
