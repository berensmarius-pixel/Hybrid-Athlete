import { NextRequest, NextResponse } from "next/server";
import { resolveGeminiKeysServer } from "@/lib/server/geminiKey";
import {
  AI_MODEL_IDS,
  classifyUpstreamFailure,
  logFailover,
  sanitizeGenerationPayload,
  type AiFailoverKind,
} from "@/lib/ai/model-router";
import { buildRecipeSystemPrompt, buildRecipeUserPrompt, MacroTargets, RECIPE_RESPONSE_SCHEMA } from "@/lib/nutrition/pantryRecipePrompt";
import { sortPantryByExpiry, validateAndHydrateRecipes } from "@/lib/nutrition/pantryService";
import type { PantryItem, RecipeGeneratorMode } from "@/types";

/**
 * POST /api/pantry/recipes
 *
 * Aufbrauch-Assistent: nimmt den (bereits nach Dringlichkeit sortierten)
 * Vorrat + Modus entgegen, ruft Gemini mit JSON-Schema-Enforcement auf und
 * validiert/hydratisiert die Rezeptvorschläge serverseitig:
 *  - Mengen werden auf den Bestand geklemmt
 *  - Makros werden lokal aus den echten Nährwertdaten neu berechnet
 *  - Expiry-Score wird serverseitig ermittelt
 *
 * Modell-Kette + Key-Rotation + Gemini-3.x-Parameter-Audit kommen aus dem
 * zentralen AI-Router (src/lib/ai/model-router.ts).
 */
const MAX_ITEMS = 60;

interface RecipeRequest {
  items: PantryItem[];
  mode: RecipeGeneratorMode;
  goals?: MacroTargets | null;
  servings?: number;
}

function isValidPantryItem(raw: unknown): raw is PantryItem {
  if (!raw || typeof raw !== "object") return false;
  const i = raw as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    typeof i.name === "string" &&
    Number.isFinite(Number(i.quantity)) &&
    typeof i.unit === "string" &&
    ["g", "kg", "ml", "l", "stk"].includes(i.unit as string) &&
    Number.isFinite(Number(i.caloriesPer100g))
  );
}

export async function POST(req: NextRequest) {
  const keys = await resolveGeminiKeysServer();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: { message: "Kein Gemini API-Key konfiguriert.", status: "NO_KEY" } },
      { status: 400 }
    );
  }

  let body: RecipeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Ungültiger Request-Body." } }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.filter(isValidPantryItem).slice(0, MAX_ITEMS) : [];
  if (items.length === 0) {
    return NextResponse.json({ error: { message: "Vorrat ist leer oder ungültig." } }, { status: 400 });
  }

  const mode: RecipeGeneratorMode = body.mode === "minimal" ? "minimal" : "strict";
  const servings = Number.isFinite(Number(body.servings)) && Number(body.servings) >= 1
    ? Math.min(12, Math.round(Number(body.servings)))
    : 2;

  // Serverseitig nochmal nach Dringlichkeit sortieren – dem LLM wird die
  // priorisierte Liste übergeben, unabhängig von der Client-Reihenfolge.
  const sortedItems = sortPantryByExpiry(items);

  const systemPrompt = buildRecipeSystemPrompt(mode);
  const userPrompt = buildRecipeUserPrompt({
    pantryItems: sortedItems,
    mode,
    goals: body.goals ?? null,
    servings,
  });

  let lastError: unknown = null;

  for (let mIdx = 0; mIdx < AI_MODEL_IDS.length; mIdx++) {
    const model = AI_MODEL_IDS[mIdx];

    // Payload pro Modell aufbereiten (Gemini-3.x-Audit entfernt veraltete
    // Sampling-Parameter automatisch auf 3.6+/3.7-Endpunkten).
    const payload = sanitizeGenerationPayload(model, {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: RECIPE_RESPONSE_SCHEMA,
      },
    });

    let failKind: AiFailoverKind | null = null;

    for (let kIdx = 0; kIdx < keys.length; kIdx++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": keys[kIdx] },
            body: JSON.stringify(payload),
          }
        );

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = json?.error?.message || `Gemini API Error ${res.status}`;
          console.warn(`[api/pantry/recipes] model ${model} failed (${res.status}):`, msg);
          lastError = new Error(msg);

          const cls = classifyUpstreamFailure({
            status: res.status,
            apiStatus: json?.error?.status ?? null,
            message: msg,
          });
          if (msg.toLowerCase().includes("api key")) return NextResponse.json(
            { error: { message: "Kein gültiger Gemini API-Key konfiguriert.", status: "NO_KEY" } },
            { status: 400 }
          );
          // Quota/429/503/404 → nächstes Modell (ggf. nach Key-Rotation)
          failKind = cls.kind;
          continue;
        }

        const text: string | undefined =
          json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") || undefined;
        if (!text) {
          lastError = new Error("Leere Antwort vom Modell.");
          failKind = failKind ?? "Error";
          break;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          lastError = new Error("Modell lieferte kein gültiges JSON.");
          failKind = failKind ?? "Error";
          break;
        }

        const recipesRaw =
          parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown }).recipes)
            ? (parsed as { recipes: unknown[] }).recipes
            : [];

        // Validierung + Hydratation (Makros & Score lokal berechnet)
        const recipes = validateAndHydrateRecipes(recipesRaw, sortedItems).sort(
          (a, b) => (b as { expiryScore: number }).expiryScore - (a as { expiryScore: number }).expiryScore
        );

        if (recipes.length === 0) {
          return NextResponse.json(
            { error: { message: "Keine verwertbaren Rezepte für diesen Vorrat gefunden." } },
            { status: 422 }
          );
        }

        return NextResponse.json({ recipes, usedModel: model }, { headers: { "Cache-Control": "no-store" } });
      } catch (err) {
        console.error(`[api/pantry/recipes] model ${model} error:`, err);
        lastError = err;
        failKind = failKind ?? "Error";
      }
    }

    const nextModel = AI_MODEL_IDS[mIdx + 1];
    if (nextModel && failKind) logFailover(model, nextModel, failKind);
  }

  return NextResponse.json(
    { error: { message: lastError instanceof Error ? lastError.message : "KI-Rezeptgenerierung fehlgeschlagen." } },
    { status: 502 }
  );
}
