// ─── OpenFoodFacts Service ───────────────────────────────────────────────────

import { FoodItem } from "@/types";

export interface OpenFoodFactsProduct {
  code: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: string;
}

const cache = new Map<string, OpenFoodFactsProduct | null>();

/**
 * Fetch product data from OpenFoodFacts API using EAN/UPC Barcode
 */
export async function fetchProductByBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  if (cache.has(cleanBarcode)) {
    return cache.get(cleanBarcode)!;
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanBarcode)}.json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HybridAthleteApp - Web/1.0",
      },
    });

    if (!res.ok) {
      cache.set(cleanBarcode, null);
      return null;
    }

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      cache.set(cleanBarcode, null);
      return null;
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    const name =
      p.product_name_de ||
      p.product_name ||
      p.generic_name_de ||
      p.generic_name ||
      "Unbekanntes Produkt";

    const caloriesPer100g = Math.round(
      nutriments["energy-kcal_100g"] ||
      (nutriments["energy_100g"] ? nutriments["energy_100g"] / 4.184 : 0)
    );

    const proteinPer100g = Math.round((nutriments["proteins_100g"] || 0) * 10) / 10;
    const carbsPer100g = Math.round((nutriments["carbohydrates_100g"] || 0) * 10) / 10;
    const fatPer100g = Math.round((nutriments["fat_100g"] || 0) * 10) / 10;

    const product: OpenFoodFactsProduct = {
      code: cleanBarcode,
      name,
      brand: p.brands || undefined,
      imageUrl: p.image_front_small_url || p.image_url || undefined,
      caloriesPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      servingSize: p.serving_size || undefined,
    };

    cache.set(cleanBarcode, product);
    return product;
  } catch (err) {
    console.warn("OpenFoodFacts Fehler:", err);
    return null;
  }
}
