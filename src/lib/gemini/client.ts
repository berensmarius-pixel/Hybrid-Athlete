/**
 * Zentraler Gemini-Zugriff für Client-Komponenten.
 *
 * Der API-Key wird serverseitig verwaltet (app_state `hybrid_athlete_gemini_key`,
 * Fallback: Env GEMINI_API_KEY auf dem Server) und über den auth-gated Proxy
 * /api/gemini/[...path] genutzt – der Key landet nie im Browser/Bundel.
 *
 * Legacy: Ältere Installationen hatten den Key im localStorage. Die Migration
 * (`migrateLegacyGeminiKey`) schiebt ihn einmalig zum Server und entfernt ihn
 * aus dem Browser.
 */

import { SECRET_GEMINI_KEY } from "@/lib/persistence/keys";

const GEMINI_PROXY_BASE = "/api/gemini/v1beta";
const GEMINI_API_KEY_STORAGE = "hybrid_athlete_gemini_api_key";
const LEGACY_STORAGE_KEYS = ["hybrid_athlete_gemini_key"] as const;

let configuredPromise: Promise<boolean> | null = null;

/** Fragt einmal pro Session ab, ob ein Key existiert (ohne den Key zu laden). */
export function checkGeminiConfigured(): Promise<boolean> {
  if (!configuredPromise) {
    configuredPromise = fetch("/api/gemini/status")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => Boolean(data.configured))
      .catch(() => false);
  }
  return configuredPromise;
}

/** Reset des Caches (z. B. nach dem Speichern eines neuen Keys). */
export function invalidateGeminiConfigCache() {
  configuredPromise = null;
}

/**
 * Speichert den Key serverseitig und räumt lokale Kopien weg.
 */
export async function saveGeminiApiKey(key: string): Promise<boolean> {
  const clean = key.trim();
  if (!clean) return false;
  try {
    const res = await fetch(`/api/state/${SECRET_GEMINI_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: clean }),
    });
    if (!res.ok) return false;
    clearLocalGeminiKeys();
    invalidateGeminiConfigCache();
    return true;
  } catch {
    return false;
  }
}

/** Einmalige Migration: lokaler Key → Server, danach lokale Löschung. */
export async function migrateLegacyGeminiKey(): Promise<void> {
  if (typeof window === "undefined") return;
  const legacy =
    window.localStorage.getItem(GEMINI_API_KEY_STORAGE) ||
    window.localStorage.getItem(LEGACY_STORAGE_KEYS[0]);
  if (!legacy || !legacy.trim()) return;
  await saveGeminiApiKey(legacy);
  // Konnte nicht gespeichert werden (offline / kein Supabase): Key bleibt lokal.
  invalidateGeminiConfigCache();
}

function clearLocalGeminiKeys() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    for (const legacy of LEGACY_STORAGE_KEYS) {
      window.localStorage.removeItem(legacy);
    }
  } catch { /* ignore */ }
}

// ─── Kern-API ─────────────────────────────────────────────────────────────────

export interface GeminiCallOptions {
  model?: string;
  signal?: AbortSignal;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Gemeinsame Ausführung über den Server-Proxy (generateContent).
 * Wirft bei HTTP-Fehlern mit sprechender Nachricht – Aufrufer entscheiden
 * über UX im Fehlerfall.
 */
async function callGeminiParts(
  parts: GeminiPart[],
  opts: GeminiCallOptions = {},
  systemInstruction?: string
): Promise<string> {
  const model = opts.model ?? "gemini-2.5-flash";

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
  };
  if (systemInstruction) {
    body.system_instruction = systemInstruction;
  }

  const res = await fetch(
    `${GEMINI_PROXY_BASE}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    let message = `Gemini HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) message = errJson.error.message;
    } catch { /* ignore */ }
    if (res.status === 400 && message.toLowerCase().includes("key")) {
      message = "Kein gültiger Gemini API-Key konfiguriert.";
    }
    throw new Error(message);
  }

  const data = await res.json();
  const candidates = data?.candidates;
  let text = "";
  const partsOut: unknown[] = candidates?.[0]?.content?.parts ?? [];
  for (const p of partsOut) {
    if (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string") {
      text += (p as { text: string }).text;
    }
  }
  return text.trim();
}

/**
 * Einfacher Text-Call. Wirft bei fehlendem Key, HTTP-Fehlern oder leerer
 * Antwort – Aufrufer entscheiden über UX im Fehlerfall.
 */
export function geminiGenerateText(
  prompt: string,
  opts: GeminiCallOptions = {}
): Promise<string> {
  return callGeminiParts([{ text: prompt }], opts);
}

/**
 * Multimodaler Call (z. B. Foto + Prompt). Parts werden unverändert an
 * generateContent durchgereicht.
 */
export function geminiGenerate(
  parts: GeminiPart[],
  opts: GeminiCallOptions = {}
): Promise<string> {
  return callGeminiParts(parts, opts);
}

// ─── JSON-Hilfsfunktion ───────────────────────────────────────────────────────

/**
 * Extrahiert robust ein JSON-Objekt/-Array aus einer LLM-Antwort:
 * entfernt Markdown-Fences, schneidet begleitenden Text ab und parst.
 */
export function extractJson(raw: string): unknown {
  if (!raw) throw new Error("Leere Antwort erhalten.");

  let text = raw.trim();
  // Markdown-Fences entfernen
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Direkter Versuch
  try {
    return JSON.parse(text);
  } catch { /* weiter suchen */ }

  // Erstes { bzw. [ bis letztes Gegenstück
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start =
    objStart >= 0 && (arrStart < 0 || objStart < arrStart) ? objStart : arrStart;
  if (start >= 0) {
    const endObj = text.lastIndexOf("}");
    const endArr = text.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch { /* fall through */ }
    }
  }

  throw new Error("Antwort enthielt kein valides JSON.");
}
