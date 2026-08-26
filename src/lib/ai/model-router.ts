/**
 * Zentraler Modell-Router für alle KI-Aufrufe (AI-Coach, Vision, Reports,
 * Rezepte, PDF-Extraktion).
 *
 * - Prioritäts-Kette über die aktuelle Gemini-3.x-Lineup mit Emergency-Fallback
 * - Automatisches Failover bei 429 (Quota), 503 (Unavailable) und 404
 *   (Modell nicht gefunden) – ohne Verzögerung zum nächsten Eintrag
 * - Gemini-3.x-Parameter-Audit: veraltete Sampling-Parameter
 *   (`temperature`, `topP`, `topK`) werden für 3.6+/3.7-Endpunkte entfernt,
 *   legacy `thinkingBudget` wird auf `thinkingLevel` abgebildet
 *
 * Isomorph einsetzbar (Client + Server): keine Node-Imports.
 */

export type AiFailoverKind = "Quota" | "Unavailable" | "NotFound" | "Error";

export interface AiModelRoute {
  id: string;
  tier: "primary" | "fast" | "lite" | "emergency";
}

/**
 * Prioritätsliste:
 * 1. gemini-3.7-flash       – Primary (Reasoning & Tool-Calling)
 * 2. gemini-3.5-flash       – Fast / hohe Kapazität
 * 3. gemini-3.5-flash-lite  – Ultra-Low-Latency / Rate-Limit-Schild
 * 4. gemini-3.1-flash-lite  – alternativer Lite-Endpunkt
 * 5. gemini-2.5-flash       – Emergency Fallback
 */
export const AI_MODEL_CHAIN: readonly AiModelRoute[] = [
  { id: "gemini-3.7-flash", tier: "primary" },
  { id: "gemini-3.5-flash", tier: "fast" },
  { id: "gemini-3.5-flash-lite", tier: "lite" },
  { id: "gemini-3.1-flash-lite", tier: "lite" },
  { id: "gemini-2.5-flash", tier: "emergency" },
] as const;

export const PRIMARY_MODEL_ID = AI_MODEL_CHAIN[0].id;

/** Nur die IDs in Ketten-Reihenfolge (Drop-in für alte `MODELS`-Arrays). */
export const AI_MODEL_IDS: readonly string[] = AI_MODEL_CHAIN.map((m) => m.id);

/** Default-Denkstufe für Gemini-3.x-Endpunkte (statt legacy thinkingBudget). */
export const DEFAULT_THINKING_LEVEL = "low" as const;
export type ThinkingLevel = "low" | "medium" | "high";

// ─── Versions-Parsing / Fähigkeiten ──────────────────────────────────────────

const GEMINI_VERSION_RE = /^gemini-(\d+)\.(\d+)/;

export function parseGeminiVersion(
  modelId: string
): { major: number; minor: number } | null {
  const m = GEMINI_VERSION_RE.exec(modelId.trim().toLowerCase());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

function versionAtLeast(modelId: string, major: number, minor: number): boolean {
  const v = parseGeminiVersion(modelId);
  if (!v) return false;
  return v.major > major || (v.major === major && v.minor >= minor);
}

/**
 * Gemini 3.6/3.7-Endpunkte: Sampling-Parameter sind veraltet und müssen
 * aus dem Payload entfernt werden. Ältere Modelle (≤3.5, 2.5) erlauben sie.
 */
export function allowsSamplingParams(modelId: string): boolean {
  return !versionAtLeast(modelId, 3, 6);
}

/** Gemini 3.x nutzt `thinking_level` statt dem legacy `thinking_budget`. */
export function usesThinkingLevel(modelId: string): boolean {
  return versionAtLeast(modelId, 3, 0);
}

/**
 * Ketten-Reihenfolge. Ein explizit angefragtes Modell wird vorangestellt
 * (bewusste Wahl wird respektiert), fällt aber bei Quota/503/404 in die
 * normale Kette zurück.
 */
export function getModelChain(requested?: string | null): string[] {
  const ids = AI_MODEL_CHAIN.map((m) => m.id);
  const clean = requested?.trim();
  if (!clean) return ids;
  if (!ids.includes(clean)) return [clean, ...ids];
  return [clean, ...ids.filter((id) => id !== clean)];
}

// ─── Gemini-3.x-Parameter-Audit ──────────────────────────────────────────────

const DEPRECATED_SAMPLING_KEYS = [
  "temperature",
  "topP",
  "top_p",
  "topK",
  "top_k",
] as const;

function budgetToThinkingLevel(budget: unknown): ThinkingLevel {
  const n = typeof budget === "number" ? budget : Number(budget);
  return Number.isFinite(n) && n > 4096 ? "medium" : "low";
}

/**
 * Bereinigt einen GenerateContent-/Interactions-Payload für das Zielmodell:
 * - Entfernt temperature/topP/topK auf Gemini-3.6+/3.7-Endpunkten
 * - Mappt legacy `thinkingBudget` → `thinkingLevel` (Gemini 3.x)
 * - Lässt alles andere unverändert (responseSchema etc.)
 */
export function sanitizeGenerationPayload<
  T extends Record<string, unknown>,
>(modelId: string, payload: T): T {
  const out: Record<string, unknown> = { ...payload };

  const configKey =
    out.generationConfig !== undefined
      ? "generationConfig"
      : out.generation_config !== undefined
        ? "generation_config"
        : null;
  if (!configKey) return out as T;

  const cfg: Record<string, unknown> = {
    ...(out[configKey] as Record<string, unknown>),
  };

  if (!allowsSamplingParams(modelId)) {
    for (const k of DEPRECATED_SAMPLING_KEYS) delete cfg[k];
  }

  for (const tKey of ["thinkingConfig", "thinking_config"] as const) {
    const raw = cfg[tKey];
    if (!raw || typeof raw !== "object") continue;
    const rawCfg = raw as Record<string, unknown>;
    const t: Record<string, unknown> = { ...rawCfg };
    const hasLevel = t.thinkingLevel !== undefined || t.thinking_level !== undefined;

    if (usesThinkingLevel(modelId)) {
      // Legacy `thinkingBudget` ist auf 3.x-Endpunkten veraltet → thinkingLevel.
      const legacyBudget = t.thinkingBudget ?? t.thinking_budget;
      delete t.thinkingBudget;
      delete t.thinking_budget;
      if (!hasLevel) {
        t.thinkingLevel =
          legacyBudget !== undefined
            ? budgetToThinkingLevel(legacyBudget)
            : DEFAULT_THINKING_LEVEL;
      }
    }
    // 2.5-Modelle: thinkingBudget bleibt das korrekte Feld – unverändert.

    cfg[tKey] = t;
  }

  out[configKey] = cfg;
  return out as T;
}

/** Explizites Thinking-Level für Gemini-3.x-Generation-Configs. */
export function buildThinkingConfig(level: ThinkingLevel = DEFAULT_THINKING_LEVEL): {
  thinkingConfig: { thinkingLevel: ThinkingLevel };
} {
  return { thinkingConfig: { thinkingLevel: level } };
}

// ─── Fehler-Klassifikation ───────────────────────────────────────────────────

export interface UpstreamFailureContext {
  status: number;
  /** Google-typischer Status-String, z.B. "RESOURCE_EXHAUSTED". */
  apiStatus?: string | null;
  message?: string | null;
}

/**
 * Ordnet Upstream-Fehler Failover-Klassen zu. 429/Quota, 503/Unavailable und
 * 404/NotFound lösen den Sprung zum nächsten Modell aus ("retryNext").
 */
export function classifyUpstreamFailure(ctx: UpstreamFailureContext): {
  kind: AiFailoverKind;
  retryNext: boolean;
} {
  const msg = ctx.message?.toLowerCase() ?? "";
  if (
    ctx.status === 429 ||
    ctx.apiStatus === "RESOURCE_EXHAUSTED" ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("exhausted")
  ) {
    return { kind: "Quota", retryNext: true };
  }
  if (ctx.status === 503 || ctx.apiStatus === "UNAVAILABLE") {
    return { kind: "Unavailable", retryNext: true };
  }
  if (ctx.status === 404 || ctx.apiStatus === "NOT_FOUND") {
    return { kind: "NotFound", retryNext: true };
  }
  return { kind: "Error", retryNext: false };
}

/** Failover-Übergänge nur im Development loggen. */
export function logFailover(fromModel: string, toModel: string, kind: AiFailoverKind): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[AI Router] Falling back from ${fromModel} -> ${toModel} due to ${kind}`);
}

// ─── Generischer Failover-Dispatcher ─────────────────────────────────────────

export interface AiAttemptResult<T> {
  ok: boolean;
  value?: T;
  status?: number;
  apiStatus?: string | null;
  message?: string | null;
}

/**
 * Läuft eine Modell-Kette ab: Bei Quota/503/404 sofort (ohne Delay) zum
 * nächsten Eintrag; andere Fehler werden sofort an den Aufrufer durchgereicht.
 */
export async function runWithModelFailover<T>(
  chain: readonly string[],
  attempt: (modelId: string, isLast: boolean) => Promise<AiAttemptResult<T>>
): Promise<AiAttemptResult<T>> {
  let last: AiAttemptResult<T> = {
    ok: false,
    status: 500,
    message: "Kein Modell versucht.",
  };

  for (let i = 0; i < chain.length; i++) {
    const res = await attempt(chain[i], i === chain.length - 1);
    if (res.ok) return res;
    last = res;

    const next = chain[i + 1];
    if (!next) break;

    // Ohne HTTP-Status (z.B. Netzwerkfehler) gilt der Versuch als
    // überrollbarer "Error" – ansonsten entscheidet die Klassifikation.
    const { kind, retryNext } =
      res.status === undefined
        ? { kind: "Error" as AiFailoverKind, retryNext: true }
        : classifyUpstreamFailure({
            status: res.status,
            apiStatus: res.apiStatus,
            message: res.message,
          });
    if (!retryNext) break;
    logFailover(chain[i], next, kind);
  }

  return last;
}
