"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Copy,
  Clock,
  Minus,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Layers,
} from "lucide-react";
import {
  GroceryItem,
  GroceryCategory,
  HybridRecipe,
  POPULAR_HYBRID_RECIPES,
  CATEGORY_LABELS,
  getStoredShoppingList,
  saveShoppingList,
} from "@/lib/nutrition/shoppingListService";
import { generateId, cn } from "@/lib/utils";

interface NutritionPlannerTabProps {
  onOpenShoppingList: () => void;
  onOpenMealPlanner: () => void;
}

export default function NutritionPlannerTab({
  onOpenShoppingList,
  onOpenMealPlanner,
}: NutritionPlannerTabProps) {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [servings, setServings] = useState<Record<string, number>>({});
  const [addedRecipeMsg, setAddedRecipeMsg] = useState<string | null>(null);

  // New item input
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemCat, setNewItemCat] = useState<GroceryCategory>("produce");

  useEffect(() => {
    queueMicrotask(() => setItems(getStoredShoppingList()));
  }, []);

  function toggleItem(id: string) {
    const next = items.map((it) => (it.id === id ? { ...it, isChecked: !it.isChecked } : it));
    setItems(next);
    saveShoppingList(next);
  }

  function deleteItem(id: string) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    saveShoppingList(next);
  }

  function clearChecked() {
    const next = items.filter((it) => !it.isChecked);
    setItems(next);
    saveShoppingList(next);
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const newItem: GroceryItem = {
      id: generateId(),
      name: newItemName.trim(),
      amount: newItemAmount.trim() || "1x",
      category: newItemCat,
      isChecked: false,
    };

    const next = [newItem, ...items];
    setItems(next);
    saveShoppingList(next);

    setNewItemName("");
    setNewItemAmount("");
  }

  function getRecipeServings(recipeId: string): number {
    return servings[recipeId] || 1;
  }

  function setRecipeServings(recipeId: string, count: number) {
    setServings((prev) => ({
      ...prev,
      [recipeId]: Math.max(1, Math.min(8, count)),
    }));
  }

  function handleAddRecipeIngredients(recipe: HybridRecipe) {
    const count = getRecipeServings(recipe.id);
    const newItems: GroceryItem[] = recipe.ingredients.map((ing) => {
      let scaledAmount = ing.amount;
      const numMatch = ing.amount.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml|EL|TL|Stk|x)?$/i);
      if (numMatch) {
        const val = parseFloat(numMatch[1].replace(",", "."));
        const unit = numMatch[2] || "";
        scaledAmount = `${Math.round(val * count)}${unit ? ` ${unit}` : ""}`;
      } else if (count > 1) {
        scaledAmount = `${ing.amount} (x${count})`;
      }

      return {
        id: generateId(),
        name: ing.name,
        amount: scaledAmount,
        category: ing.category,
        isChecked: false,
        recipeSource: `${recipe.title} (${count}p)`,
      };
    });

    const next = [...newItems, ...items];
    setItems(next);
    saveShoppingList(next);

    setAddedRecipeMsg(`✅ Zutaten für „${recipe.title}“ (${count}x) auf die Liste gesetzt!`);
    setTimeout(() => setAddedRecipeMsg(null), 3000);
  }

  function handleCopyAsText() {
    const activeItems = items.filter((it) => !it.isChecked);
    if (activeItems.length === 0) return;

    const grouped: Record<string, string[]> = {};
    activeItems.forEach((it) => {
      const catName = CATEGORY_LABELS[it.category]?.label || "Sonstiges";
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(`• ${it.name} (${it.amount})`);
    });

    let text = `🛒 HYBRID ATHLETE EINKAUFSLISTE (${new Date().toLocaleDateString("de-DE")})\n\n`;
    Object.entries(grouped).forEach(([cat, lines]) => {
      text += `[${cat}]\n${lines.join("\n")}\n\n`;
    });

    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const uncheckedCount = items.filter((it) => !it.isChecked).length;
  const checkedCount = items.filter((it) => it.isChecked).length;

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-6 sm:space-y-8 pb-28 md:pb-8">
      {/* ── 1. Top Section: AI Meal Planner Callout & Stats ─────────────────── */}
      <div className="p-5 sm:p-7 rounded-3xl bg-linear-to-r from-blue-900/30 via-zinc-900 to-zinc-900 border border-blue-500/30 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-zinc-100 flex items-center gap-2">
              <span>KI-Mahlzeitenplaner (Meal Prep)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Tages-Makros: 2.506 kcal
              </span>
            </h2>
            <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">
              Lasse dir von der KI vollwertige, auf deine Tages-Makros abgestimmte Rezepte inklusive Mengenangaben berechnen.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenMealPlanner}
          className="px-5 py-3 rounded-2xl bg-blue-500 hover:bg-blue-400 text-zinc-950 font-bold text-xs shadow-lg shadow-blue-500/25 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0"
        >
          <Sparkles size={15} />
          <span>Mahlzeitenplaner starten</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {addedRecipeMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold animate-in fade-in flex items-center justify-between">
          <span>{addedRecipeMsg}</span>
          <CheckCircle2 size={16} />
        </div>
      )}

      {/* ── 2. Two-Column Live Widgets: Shopping List (Left) & Recipes (Right) ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Interactive Shopping List Widget */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Aktuelle Einkaufsliste
                  </h3>
                  <span className="text-[11px] text-neutral-400 font-medium">
                    {uncheckedCount} offen • {checkedCount} erledigt
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyAsText}
                  disabled={items.length === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                    copied
                      ? "bg-emerald-500 text-zinc-950"
                      : "bg-zinc-800 hover:bg-zinc-700 text-neutral-200"
                  )}
                  title="Als formatierte Liste kopieren"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span className="hidden sm:inline">{copied ? "Kopiert! ✅" : "Kopieren"}</span>
                </button>
                <button
                  onClick={onOpenShoppingList}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-neutral-300 transition-colors"
                  title="Im Vollbild-Modal öffnen"
                >
                  <Layers size={14} />
                </button>
              </div>
            </div>

            {/* Inline Quick Add */}
            <form onSubmit={handleAddItem} className="flex gap-2">
              <input
                type="text"
                placeholder="Artikel hinzufügen..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-emerald-500 font-medium"
              />
              <input
                type="text"
                placeholder="Menge (500g)"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(e.target.value)}
                className="w-24 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-emerald-500 font-medium"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center shrink-0"
              >
                <Plus size={14} />
              </button>
            </form>

            {/* List items */}
            {items.length === 0 ? (
              <div className="p-6 rounded-2xl bg-zinc-950/50 border border-dashed border-zinc-800 text-center text-xs text-neutral-400">
                Keine Artikel auf der Liste. Wähle ein Rezept rechts oder tippe oben Artikel ein!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-2xl border transition-all",
                      item.isChecked
                        ? "bg-zinc-950/40 border-zinc-900 opacity-50"
                        : "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700"
                    )}
                  >
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                          item.isChecked
                            ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                            : "border-zinc-700 bg-zinc-900"
                        )}
                      >
                        {item.isChecked && <Check size={10} className="stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "text-xs font-bold block truncate",
                            item.isChecked ? "line-through text-neutral-500" : "text-zinc-100"
                          )}
                        >
                          {item.name}
                        </span>
                        {item.recipeSource && (
                          <span className="text-[10px] text-neutral-400 font-medium block truncate">
                            Aus: {item.recipeSource}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {item.amount}
                      </span>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="p-2 -m-1 text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {checkedCount > 0 && (
            <button
              onClick={clearChecked}
              className="w-full py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-neutral-400 hover:text-rose-400 hover:border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              Erledigte Artikel entfernen ({checkedCount})
            </button>
          )}
        </div>

        {/* Right Column: Popular Hybrid Performance Recipes */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
              <BookOpen size={17} className="text-emerald-400" />
              <span>Beliebte Hybrid-Athleten Rezepte</span>
            </h3>
            <span className="text-[11px] text-neutral-400">Portionen skalierbar</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {POPULAR_HYBRID_RECIPES.map((recipe) => {
              const count = getRecipeServings(recipe.id);
              const scaledKcal = Math.round(recipe.calories * count);
              const scaledP = Math.round(recipe.protein * count);
              const scaledC = Math.round(recipe.carbs * count);
              const scaledF = Math.round(recipe.fat * count);

              return (
                <div
                  key={recipe.id}
                  className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-4 flex flex-col justify-between shadow-md hover:border-zinc-700 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            {recipe.category === "breakfast"
                              ? "Frühstück"
                              : recipe.category === "lunch"
                              ? "Mittagessen"
                              : recipe.category === "dinner"
                              ? "Abendessen"
                              : "Snack"}
                          </span>
                          <span className="text-[11px] text-neutral-400 font-medium flex items-center gap-1">
                            <Clock size={11} />
                            {recipe.prepTimeMinutes} Min
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-zinc-100 mt-1">{recipe.title}</h4>
                      </div>

                      {/* Portion Scaler */}
                      <div className="flex items-center gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRecipeServings(recipe.id, count - 1)}
                          className="p-2 -m-1 text-neutral-400 hover:text-zinc-100 transition-colors"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-xs font-mono font-bold text-emerald-400 px-1">
                          {count}p
                        </span>
                        <button
                          type="button"
                          onClick={() => setRecipeServings(recipe.id, count + 1)}
                          className="p-2 -m-1 text-neutral-400 hover:text-zinc-100 transition-colors"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Macro Badges */}
                    <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                      <div className="p-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800">
                        <span className="text-[9px] text-neutral-400 block font-sans">Kcal</span>
                        <span className="font-black text-zinc-100">{scaledKcal}</span>
                      </div>
                      <div className="p-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <span className="text-[9px] text-blue-400 block font-sans">P</span>
                        <span className="font-black text-blue-300">{scaledP}g</span>
                      </div>
                      <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-[9px] text-amber-400 block font-sans">C</span>
                        <span className="font-black text-amber-300">{scaledC}g</span>
                      </div>
                      <div className="p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <span className="text-[9px] text-rose-400 block font-sans">F</span>
                        <span className="font-black text-rose-300">{scaledF}g</span>
                      </div>
                    </div>

                    {/* 2-Column Clean Ingredients List */}
                    <div className="space-y-1 pt-1">
                      {recipe.ingredients.slice(0, 3).map((ing, i) => {
                        let displayAmount = ing.amount;
                        const numMatch = ing.amount.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml|EL|TL|Stk|x)?$/i);
                        if (numMatch) {
                          const val = parseFloat(numMatch[1].replace(",", "."));
                          const unit = numMatch[2] || "";
                          displayAmount = `${Math.round(val * count)}${unit ? ` ${unit}` : ""}`;
                        } else if (count > 1) {
                          displayAmount = `${ing.amount} (x${count})`;
                        }

                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-[11px]"
                          >
                            <span className="text-neutral-200 font-medium truncate" title={ing.name}>
                              {ing.name}
                            </span>
                            <span className="font-mono font-bold text-amber-400 shrink-0">
                              {displayAmount}
                            </span>
                          </div>
                        );
                      })}
                      {recipe.ingredients.length > 3 && (
                        <span className="text-[10px] text-neutral-400 block text-right pt-0.5">
                          + {recipe.ingredients.length - 3} weitere Zutaten
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddRecipeIngredients(recipe)}
                    className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>{count > 1 ? `${count} Portionen` : "Zutaten"} auf Liste</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
