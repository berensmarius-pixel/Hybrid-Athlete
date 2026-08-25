// ─── Smart Pantry Service ─────────────────────────────────────────────────────
// Verfallslogik, Dringlichkeits-Sortierung, Makro-Berechnung und
// Mengen-Abzug für den Lebensmittelverfalls- & Aufbrauch-Assistenten.

import type {
  MacroBreakdown,
  PantryItem,
  PantryUrgency,
  PantryUnit,
  RecipeIngredientUse,
} from "@/types";

// ─── Fälligkeit / Dringlichkeit ───────────────────────────────────────────────

/**
 * Tage bis zum MHD (0 = heute, negativ = überfällig).
 */
export function getDaysUntilExpiry(expirationDate: string, today: Date = new Date()): number {
  const [y, m, d] = expirationDate.split("-").map(Number);
  if (!y || !m || !d) return Number.POSITIVE_INFINITY;
  const expiry = new Date(y, m - 1, d);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * expired (< 0) · critical (< 3 Tage) · warning (< 7 Tage) · stable.
 * Items ohne MHD gelten als "stable".
 */
export function getExpiryUrgency(item: Pick<PantryItem, "expirationDate">): PantryUrgency {
  if (!item.expirationDate) return "stable";
  const days = getDaysUntilExpiry(item.expirationDate);
  if (days < 0) return "expired";
  if (days < 3) return "critical";
  if (days < 7) return "warning";
  return "stable";
}

/** Sortiert nach MHD aufsteigend; Items ohne Datum ans Ende. */
export function sortPantryByExpiry<T extends Pick<PantryItem, "expirationDate">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.expirationDate ? getDaysUntilExpiry(a.expirationDate) : Number.POSITIVE_INFINITY;
    const db = b.expirationDate ? getDaysUntilExpiry(b.expirationDate) : Number.POSITIVE_INFINITY;
    return da - db;
  });
}

const URGENCY_WEIGHT: Record<PantryUrgency, number> = {
  expired: 4,
  critical: 3,
  warning: 2,
  stable: 1,
};

/**
 * Expiry-Score 0–100: Anteil der dringenden Vorrats-Masse (gewichtet nach
 * Dringlichkeit), die das Rezept verwertet – relativ zum Gesamtbestand.
 */
export function calculateExpiryScore(
  uses: Array<{ pantryItemId: string; amountUsed: number; unit: PantryUnit }>,
  pantryItems: PantryItem[]
): number {
  const byId = new Map(pantryItems.map((i) => [i.id, i]));
  let usedWeight = 0;
  let totalWeight = 0;

  for (const item of pantryItems) {
    const weight = URGENCY_WEIGHT[getExpiryUrgency(item)] * toBaseUnits(item.quantity, item.unit);
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 0;

  for (const use of uses) {
    const item = byId.get(use.pantryItemId);
    if (!item) continue;
    const clamped = Math.min(use.amountUsed, item.quantity);
    usedWeight += URGENCY_WEIGHT[getExpiryUrgency(item)] * toBaseUnits(clamped, use.unit);
  }

  return Math.round((usedWeight / totalWeight) * 100);
}

// ─── Einheiten & Makros ───────────────────────────────────────────────────────

const UNIT_TO_BASE: Record<PantryUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  stk: 1,
};

/** Normalisiert eine Menge auf g bzw. ml ("stk" zählt als 1 Einheit × Faktor). */
export function toBaseUnits(amount: number, unit: PantryUnit): number {
  return Math.max(0, amount) * UNIT_TO_BASE[unit];
}

/**
 * Makros für eine konkrete Menge eines Vorrats-Artikels.
 * Basis: Nährwerte pro 100 g/ml; bei "stk" wird gramsPerPiece (Default 100 g)
 * als Stückgewicht angenommen. Gilt nicht für reine Volume-Einheiten ohne
 * Kalorienbasis – dort wird 1:1 wie bei Gramm gerechnet (Dichte ~1).
 */
export function computeItemMacros(item: PantryItem, amountUsed: number, unit: PantryUnit): MacroBreakdown {
  let baseAmount = toBaseUnits(amountUsed, unit);

  if (unit === "stk") {
    baseAmount = amountUsed * (item.gramsPerPiece ?? 100);
  }

  const factor = baseAmount / 100;
  return {
    calories: Math.round((item.caloriesPer100g || 0) * factor),
    protein: round1((item.macros?.protein || 0) * factor),
    carbs: round1((item.macros?.carbs || 0) * factor),
    fat: round1((item.macros?.fat || 0) * factor),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function sumMacros(list: MacroBreakdown[]): MacroBreakdown {
  return list.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: round1(acc.protein + m.protein),
      carbs: round1(acc.carbs + m.carbs),
      fat: round1(acc.fat + m.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// ─── Mengen-Abzug (Pantry Auto-Update) ────────────────────────────────────────

/**
 * Zieht verwendete Mengen vom Bestand ab.
 * - Überziehungen werden auf 0 geklemmt (nie negative Bestände).
 * - Items mit Restmenge <= Epsilon werden komplett entfernt.
 * - Unbekannte pantryItemIds werden ignoriert.
 */
export function deductPantryQuantities(
  items: PantryItem[],
  uses: Array<{ pantryItemId: string; amountUsed: number; unit: PantryUnit }>
): PantryItem[] {
  const EPSILON = 1e-6;

  // Mehrere Uses aufs gleiche Item summieren (in Basiseinheiten)
  const deductionBase = new Map<string, number>();
  for (const use of uses) {
    if (!use || typeof use.amountUsed !== "number" || !Number.isFinite(use.amountUsed)) continue;
    const prev = deductionBase.get(use.pantryItemId) ?? 0;
    deductionBase.set(use.pantryItemId, prev + toBaseUnits(use.amountUsed, use.unit));
  }

  return items
    .map((item) => {
      const deductBase = deductionBase.get(item.id);
      if (deductBase === undefined) return item;

      // Abzugs-Menge in die Item-Einheit zurückrechnen
      const factor = UNIT_TO_BASE[item.unit];
      const remaining = item.quantity - deductBase / factor;
      return { ...item, quantity: Math.max(0, remaining) };
    })
    .filter((item) => item.quantity > EPSILON);
}

// ─── Validierung von KI-Rezept-Payloads ───────────────────────────────────────

const VALID_UNITS: readonly PantryUnit[] = ["g", "kg", "ml", "l", "stk"];

/**
 * Prüft und normalisiert die vom LLM gelieferten Rezept-Vorschläge:
 * - Unbekannte pantryItemIds werden entfernt.
 * - Mengen werden auf den Bestand geklemmt.
 * - Makros werden lokal aus den echten Nährwertdaten neu berechnet
 *   (LLM-Zahlen werden bewusst nicht vertraut).
 * - Expiry-Score wird serverseitig ermittelt.
 */
export function validateAndHydrateRecipes(raw: unknown, pantryItems: PantryItem[]): unknown[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(pantryItems.map((i) => [i.id, i]));

  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;

    const title = typeof e.title === "string" ? e.title.trim() : "";
    if (!title) return [];

    const rawUses = Array.isArray(e.used_pantry_ingredients) ? e.used_pantry_ingredients : [];
    const pantryItemsUsed: RecipeIngredientUse[] = rawUses.flatMap((u) => {
      if (!u || typeof u !== "object") return [];
      const use = u as Record<string, unknown>;
      const id = typeof use.pantry_item_id === "string" ? use.pantry_item_id : "";
      const item = byId.get(id);
      if (!item) return [];
      const amount = Number(use.amount_used);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      const unit = VALID_UNITS.includes(use.unit as PantryUnit) ? (use.unit as PantryUnit) : item.unit;
      return [{
        pantryItemId: item.id,
        name: item.name,
        amountUsed: Math.min(amount, item.quantity),
        unit,
        daysUntilExpiry: item.expirationDate ? getDaysUntilExpiry(item.expirationDate) : undefined,
      }];
    });

    if (pantryItemsUsed.length === 0) return [];

    const macrosList = pantryItemsUsed.map((u) => {
      const item = byId.get(u.pantryItemId)!;
      return computeItemMacros(item, u.amountUsed, u.unit);
    });
    const totalMacros = sumMacros(macrosList);

    const servingsRaw = Number(e.servings);

    return [{
      id: `recipe_${Math.random().toString(36).slice(2, 10)}`,
      title,
      description: typeof e.description === "string" ? e.description.trim() : "",
      totalPrepTimeMin: Number.isFinite(Number(e.total_prep_time_min))
        ? Math.max(1, Math.round(Number(e.total_prep_time_min)))
        : 20,
      servings: Number.isFinite(servingsRaw) && servingsRaw >= 1 ? Math.round(servingsRaw) : 2,
      totalMacros,
      pantryItemsUsed,
      missingIngredients: Array.isArray(e.missing_ingredients_to_buy)
        ? e.missing_ingredients_to_buy
            .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
            .map((m) => ({ name: m.trim() }))
        : [],
      steps: Array.isArray(e.steps) ? e.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [],
      expiryScore: calculateExpiryScore(pantryItemsUsed, pantryItems),
    }];
  });
}
