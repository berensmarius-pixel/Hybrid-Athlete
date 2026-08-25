// ─── Smart Grocery & Shopping List Service ────────────────────────────────────

import { readStoredJson, writeState } from "@/lib/persistence/stateStore";

export type GroceryCategory =
  | "produce" // Obst & Gemüse
  | "protein" // Fleisch, Fisch, Eier & Tofu
  | "grains" // Haferflocken, Reis, Nudeln
  | "dairy" // Milchprodukte & Alternativen
  | "supplements" // Whey, Elektrolyte, Malto
  | "pantry" // Nüsse, Öle, Gewürze
  | "other";

export interface GroceryItem {
  id: string;
  name: string;
  amount: string; // e.g. "500g", "1 Packung", "3 Stück"
  category: GroceryCategory;
  isChecked: boolean;
  recipeSource?: string; // e.g. "Pre-Workout Porridge"
}

export interface HybridRecipe {
  id: string;
  title: string;
  category: "breakfast" | "lunch" | "dinner" | "snack";
  prepTimeMinutes: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  tag: string;
  ingredients: { name: string; amount: string; category: GroceryCategory }[];
  instructions: string[];
}

export const POPULAR_HYBRID_RECIPES: HybridRecipe[] = [
  {
    id: "rec_1",
    title: "⚡ Power-Oats Porridge mit Beeren & Whey",
    category: "breakfast",
    prepTimeMinutes: 10,
    calories: 580,
    protein: 42,
    carbs: 78,
    fat: 10,
    tag: "Optimal 2-3h vor Zone 2 oder Schwellentraining",
    ingredients: [
      { name: "Zarte Haferflocken", amount: "100g", category: "grains" },
      { name: "Whey Isolat (Vanille oder Schoko)", amount: "35g", category: "supplements" },
      { name: "Tiefkühl-Beerenmischung / Blaubeeren", amount: "150g", category: "produce" },
      { name: "Banane", amount: "1 Stück", category: "produce" },
      { name: "Mandelmilch (ungesüßt)", amount: "250ml", category: "dairy" },
      { name: "Zimt & Prise Salz", amount: "1 Prise", category: "pantry" },
    ],
    instructions: [
      "Haferflocken mit Mandelmilch und einer Prise Salz aufkochen und 3 Minuten quellen lassen.",
      "Vom Herd nehmen, Whey Isolat zügig unterrühren.",
      "Mit warmer Beerenmischung und frischer Bananenscheiben toppen.",
    ],
  },
  {
    id: "rec_2",
    title: "🍗 Performance Chicken & Sweet Potato Bowl",
    category: "lunch",
    prepTimeMinutes: 25,
    calories: 720,
    protein: 58,
    carbs: 85,
    fat: 14,
    tag: "High-Protein & Komplexe Carbs für Glykogenspeicher",
    ingredients: [
      { name: "Hähnchenbrustfilet", amount: "250g", category: "protein" },
      { name: "Süßkartoffeln", amount: "300g", category: "produce" },
      { name: "Brokkoli oder grüner Spargel", amount: "200g", category: "produce" },
      { name: "Olivenöl extra vergine", amount: "1 EL (10ml)", category: "pantry" },
      { name: "Paprikapulver, Knoblauch & Meersalz", amount: "1 TL", category: "pantry" },
    ],
    instructions: [
      "Süßkartoffeln in Würfel schneiden und mit 1/2 EL Olivenöl bei 200°C 20 Min im Ofen/Airfryer backen.",
      "Hähnchenbrust würzen und in der Pfanne goldbraun anbraten.",
      "Brokkoli dünsten und alles in einer Bowl anrichten.",
    ],
  },
  {
    id: "rec_3",
    title: "🐟 Wildlachs mit Quinoa & Avocado-Salat",
    category: "dinner",
    prepTimeMinutes: 20,
    calories: 680,
    protein: 48,
    carbs: 52,
    fat: 28,
    tag: "Omega-3 Anti-Entzündlich für Muskelregeneration",
    ingredients: [
      { name: "Wildlachsfilet", amount: "200g", category: "protein" },
      { name: "Quinoa oder Basmati-Reis", amount: "80g (roh)", category: "grains" },
      { name: "Avocado", amount: "1/2 Stück", category: "produce" },
      { name: "Babyspinat", amount: "100g", category: "produce" },
      { name: "Zitronensaft & Kräuter", amount: "1 EL", category: "pantry" },
    ],
    instructions: [
      "Quinoa nach Packungsanleitung in leichtem Salzwasser 15 Min kochen.",
      "Lachsfilet mit Zitrone und Pfeffer würzen und in der Pfanne 3-4 Min pro Seite glasig braten.",
      "Spinat mit Avocado und Quinoa mischen und den Lachs darauf servieren.",
    ],
  },
  {
    id: "rec_4",
    title: "🥤 Post-Workout Recovery Smoothie (Leucin-Trigger)",
    category: "snack",
    prepTimeMinutes: 5,
    calories: 420,
    protein: 38,
    carbs: 58,
    fat: 4,
    tag: "Sofortige Muskelreparatur & Glykogenspeicher-Kick",
    ingredients: [
      { name: "Magerquark oder Griechischer Joghurt 0%", amount: "200g", category: "dairy" },
      { name: "Whey Protein", amount: "25g", category: "supplements" },
      { name: "Reife Banane", amount: "1 Stück", category: "produce" },
      { name: "Maltodextrin oder Honig", amount: "20g", category: "supplements" },
      { name: "Wasser oder Kokoswasser", amount: "300ml", category: "dairy" },
    ],
    instructions: [
      "Alle Zutaten in den Standmixer geben.",
      "45 Sekunden cremig mixen und direkt nach dem Training trinken.",
    ],
  },
];

const GROCERY_STORAGE_KEY = "hybrid_athlete_shopping_list";

export const CATEGORY_LABELS: Record<GroceryCategory, { label: string; icon: string }> = {
  produce: { label: "Obst & Gemüse", icon: "🥦" },
  protein: { label: "Fleisch, Fisch, Eier & Tofu", icon: "🥩" },
  grains: { label: "Kohlenhydrate & Getreide", icon: "🍚" },
  dairy: { label: "Milchprodukte & Alternativen", icon: "🥛" },
  supplements: { label: "Supplements & Performance", icon: "⚡" },
  pantry: { label: "Öle, Nüsse & Gewürze", icon: "🫒" },
  other: { label: "Sonstiges", icon: "📦" },
};

export function getStoredShoppingList(): GroceryItem[] {
  if (typeof window === "undefined") return [];
  const existing = readStoredJson<GroceryItem[] | null>(GROCERY_STORAGE_KEY, null);
  if (existing) return existing;
  try {
    // Initialize with basic staples from first recipe
    const initial: GroceryItem[] = POPULAR_HYBRID_RECIPES[0].ingredients.map((ing, idx) => ({
      id: `staple_${idx}`,
      name: ing.name,
      amount: ing.amount,
      category: ing.category,
      isChecked: false,
      recipeSource: POPULAR_HYBRID_RECIPES[0].title,
    }));
    writeState(GROCERY_STORAGE_KEY, initial);
    return initial;
  } catch {
    return [];
  }
}

export function saveShoppingList(items: GroceryItem[]): void {
  if (typeof window === "undefined") return;
  writeState(GROCERY_STORAGE_KEY, items);
}
