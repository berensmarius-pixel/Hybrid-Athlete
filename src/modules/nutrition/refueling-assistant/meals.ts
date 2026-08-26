import type { PantryItem } from "@/types";
import type { RefuelMealSuggestion, RefuelPriority, RefuelTargets } from "./types";

// ─── Refueling-Assistant: Mahlzeiten-Vorschläge ──────────────────────────────
// 3 schnelle Optionen (A/B/C) – bevorzugt aus vorhandenen Vorrats-Items
// zusammengesetzt, sonst Standard-Athlete-Rezepturen.

interface IngredientProfile {
  /** Erkennungs-Keywords im Pantry-Namen (lowercase) */
  keywords: string[];
  name: string;
  /** Nährwerte pro 100 g/ml */
  per100: { kcal: number; protein: number; carbs: number; fat: number };
}

const INGREDIENTS: IngredientProfile[] = [
  { keywords: ["magerquark", "quark"], name: "Magerquark", per100: { kcal: 67, protein: 12, carbs: 3.8, fat: 0.3 } },
  { keywords: ["skyr"], name: "Skyr", per100: { kcal: 63, protein: 11, carbs: 4, fat: 0.2 } },
  { keywords: ["whey", "proteinpulver", "eiweiss", "eiweiß"], name: "Whey", per100: { kcal: 375, protein: 75, carbs: 8, fat: 5 } },
  { keywords: ["reisflocken"], name: "Reisflocken", per100: { kcal: 360, protein: 7, carbs: 80, fat: 1 } },
  { keywords: ["haferflocken", "hafer", "oats", "müsli", "muesli"], name: "Haferflocken", per100: { kcal: 370, protein: 13, carbs: 58, fat: 7 } },
  { keywords: ["reis"], name: "Reis (gekocht)", per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } },
  { keywords: ["banane", "bananen"], name: "Banane", per100: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 } },
  { keywords: ["beeren", "beere", "himbeeren", "erdbeeren", "blaubeeren", "heidelbeeren"], name: "Beeren", per100: { kcal: 45, protein: 0.8, carbs: 8, fat: 0.4 } },
  { keywords: ["honig"], name: "Honig", per100: { kcal: 304, protein: 0.3, carbs: 82, fat: 0 } },
  { keywords: ["maltodextrin", "traubenzucker", "dextrose"], name: "Maltodextrin/Traubenzucker", per100: { kcal: 380, protein: 0, carbs: 95, fat: 0 } },
  { keywords: ["reiswaffel"], name: "Reiswaffeln", per100: { kcal: 387, protein: 8, carbs: 81, fat: 2.8 } },
  { keywords: ["milch"], name: "Milch (1,5%)", per100: { kcal: 47, protein: 3.4, carbs: 5, fat: 1.5 } },
];

/** Portionsgrößen je Zutat (Gramm); ingredient = erster Keyword-Key der Zutat. */
interface RecipeTemplate {
  id: string;
  title: string;
  prepMinutes: number;
  ingredients: Array<{ ingredient: string; grams: number; display?: string }>;
}

// Mengen sind bewusst "Athleten-Portionen"; display = UI-Text mit Menge.
const RECIPES: RecipeTemplate[] = [
  {
    id: "quark-beeren-bowl",
    title: "Magerquark-Bowl",
    prepMinutes: 3,
    ingredients: [
      { ingredient: "magerquark", grams: 400 },
      { ingredient: "beeren", grams: 100 },
      { ingredient: "honig", grams: 20 },
    ],
  },
  {
    id: "reisflocken-whey-brei",
    title: "Reisflocken-Whey-Brei",
    prepMinutes: 5,
    ingredients: [
      { ingredient: "reisflocken", grams: 80 },
      { ingredient: "whey", grams: 30 },
      { ingredient: "banane", grams: 120 },
    ],
  },
  {
    id: "speed-shake",
    title: "Fast-Carb Recovery-Shake",
    prepMinutes: 2,
    ingredients: [
      { ingredient: "maltodextrin", grams: 60 },
      { ingredient: "whey", grams: 30 },
    ],
  },
  {
    id: "banane-reiswaffeln",
    title: "Reiswaffeln & Banane mit Honig",
    prepMinutes: 2,
    ingredients: [
      { ingredient: "reiswaffel", grams: 40 },
      { ingredient: "banane", grams: 120 },
      { ingredient: "honig", grams: 20 },
    ],
  },
  {
    id: "hafer-bananen-brei",
    title: "Hafer-Bananen-Brei",
    prepMinutes: 5,
    ingredients: [
      { ingredient: "haferflocken", grams: 80 },
      { ingredient: "banane", grams: 120 },
      { ingredient: "milch", grams: 250 },
    ],
  },
  {
    id: "skyr-honig",
    title: "Skyr mit Honig",
    prepMinutes: 2,
    ingredients: [
      { ingredient: "skyr", grams: 500 },
      { ingredient: "honig", grams: 15 },
    ],
  },
];

function findPantryMatch(profile: IngredientProfile, pantryItems: PantryItem[]): PantryItem | undefined {
  return pantryItems.find((item) => {
    const nameLower = `${item.name} ${item.brand ?? ""}`.toLowerCase();
    return profile.keywords.some((k) => nameLower.includes(k));
  });
}

interface ComposedMeal {
  template: RecipeTemplate;
  carbsG: number;
  proteinG: number;
  calories: number;
  description: string;
  allFromPantry: boolean;
  pantryHits: number;
}

function composeMeal(template: RecipeTemplate, pantryItems: PantryItem[]): ComposedMeal {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let pantryHits = 0;
  const parts: string[] = [];

  for (const ing of template.ingredients) {
    const profile = INGREDIENTS.find((p) => p.keywords.includes(ing.ingredient));
    if (!profile) continue;
    // Pantry-Match → echte Bestands-Zutat
    const pantryItem = findPantryMatch(profile, pantryItems);
    if (pantryItem) pantryHits += 1;

    const factor = ing.grams / 100;
    kcal += profile.per100.kcal * factor;
    protein += profile.per100.protein * factor;
    carbs += profile.per100.carbs * factor;
    parts.push(`${ing.display ?? `${ing.grams}g ${pantryItem ? pantryItem.name : profile.name}`}`);
  }

  const hasPantry = pantryItems.length > 0 && pantryHits >= Math.ceil(template.ingredients.length / 2);

  return {
    template,
    calories: Math.round(kcal),
    proteinG: Math.round(protein),
    carbsG: Math.round(carbs),
    description: parts.join(" + "),
    allFromPantry: hasPantry,
    pantryHits,
  };
}

/**
 * Generiert genau 3 Vorschläge ("Option A"–"C").
 * Ranking: Passform zur Priorität (+ Pantry-Verfügbarkeit als Bonus).
 */
export function generateMealSuggestions(
  priority: RefuelPriority,
  targets: RefuelTargets,
  pantryItems: PantryItem[]
): RefuelMealSuggestion[] {
  const composed = RECIPES.map((r) => composeMeal(r, pantryItems));

  const score = (meal: ComposedMeal): number => {
    let s = 0;
    if (priority === "protein") {
      s += Math.min(1, meal.proteinG / Math.max(targets.proteinG, 1)) * 60;
      s += Math.min(1, meal.carbsG / Math.max(targets.carbsG, 1)) * 25;
    } else if (priority === "urgent-carbs") {
      s += Math.min(1, meal.carbsG / Math.max(targets.carbsG, 1)) * 70;
      s -= meal.template.prepMinutes * 3; // Urgent: schnell gehen vor
      s += Math.min(1, meal.proteinG / Math.max(targets.proteinG, 1)) * 15;
    } else {
      s += Math.min(1, meal.carbsG / Math.max(targets.carbsG, 1)) * 50;
      s += Math.min(1, meal.proteinG / Math.max(targets.proteinG, 1)) * 35;
    }
    if (meal.allFromPantry) s += 12;
    else if (meal.pantryHits > 0) s += meal.pantryHits * 3;
    return s;
  };

  const ranked = [...composed].sort((a, b) => score(b) - score(a)).slice(0, 3);
  const labels = ["Option A", "Option B", "Option C"];

  return ranked.map((meal, i) => ({
    id: `${meal.template.id}-${i}`,
    label: labels[i],
    title: meal.template.title,
    description: meal.description,
    carbsG: meal.carbsG,
    proteinG: meal.proteinG,
    calories: meal.calories,
    prepMinutes: meal.template.prepMinutes,
    source: meal.allFromPantry ? "pantry" : "standard",
  }));
}
