// ─── Open Food Facts & Nutrition Helper ────────────────────────────────────────
// Free, open-source nutrition database (OpenNutriTracker style)

import { FoodItem } from "@/types";

export const OFF_API_BASE = "https://world.openfoodfacts.org";

// ─── Popular / Common Fitness Foods (Zero-latency offline ready) ───────────────

export const COMMON_FITNESS_FOODS: FoodItem[] = [
  {
    id: "basic-haferflocken",
    name: "Haferflocken Zart",
    brand: "Basics",
    caloriesPer100g: 370,
    proteinPer100g: 13.5,
    carbsPer100g: 58.7,
    fatPer100g: 7.0,
    servingSize: 50,
    servingUnit: "g (Portion)",
    imageUrl: "https://images.openfoodfacts.org/images/products/430/561/501/2143/front_de.14.200.jpg",
  },
  {
    id: "basic-magerquark",
    name: "Magerquark (Speisequark Magerstufe)",
    brand: "Milchprodukt",
    caloriesPer100g: 68,
    proteinPer100g: 12.2,
    carbsPer100g: 4.1,
    fatPer100g: 0.2,
    servingSize: 250,
    servingUnit: "g (Halbe Packung)",
    imageUrl: "https://images.openfoodfacts.org/images/products/431/150/144/2209/front_de.7.200.jpg",
  },
  {
    id: "basic-haehnchen",
    name: "Hähnchenbrustfilet (roh/gebraten)",
    brand: "Geflügel",
    caloriesPer100g: 110,
    proteinPer100g: 23.5,
    carbsPer100g: 0.0,
    fatPer100g: 1.5,
    servingSize: 150,
    servingUnit: "g (1 Filet)",
  },
  {
    id: "basic-skyr",
    name: "Skyr Natur",
    brand: "Milchprodukt",
    caloriesPer100g: 62,
    proteinPer100g: 11.0,
    carbsPer100g: 4.0,
    fatPer100g: 0.2,
    servingSize: 150,
    servingUnit: "g (Portion)",
  },
  {
    id: "basic-whey",
    name: "Whey Protein Isolat / Konzentrat",
    brand: "Supplement",
    caloriesPer100g: 380,
    proteinPer100g: 78.0,
    carbsPer100g: 5.0,
    fatPer100g: 4.5,
    servingSize: 30,
    servingUnit: "g (1 Scoop)",
  },
  {
    id: "basic-eier",
    name: "Hühnerei (Größe M)",
    brand: "Frisch",
    caloriesPer100g: 143,
    proteinPer100g: 12.6,
    carbsPer100g: 0.7,
    fatPer100g: 9.9,
    servingSize: 55,
    servingUnit: "g (1 Ei)",
  },
  {
    id: "basic-banane",
    name: "Banane (Frisch)",
    brand: "Obst",
    caloriesPer100g: 89,
    proteinPer100g: 1.1,
    carbsPer100g: 22.8,
    fatPer100g: 0.3,
    servingSize: 120,
    servingUnit: "g (1 mittlere Banane)",
  },
  {
    id: "basic-reis",
    name: "Basmati Reis (ungekocht)",
    brand: "Basics",
    caloriesPer100g: 350,
    proteinPer100g: 8.5,
    carbsPer100g: 77.0,
    fatPer100g: 0.8,
    servingSize: 80,
    servingUnit: "g (Portion)",
  },
  {
    id: "basic-lachs",
    name: "Lachsfilet (frisch / TK)",
    brand: "Fisch",
    caloriesPer100g: 208,
    proteinPer100g: 20.0,
    carbsPer100g: 0.0,
    fatPer100g: 13.5,
    servingSize: 150,
    servingUnit: "g (1 Portion)",
  },
  {
    id: "basic-thunfisch",
    name: "Thunfisch im eigenen Saft",
    brand: "Konserve",
    caloriesPer100g: 105,
    proteinPer100g: 24.0,
    carbsPer100g: 0.0,
    fatPer100g: 0.8,
    servingSize: 140,
    servingUnit: "g (1 Dose)",
  },
  {
    id: "basic-erdnussbutter",
    name: "Erdnussbutter (100% Erdnüsse)",
    brand: "Nussmus",
    caloriesPer100g: 595,
    proteinPer100g: 26.0,
    carbsPer100g: 12.0,
    fatPer100g: 49.0,
    servingSize: 20,
    servingUnit: "g (1 EL)",
  },
  {
    id: "basic-huettenkaese",
    name: "Körniger Frischkäse (Light)",
    brand: "Milchprodukt",
    caloriesPer100g: 76,
    proteinPer100g: 12.5,
    carbsPer100g: 2.0,
    fatPer100g: 1.8,
    servingSize: 200,
    servingUnit: "g (1 Becher)",
  },
  {
    id: "basic-rinderhack",
    name: "Rinderhackfleisch Mager (5% Fett)",
    brand: "Fleisch",
    caloriesPer100g: 125,
    proteinPer100g: 21.0,
    carbsPer100g: 0.0,
    fatPer100g: 4.5,
    servingSize: 150,
    servingUnit: "g (Portion)",
  },
  {
    id: "basic-apfel",
    name: "Apfel (Frisch)",
    brand: "Obst",
    caloriesPer100g: 52,
    proteinPer100g: 0.3,
    carbsPer100g: 13.8,
    fatPer100g: 0.2,
    servingSize: 150,
    servingUnit: "g (1 Apfel)",
  },
  {
    id: "basic-vollkornbrot",
    name: "Vollkornbrot / Roggenbrot",
    brand: "Bäckerei",
    caloriesPer100g: 210,
    proteinPer100g: 7.0,
    carbsPer100g: 39.0,
    fatPer100g: 1.5,
    servingSize: 50,
    servingUnit: "g (1 Scheibe)",
  },
  {
    id: "basic-mandelmilch",
    name: "Mandelmilch Ungesüßt",
    brand: "Pflanzendrink",
    caloriesPer100g: 13,
    proteinPer100g: 0.5,
    carbsPer100g: 0.2,
    fatPer100g: 1.1,
    servingSize: 200,
    servingUnit: "ml (1 Glas)",
  },
  {
    id: "basic-avocado",
    name: "Avocado",
    brand: "Frisch",
    caloriesPer100g: 160,
    proteinPer100g: 2.0,
    carbsPer100g: 8.5,
    fatPer100g: 14.7,
    servingSize: 100,
    servingUnit: "g (Halbe Avocado)",
  },
  {
    id: "basic-olivenoel",
    name: "Olivenöl Extra Vergine",
    brand: "Öle",
    caloriesPer100g: 884,
    proteinPer100g: 0.0,
    carbsPer100g: 0.0,
    fatPer100g: 100.0,
    servingSize: 10,
    servingUnit: "g (1 EL)",
  },
  {
    id: "basic-kartoffeln",
    name: "Kartoffeln / Süßkartoffeln",
    brand: "Gemüse",
    caloriesPer100g: 86,
    proteinPer100g: 1.6,
    carbsPer100g: 20.1,
    fatPer100g: 0.1,
    servingSize: 200,
    servingUnit: "g (Portion)",
  },
  {
    id: "basic-brokkoli",
    name: "Brokkoli (Frisch / TK)",
    brand: "Gemüse",
    caloriesPer100g: 34,
    proteinPer100g: 2.8,
    carbsPer100g: 6.6,
    fatPer100g: 0.4,
    servingSize: 150,
    servingUnit: "g (Portion)",
  },
];

// ─── Raw API shape from Open Food Facts ───────────────────────────────────────

interface OFFProduct {
  code?: string;
  _id?: string;
  product_name?: string;
  product_name_de?: string;
  product_name_en?: string;
  brands?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  image_url?: string;
  serving_size?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal"?: number;
    "energy-kcal_value"?: number;
    "energy_100g"?: number; // in kJ
    proteins_100g?: number;
    proteins?: number;
    carbohydrates_100g?: number;
    carbohydrates?: number;
    fat_100g?: number;
    fat?: number;
  };
}

function mapOFFToFoodItem(p: OFFProduct): FoodItem | null {
  const name =
    p.product_name_de ||
    p.product_name ||
    p.product_name_en ||
    "";
  if (!name.trim()) return null;

  const nuts = p.nutriments || {};
  let kcal =
    nuts["energy-kcal_100g"] ??
    nuts["energy-kcal"] ??
    nuts["energy-kcal_value"] ??
    (nuts["energy_100g"] ? Math.round(nuts["energy_100g"] / 4.184) : 0);

  const protein = nuts.proteins_100g ?? nuts.proteins ?? 0;
  const carbs = nuts.carbohydrates_100g ?? nuts.carbohydrates ?? 0;
  const fat = nuts.fat_100g ?? nuts.fat ?? 0;

  // Round values
  kcal = Math.round(Number(kcal) || 0);
  const pVal = Math.round((Number(protein) || 0) * 10) / 10;
  const cVal = Math.round((Number(carbs) || 0) * 10) / 10;
  const fVal = Math.round((Number(fat) || 0) * 10) / 10;

  const imageUrl =
    p.image_front_small_url || p.image_small_url || p.image_url || undefined;

  return {
    id: p.code || p._id || `off-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    brand: p.brands ? p.brands.split(",")[0].trim() : undefined,
    caloriesPer100g: kcal,
    proteinPer100g: pVal,
    carbsPer100g: cVal,
    fatPer100g: fVal,
    barcode: p.code,
    imageUrl,
  };
}

// ─── API Search Functions ─────────────────────────────────────────────────────

/**
 * Live search on Open Food Facts database
 */
export async function searchOpenFoodFacts(term: string): Promise<FoodItem[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const url = `${OFF_API_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(
    query
  )}&search_simple=1&action=process&json=1&page_size=24`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HybridAthleteApp/1.0 (NutritionTracker)",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const products: OFFProduct[] = data.products || [];

    const mapped = products
      .map(mapOFFToFoodItem)
      .filter((item): item is FoodItem => item !== null);

    return mapped;
  } catch (err) {
    console.error("Error searching Open Food Facts:", err);
    return [];
  }
}

/**
 * Barcode lookup from Open Food Facts
 */
export async function fetchProductByBarcode(
  barcode: string
): Promise<FoodItem | null> {
  const code = barcode.trim();
  if (!code) return null;

  const url = `${OFF_API_BASE}/api/v2/product/${encodeURIComponent(code)}.json`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HybridAthleteApp/1.0 (NutritionTracker)",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status === 1 && data.product) {
      return mapOFFToFoodItem(data.product);
    }
    return null;
  } catch (err) {
    console.error("Error fetching product by barcode:", err);
    return null;
  }
}

// ─── Nutrient Calculations ────────────────────────────────────────────────────

export function calculateNutrients(
  food: FoodItem,
  amountGrams: number
): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const ratio = (amountGrams || 0) / 100;
  return {
    calories: Math.round(food.caloriesPer100g * ratio),
    protein: Math.round(food.proteinPer100g * ratio * 10) / 10,
    carbs: Math.round((food.carbsPer100g || 0) * ratio * 10) / 10,
    fat: Math.round((food.fatPer100g || 0) * ratio * 10) / 10,
  };
}

// ─── TDEE / Macro Target Calculator ──────────────────────────────────────────

export interface MacroCalculationParams {
  weightKg: number;
  heightCm?: number;
  age?: number;
  gender?: "male" | "female";
  activityLevel: "sedentary" | "light" | "moderate" | "heavy" | "athlete";
  goal: "cut" | "maintain" | "bulk";
  proteinTargetGPerKg?: number; // e.g. 2.0g for hybrid athlete
}

export function calculateNutritionTargets(
  params: MacroCalculationParams
): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
} {
  const { weightKg, heightCm = 180, age = 28, gender = "male", activityLevel, goal } = params;

  // Mifflin-St Jeor formula for BMR
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  bmr = gender === "male" ? bmr + 5 : bmr - 161;

  // Activity multipliers
  const multMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    heavy: 1.725,
    athlete: 1.9,
  };
  const multiplier = multMap[activityLevel] || 1.55;
  const maintenance = Math.round(bmr * multiplier);

  let targetCalories = maintenance;
  if (goal === "cut") targetCalories = Math.round(maintenance * 0.82); // -18% deficit
  if (goal === "bulk") targetCalories = Math.round(maintenance * 1.12); // +12% surplus

  // Protein target: 2.0g per kg for athletes (optimal for hybrid training)
  const proteinGPerKg = params.proteinTargetGPerKg || 2.0;
  const protein = Math.round(weightKg * proteinGPerKg);

  // Fat target: ~0.9g per kg (or ~25% of calories)
  const fat = Math.round(weightKg * 0.9);

  // Carbs fill the remainder: (Calories - (Protein*4 + Fat*9)) / 4
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const remainingKcal = Math.max(0, targetCalories - (proteinKcal + fatKcal));
  const carbs = Math.round(remainingKcal / 4);

  // Recommended hydration: ~35-40ml per kg body weight
  const waterMl = Math.round(weightKg * 40 / 250) * 250;

  return {
    calories: targetCalories,
    protein,
    carbs,
    fat,
    waterMl: Math.max(2500, waterMl),
  };
}
