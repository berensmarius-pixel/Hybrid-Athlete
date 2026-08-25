"use client";

import { useCallback } from "react";
import type { PantryItem, RecipeIngredientUse } from "@/types";
import { generateId } from "@/lib/utils";
import { usePersistentState } from "@/hooks/usePersistentState";
import { deductPantryQuantities } from "@/lib/nutrition/pantryService";

/**
 * Domäne Smart Pantry: Vorratslager inkl. Hinzufügen (Barcode/Manuell),
 * Aktualisieren und Mengen-Abzug nach gekochtem Rezept.
 */

const PANTRY_KEY = "hybrid_athlete_pantry_items";

export function usePantryDomain() {
  const [pantryItems, setPantryItems] = usePersistentState<PantryItem[]>(
    PANTRY_KEY,
    [],
    { validate: (raw) => (Array.isArray(raw) ? (raw as PantryItem[]) : null) }
  );

  const addPantryItem = useCallback(
    (item: Omit<PantryItem, "id" | "addedAt"> & { id?: string; addedAt?: string }) => {
      setPantryItems((prev) => [
        {
          ...item,
          id: item.id || generateId(),
          addedAt: item.addedAt || new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [setPantryItems]
  );

  const updatePantryItem = useCallback(
    (id: string, patch: Partial<Omit<PantryItem, "id">>) => {
      setPantryItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
    },
    [setPantryItems]
  );

  const removePantryItem = useCallback(
    (id: string) => setPantryItems((prev) => prev.filter((i) => i.id !== id)),
    [setPantryItems]
  );

  /** Zieht verwendete Mengen ab; leere Artikel fallen automatisch aus dem Bestand. */
  const consumePantryItems = useCallback(
    (uses: RecipeIngredientUse[]) => {
      setPantryItems((prev) => deductPantryQuantities(prev, uses));
    },
    [setPantryItems]
  );

  return {
    pantryItems,
    addPantryItem,
    updatePantryItem,
    removePantryItem,
    consumePantryItems,
  };
}
