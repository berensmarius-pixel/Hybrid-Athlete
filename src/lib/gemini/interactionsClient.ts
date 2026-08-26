import { INTERACTION_TOOLS } from "@/lib/gemini/coachTools";
import {
  AI_MODEL_IDS,
  classifyUpstreamFailure,
  logFailover,
  usesThinkingLevel,
  type ThinkingLevel,
} from "@/lib/ai/model-router";
import { orderModelsByQuota, recordModelFailure, recordModelSuccess } from "@/lib/ai/quotaMemory";
import { InteractionStreamAccumulator, parseSseChunk } from "@/lib/gemini/sseStream";

/**
 * Aufrufe der Gemini Interactions API (Streaming + Non-Streaming) mit
 * Modell-Failover:
 * - Der Server-Proxy (/api/gemini/[...path]) enforced bereits die zentrale
 *   Modell-Kette inkl. Key-Rotation – dieser Client-Loop ist die zusätzliche
 *   Absicherung, falls der Proxy selbst antwortet, aber alle Modelle belegt sind.
 * - Bei 429/Quota/503/404 wird ohne Verzögerung das nächste Modell probiert;
 *   bei Key-Fehlern wird sofort abgebrochen.
 * - Quota-Gedächtnis (src/lib/ai/quotaMemory.ts): zuletzt erfolgreiches
 *   Modell startet die Kette, Modelle mit aktivem Cooldown wandern ans Ende –
 *   das erspart stille 429-Roundtrips.
 * - Gemini-3.x-Modelle erhalten ein explizites thinkingLevel (adaptiv),
 *   2.5-Emergency-Fallbacks laufen ohne Thinking-Config.
 */

export interface InteractionResult {
  data: unknown;
  usedModel: string;
}

export class GeminiKeyError extends Error {
  constructor() {
    super("Kein gültiger Gemini API-Key auf dem Server konfiguriert.");
    this.name = "GeminiKeyError";
  }
}

export interface InteractionCallOptions {
  /** Adaptives Thinking-Level (nur auf 3.x-Modellen wirksam). */
  thinkingLevel?: ThinkingLevel;
  /** Abort-Signal (bricht Fetch + Stream ab). */
  signal?: AbortSignal;
  /** Explizite Modell-Reihenfolge; Default: quota-optimierte Standard-Kette. */
  orderedModels?: readonly string[];
}

function buildOrderedChain(orderedModels?: readonly string[]): string[] {
  if (orderedModels && orderedModels.length > 0) return [...orderedModels];
  return orderModelsByQuota(AI_MODEL_IDS);
}

function buildInteractionBody(
  modelId: string,
  systemPrompt: string,
  input: string,
  options: { stream: boolean; thinkingLevel?: ThinkingLevel }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: modelId,
    system_instruction: systemPrompt,
    input,
    tools: INTERACTION_TOOLS,
    store: true,
  };
  if (options.stream) body.stream = true;

  // Thinking-Level nur auf Gemini-3.x senden – 2.5-Endpunkte erwarten dort
  // das legacy thinkingBudget und würden thinking_level mit 400 ablehnen.
  // Interactions API erwartet snake_case: generation_config mit thinking_level direkt
  if (options.thinkingLevel && usesThinkingLevel(modelId)) {
    body.generation_config = {
      thinking_level: options.thinkingLevel,
    };
  }
  return body;
}

async function postInteraction(
  modelId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> {
  return fetch("/api/gemini/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

interface FailureInfo {
  retryNext: boolean;
  isKeyError: boolean;
  message: string;
}

function inspectFailure(res: Response, json: { error?: { message?: string; status?: string } } | null): FailureInfo {
  const cls = classifyUpstreamFailure({
    status: res.status,
    apiStatus: json?.error?.status ?? null,
    message: json?.error?.message ?? null,
  });
  const message = json?.error?.message || `API Error ${res.status}`;
  const isKeyError =
    res.status === 400 && (json?.error?.message ?? "").toLowerCase().includes("key");
  return { retryNext: cls.retryNext, isKeyError, message };
}

function readRouterModel(res: Response, fallback: string): string {
  return res.headers.get("x-ai-router-model") || fallback;
}

/**
 * Non-Streaming-Variante (komplette Antwort in einem Request).
 * Behalten als Fallback-Pfad und für einfache Aufrufer.
 */
export async function callGeminiInteractions(
  systemPrompt: string,
  input: string,
  options: InteractionCallOptions = {}
): Promise<InteractionResult> {
  const chain = buildOrderedChain(options.orderedModels);
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const modelId = chain[i];
    try {
      const res = await postInteraction(
        modelId,
        buildInteractionBody(modelId, systemPrompt, input, { stream: false, thinkingLevel: options.thinkingLevel }),
        options.signal
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string };
      };

      if (!res.ok) {
        const failure = inspectFailure(res, json);
        if (failure.isKeyError) throw new GeminiKeyError();

        if (failure.retryNext) {
          recordModelFailure(modelId, failure.message);
          const nextModel = chain[i + 1];
          if (nextModel) logFailover(modelId, nextModel, "Quota");
          lastError = new Error(failure.message);
          continue;
        }
        throw new Error(failure.message);
      }

      const usedModel = readRouterModel(res, modelId);
      recordModelSuccess(usedModel);
      return { data: json, usedModel };
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      if (options.signal?.aborted) throw err;
      console.error(`Error with model ${modelId}:`, err);
      lastError = err;
      if (i === chain.length - 1) throw err;
    }
  }

  throw lastError ?? new Error("Alle KI-Modelle haben das Limit erreicht.");
}

export interface StreamInteractionResult extends InteractionResult {
  /** Interaktion-ID der gespeicherten Interaktion (store:true). */
  interactionId: string | null;
}

export interface StreamInteractionOptions extends InteractionCallOptions {
  /** Wird für jeden Ausgabe-Text-Delta aufgerufen (Live-Rendering). */
  onDelta?: (chunk: string) => void;
  /** Thinking-Summary-Delta („denkt nach…"-Indikator). */
  onThought?: () => void;
  /** Sobald das tatsächlich antwortende Modell bekannt ist. */
  onModel?: (modelId: string) => void;
}

/**
 * Streaming-Variante: `stream: true` → SSE vom Proxy (der den Upstream-Body
 * 1:1 durchreicht). Text-Deltas werden via onDelta live durchgereicht;
 * das Result enthält die akkumulierten Steps im Non-Streaming-Format.
 */
export async function streamGeminiInteractions(
  systemPrompt: string,
  input: string,
  options: StreamInteractionOptions = {}
): Promise<StreamInteractionResult> {
  const chain = buildOrderedChain(options.orderedModels);
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const modelId = chain[i];
    const accumulator = new InteractionStreamAccumulator({
      onText: options.onDelta,
      onThought: () => options.onThought?.(),
    });

    try {
      const res = await postInteraction(
        modelId,
        buildInteractionBody(modelId, systemPrompt, input, { stream: true, thinkingLevel: options.thinkingLevel }),
        options.signal
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; status?: string };
        };
        const failure = inspectFailure(res, json);
        if (failure.isKeyError) throw new GeminiKeyError();

        if (failure.retryNext) {
          recordModelFailure(modelId, failure.message);
          const nextModel = chain[i + 1];
          if (nextModel) logFailover(modelId, nextModel, "Quota");
          lastError = new Error(failure.message);
          continue;
        }
        throw new Error(failure.message);
      }

      const usedModel = readRouterModel(res, modelId);
      options.onModel?.(usedModel);

      // Proxy sollte text/event-stream durchreichen; falls doch JSON
      // ankommt (z. B. älterer Proxy-Stand), als Non-Streaming behandeln.
      const contentType = res.headers.get("Content-Type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const json = await res.json();
        recordModelSuccess(usedModel);
        return { data: json, usedModel, interactionId: extractInteractionId(json) };
      }

      if (!res.body) throw new Error("Streaming-Response ohne Body.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;
        for (const evt of events) {
          if (!evt.data) continue;
          try {
            accumulator.handleEvent(evt.event, JSON.parse(evt.data));
          } catch {
            /* nicht-JSON-Data-Zeile überspringen */
          }
        }
      }

      recordModelSuccess(usedModel);
      const data = accumulator.buildResult();
      return {
        data,
        usedModel,
        interactionId: accumulator.interactionId ?? extractInteractionId(data),
      };
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      if (options.signal?.aborted) throw err;

      // Fehler NACH Stream-Start sind nicht wiederholungsfähig (Deltas
      // sind beim Client angekommen) → direkt an den Aufrufer werfen.
      if (receivedAnyAfterStart(accumulator)) throw err;

      console.error(`Streaming error with model ${modelId}:`, err);
      recordModelFailure(modelId, err instanceof Error ? err.message : null);
      lastError = err;
      if (i === chain.length - 1) throw err;
    }
  }

  throw lastError ?? new Error("Alle KI-Modelle haben das Limit erreicht.");
}

/** Hat der Akkumulator bereits Inhalt? Dann nicht mehr failovern. */
function receivedAnyAfterStart(accumulator: InteractionStreamAccumulator): boolean {
  const result = accumulator.buildResult();
  return result.steps.length > 0;
}

function extractInteractionId(json: unknown): string | null {
  if (json && typeof json === "object") {
    const id = (json as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}
