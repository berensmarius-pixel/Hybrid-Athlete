import { describe, expect, it } from "vitest";
import type { RecipeSuggestion } from "@/types";
import {
  calculateExpiryScore,
  computeItemMacros,
  deductPantryQuantities,
  getDaysUntilExpiry,
  getExpiryUrgency,
  sortPantryByExpiry,
  validateAndHydrateRecipes,
} from "./pantryService";
import type { PantryItem } from "@/types";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: "item-1",
    name: "Test",
    quantity: 500,
    unit: "g",
    addedAt: new Date().toISOString(),
    caloriesPer100g: 100,
    macros: { protein: 10, carbs: 5, fat: 2 },
    ...overrides,
  };
}

describe("getDaysUntilExpiry / getExpiryUrgency", () => {
  it("berechnet Tage bis zum MHD korrekt", () => {
    const today = new Date(2026, 7, 25);
    expect(getDaysUntilExpiry("2026-08-28", today)).toBe(3);
    expect(getDaysUntilExpiry("2026-08-25", today)).toBe(0);
    expect(getDaysUntilExpiry("2026-08-24", today)).toBe(-1);
  });

  it("stuft Dringlichkeit korrekt ein", () => {
    const today = new Date(2026, 7, 25);
    expect(getExpiryUrgency({ expirationDate: "2026-08-24" })).toBe("expired");
    // days=2 (<3) → critical
    expect(getDaysUntilExpiry("2026-08-27", today)).toBe(2);
    expect(getExpiryUrgency({ expirationDate: daysFromNow(2) })).toBe("critical");
    expect(getExpiryUrgency({ expirationDate: daysFromNow(3) })).toBe("warning");
    expect(getExpiryUrgency({ expirationDate: daysFromNow(6) })).toBe("warning");
    expect(getExpiryUrgency({ expirationDate: daysFromNow(7) })).toBe("stable");
    expect(getExpiryUrgency({} as PantryItem)).toBe("stable");
  });
});

describe("sortPantryByExpiry", () => {
  it("sortiert kritische zuerst, ohne Datum ans Ende", () => {
    const items = [
      makeItem({ id: "a", expirationDate: daysFromNow(10) }),
      makeItem({ id: "b", expirationDate: daysFromNow(-1) }),
      makeItem({ id: "c" }),
      makeItem({ id: "d", expirationDate: daysFromNow(1) }),
    ];
    expect(sortPantryByExpiry(items).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("computeItemMacros", () => {
  it("rechnet Makros auf Mengen & Einheiten um", () => {
    const item = makeItem({ caloriesPer100g: 200, macros: { protein: 20, carbs: 10, fat: 4 } });
    expect(computeItemMacros(item, 150, "g")).toEqual({
      calories: 300, protein: 30, carbs: 15, fat: 6,
    });
    expect(computeItemMacros(item, 1, "kg")).toEqual({
      calories: 2000, protein: 200, carbs: 100, fat: 40,
    });
    // Stückware: gramsPerPiece = 50 → 2 Stück = 100 g Basis
    const piece = makeItem({ caloriesPer100g: 100, macros: { protein: 10, carbs: 0, fat: 0 }, gramsPerPiece: 50 });
    expect(computeItemMacros(piece, 2, "stk").calories).toBe(100);
  });
});

describe("deductPantryQuantities", () => {
  it("zieht Mengen ab und entfernt leere Items", () => {
    const items = [
      makeItem({ id: "a", quantity: 400 }),
      makeItem({ id: "b", quantity: 200, unit: "ml" }),
    ];
    const result = deductPantryQuantities(items, [
      { pantryItemId: "a", amountUsed: 150, unit: "g" },
      { pantryItemId: "b", amountUsed: 250, unit: "ml" }, // Überziehung → 0 → entfernt
    ]);
    expect(result.find((i) => i.id === "a")?.quantity).toBe(250);
    expect(result.find((i) => i.id === "b")).toBeUndefined();
  });

  it("summiert mehrere Uses aufs gleiche Item und ignoriert unbekannte IDs", () => {
    const items = [makeItem({ id: "a", quantity: 1000 })];
    const result = deductPantryQuantities(items, [
      { pantryItemId: "a", amountUsed: 200, unit: "g" },
      { pantryItemId: "a", amountUsed: 0.3, unit: "kg" },
      { pantryItemId: "ghost", amountUsed: 99, unit: "g" },
    ]);
    expect(result[0].quantity).toBe(500);
  });
});

describe("calculateExpiryScore", () => {
  it("gewichtet dringende Artikel höher", () => {
    const critical = makeItem({ id: "crit", expirationDate: daysFromNow(1), quantity: 100 });
    const stable = makeItem({ id: "stab", quantity: 100 });
    expect(calculateExpiryScore([{ pantryItemId: "crit", amountUsed: 100, unit: "g" }], [critical, stable])).toBeGreaterThan(
      calculateExpiryScore([{ pantryItemId: "stab", amountUsed: 100, unit: "g" }], [critical, stable])
    );
  });
});

describe("validateAndHydrateRecipes", () => {
  it("validiert Payload, klemmt Mengen und berechnet Makros lokal", () => {
    const item = makeItem({
      id: "a",
      name: "Quark",
      quantity: 200,
      expirationDate: daysFromNow(1),
      caloriesPer100g: 100,
      macros: { protein: 12, carbs: 4, fat: 0 },
    });

    const recipes = validateAndHydrateRecipes(
      [
        {
          title: "Quark Bowl",
          description: "Schnell & proteinreich",
          total_prep_time_min: 10,
          servings: 2,
          used_pantry_ingredients: [
            { pantry_item_id: "a", name: "Quark", amount_used: 999, unit: "g" }, // > Bestand
            { pantry_item_id: "unknown-id", name: "Geist", amount_used: 50, unit: "g" }, // wird entfernt
          ],
          missing_ingredients_to_buy: ["Beeren"],
          steps: ["Quark in die Schüssel.", "Beeren darauf."],
        },
      ],
      [item]
    );

    expect(recipes).toHaveLength(1);
    const r = recipes[0] as RecipeSuggestion;
    expect(r.pantryItemsUsed).toHaveLength(1);
    expect(r.pantryItemsUsed[0].amountUsed).toBe(200); // geklemmt
    expect(r.totalMacros.calories).toBe(200); // lokal berechnet
    expect(r.expiryScore).toBeGreaterThan(0);
    expect(r.missingIngredients[0].name).toBe("Beeren");
  });

  it("verwirft Rezepte ohne gültige Vorrats-Zutaten oder Titel", () => {
    expect(validateAndHydrateRecipes([{ title: "" }, { foo: 1 }, "kein objekt"], [makeItem()])).toHaveLength(0);
  });
});
