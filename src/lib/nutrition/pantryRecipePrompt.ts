// ─── KI-Rezept-Generator: Prompts & JSON-Schema ───────────────────────────────
// System- und User-Prompt für den Aufbrauch-Assistenten (Gemini generateContent
// mit responseMimeType application/json + responseSchema Enforcement).

import type { PantryItem, RecipeGeneratorMode } from "@/types";
import { getDaysUntilExpiry, getExpiryUrgency, sortPantryByExpiry } from "./pantryService";

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ─── Gemini responseSchema (JSON-Enforcement) ────────────────────────────────

export const RECIPE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recipes: {
      type: "ARRAY",
      description: "2-3 Rezeptvorschläge, sortiert nach höchstem Verwertungsgrad dringender Vorräte.",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Rezeptname auf Deutsch" },
          description: { type: "STRING", description: "1-2 Sätze Beschreibung auf Deutsch" },
          total_prep_time_min: { type: "INTEGER", description: "Gesamtzeit in Minuten" },
          servings: { type: "INTEGER", description: "Anzahl Portionen" },
          used_pantry_ingredients: {
            type: "ARRAY",
            description:
              "GENAU die Vorrats-Zutaten mit exakt abgezogenen Mengen. pantry_item_id muss unverändert aus der Vorratsliste übernommen werden.",
            items: {
              type: "OBJECT",
              properties: {
                pantry_item_id: { type: "STRING" },
                name: { type: "STRING", description: "Name wie im Vorrat" },
                amount_used: { type: "NUMBER", description: "Verwendete Menge in der angegebenen Einheit" },
                unit: { type: "STRING", description: "Einheit des Vorrats-Artikels (g, kg, ml, l oder stk)" },
              },
              required: ["pantry_item_id", "name", "amount_used", "unit"],
            },
          },
          missing_ingredients_to_buy: {
            type: "ARRAY",
            description: "Zutaten, die gekauft werden müssen. Bei Mode 'strict' immer leer!",
            items: { type: "STRING" },
          },
          steps: {
            type: "ARRAY",
            description: "Schritt-für-Schritt Zubereitung auf Deutsch",
            items: { type: "STRING" },
          },
        },
        required: ["title", "description", "total_prep_time_min", "servings", "used_pantry_ingredients", "missing_ingredients_to_buy", "steps"],
      },
    },
  },
  required: ["recipes"],
} as const;

// ─── System Prompt ────────────────────────────────────────────────────────────

export function buildRecipeSystemPrompt(mode: RecipeGeneratorMode): string {
  const modeRule =
    mode === "strict"
      ? `MODUS A – STRICT PANTRY ONLY:
- Du darfst AUSSCHLIESSLICH Zutaten aus dem bereitgestellten Vorrat verwenden.
- Erlaubt sind zusätzlich nur unsichtbare Basics: Salz, Pfeffer, Wasser, Essig.
- "missing_ingredients_to_buy" MUSS in jedem Rezept eine LEERE Liste sein.`
      : `MODUS B – MINIMAL SHOPPING:
- Priorisiere zwingend alle dringend ablaufenden Vorräte (days_until_expiry <= 3).
- Du darfst pro Rezept MAXIMAL 3 fehlende Zutaten ergänzen ("missing_ingredients_to_buy").
- Fehlende Zutaten sollen günstig und Standard sein (z.B. Nudeln, Zitrone, Kräuter).
- Erzeuge trotzdem mindestens ein Rezept, das OHNE Einkauf auskommt.`;

  return `Du bist "Aufbrauch-Assistent", ein präziser Koch- und Ernährungs-Experte für Fitness-Athleten.
Deine Aufgabe: Aus einem digitalen Vorratslager (Kühlschrank/Vorratsschrank) Rezepte generieren,
die streng nach Verfallsdatum priorisieren und Lebensmittelabfall minimieren.

REGELN:
1. PRIORITÄT: Verwende zuerst Artikel mit kleinem days_until_expiry (rot/kritisch), danach gelbe (Warnung), dann stabile.
2. MENGEN-ABZUG: In "used_pantry_ingredients" gibst du für JEDEN verwendeten Artikel die EXAKT verbrauchte
   Menge an (amount_used + unit). Die App zieht diese Mengen automatisch vom Bestand ab – sei realistisch,
   überschreite NIE die verfügbare Restmenge (available_quantity).
3. TRENNUNG: Verwendete Vorrats-Zutaten gehören ausschließlich in "used_pantry_ingredients".
   Alles, was der User zusätzlich besorgen muss, gehört ausschließlich in "missing_ingredients_to_buy".
4. MAKROS: Die App berechnet Kalorien/Protein/Carbs/Fett selbst aus den Mengen – du musst keine liefern.
   Plane die Rezepte aber so, dass sie zu den Makro-Zielen passen (high protein bevorzugt).
5. ANZAHL: Liefere 2–3 Rezeptvorschläge, sortiert nach bestmöglicher Verwertung kritischer Vorräte.
6. SPRACHE: Alle Texte auf Deutsch. Schritte kurz, nummeriert, praktisch.

${modeRule}

Antworte AUSSCHLIESSLICH als gültiges JSON gemäß dem vorgegebenen Schema.`;
}

// ─── User Prompt (Kontext) ────────────────────────────────────────────────────

export function buildRecipeUserPrompt(params: {
  pantryItems: PantryItem[];
  mode: RecipeGeneratorMode;
  goals?: MacroTargets | null;
  servings?: number;
}): string {
  const { pantryItems, mode, goals, servings } = params;
  const sorted = sortPantryByExpiry(pantryItems);

  const pantryLines = sorted.map((item) => {
    const days = item.expirationDate ? getDaysUntilExpiry(item.expirationDate) : null;
    const urgency = getExpiryUrgency(item);
    return `- [id=${item.id}] ${item.name}${item.brand ? ` (${item.brand})` : ""} | verfügbar: ${item.quantity} ${item.unit} | MHD-Tage: ${
      days === null ? "kein Datum" : days
    } | Dringlichkeit: ${urgency} | Nährwerte/100: ${item.caloriesPer100g} kcal, ${item.macros?.protein ?? 0}g P, ${
      item.macros?.carbs ?? 0
    }g C, ${item.macros?.fat ?? 0}g F`;
  });

  const goalLine = goals
    ? `Tages-Makroziele des Athleten: ~${goals.calories} kcal, ${goals.protein}g Protein, ${goals.carbs}g Carbs, ${goals.fat}g Fett.`
    : "Keine Makroziele übermittelt – plane proteinbetont (Fitness-Kontext).";

  return `=== VORRAT (sortiert nach Dringlichkeit) ===
${pantryLines.join("\n") || "(Vorrat ist leer)"}

=== KONTEXT ===
Modus: ${mode === "strict" ? "A – Strict Pantry Only (keine Einkäufe)" : "B – Minimal Shopping (max. 3 fehlende Zutaten pro Rezept)"}
Gewünschte Portionen pro Rezept: ${servings ?? 2}
${goalLine}

Generiere jetzt 2–3 passende Rezepte gemäß deinen Regeln.`;
}
