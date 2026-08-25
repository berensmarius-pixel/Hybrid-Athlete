import { GEMINI_MODELS, INTERACTION_TOOLS } from "@/lib/gemini/coachTools";

/**
 * Aufruf der Gemini Interactions API mit Modell-Fallback-Loop:
 * Bei 429/Quota/503 wird das nächste Modell probiert; bei Key-Fehlern
 * wird sofort abgebrochen. Extrahiert aus CoachView.tsx.
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

export async function callGeminiInteractions(
  systemPrompt: string,
  input: string
): Promise<InteractionResult> {
  let lastError: unknown = null;

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const modelConfig = GEMINI_MODELS[i];
    try {
      const res = await fetch("/api/gemini/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelConfig.id,
          system_instruction: systemPrompt,
          input,
          tools: INTERACTION_TOOLS,
          store: true,
        }),
      });

      const json = (await res.json()) as {
        error?: { message?: string; status?: string };
      };

      if (!res.ok) {
        console.warn(
          `Interactions model ${modelConfig.id} failed (${res.status}):`,
          json.error?.message
        );

        // Quota/Limit/Unavailable → nächstes Modell probieren
        if (
          res.status === 429 ||
          json.error?.status === "RESOURCE_EXHAUSTED" ||
          res.status === 503 ||
          json.error?.status === "UNAVAILABLE"
        ) {
          lastError = new Error(json.error?.message || `API Error ${res.status}`);
          continue;
        }

        if (res.status === 400 && json.error?.message?.toLowerCase().includes("key")) {
          throw new GeminiKeyError();
        }

        throw new Error(json.error?.message || `API Error ${res.status}`);
      }

      return { data: json, usedModel: modelConfig.id };
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      console.error(`Error with model ${modelConfig.id}:`, err);
      lastError = err;
      if (i === GEMINI_MODELS.length - 1) throw err;
    }
  }

  throw lastError ?? new Error("Alle KI-Modelle haben das Limit erreicht.");
}
