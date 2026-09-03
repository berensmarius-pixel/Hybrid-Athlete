"use client";

import { useState, useEffect } from "react";
import {
  X,
  ShoppingCart,
  Plus,
  Trash2,
  Check,
  Copy,
  BookOpen,
  Sparkles,
  Flame,
  Dumbbell,
  Clock,
  ChevronRight,
  CheckCircle2,
  Share2,
  RotateCcw,
  Minus,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
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

interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShoppingListModal({ isOpen, onClose }: ShoppingListModalProps) {
  const { nutritionLogs } = useApp();

  const [activeTab, setActiveTab] = useState<"list" | "recipes">("list");
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [servings, setServings] = useState<Record<string, number>>({});

  // New item form
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemCat, setNewItemCat] = useState<GroceryCategory>("produce");
  const [addedRecipeMsg, setAddedRecipeMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => setItems(getStoredShoppingList()));
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
      // Scale numeric amounts if possible
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
        recipeSource: `${recipe.title} (${count} Portion${count > 1 ? "en" : ""})`,
      };
    });

    const next = [...newItems, ...items];
    setItems(next);
    saveShoppingList(next);

    setAddedRecipeMsg(`Zutaten für „${recipe.title}“ (${count}x) zur Einkaufsliste hinzugefügt!`);
    setTimeout(() => setAddedRecipeMsg(null), 3000);
    setActiveTab("list");
  }

  function handleCopyAsText() {
    const activeItems = items.filter((it) => !it.isChecked);
    if (activeItems.length === 0) return;

    // Group by category
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

  // Count items
  const uncheckedCount = items.filter((it) => !it.isChecked).length;
  const checkedCount = items.filter((it) => it.isChecked).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header with Generous Spacing */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3.5 flex-wrap min-w-0">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
              <ShoppingCart size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-zinc-100">
                  Einkaufsliste & Hybrid-Rezepte
                </h2>
                {uncheckedCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {uncheckedCount} Artikel offen
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Performance-Rezepte mit 1 Klick portionieren und einkaufen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 px-4 sm:px-6 pt-2 gap-3 shrink-0 bg-zinc-950/80">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "list"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-zinc-200"
            )}
          >
            <ShoppingCart size={14} />
            <span>Einkaufsliste ({uncheckedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("recipes")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "recipes"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-zinc-200"
            )}
          >
            <BookOpen size={14} />
            <span>Hybrid Rezepte ({POPULAR_HYBRID_RECIPES.length})</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Success Banner */}
          {addedRecipeMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-in fade-in flex items-center justify-between">
              <span>{addedRecipeMsg}</span>
              <CheckCircle2 size={16} />
            </div>
          )}

          {/* ── TAB 1: Einkaufsliste ────────────────────────────────────────── */}
          {activeTab === "list" && (
            <div className="space-y-4">
              {/* Quick Add Form */}
              <form onSubmit={handleAddItem} className="p-4 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                  Neuen Artikel hinzufügen
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Artikelname (z. B. Magerquark, Bananen)..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-emerald-500 font-medium"
                  />
                  <input
                    type="text"
                    placeholder="Menge (500g)"
                    value={newItemAmount}
                    onChange={(e) => setNewItemAmount(e.target.value)}
                    className="w-full sm:w-28 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-emerald-500 font-medium"
                  />
                  <select
                    value={newItemCat}
                    onChange={(e) => setNewItemCat(e.target.value as any)}
                    className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-neutral-300 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus size={15} />
                    <span>Hinzufügen</span>
                  </button>
                </div>
              </form>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={handleCopyAsText}
                  disabled={items.length === 0}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs",
                    copied
                      ? "bg-emerald-500 text-zinc-950"
                      : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-neutral-200"
                  )}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "In die Zwischenablage kopiert!" : "Als Text kopieren"}</span>
                </button>

                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearChecked}
                    className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Erledigte löschen ({checkedCount})</span>
                  </button>
                )}
              </div>

              {/* Grouped Shopping Items */}
              {items.length === 0 ? (
                <div className="p-8 rounded-3xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                    <ShoppingCart size={22} />
                  </div>
                  <p className="text-xs text-neutral-400 font-medium">
                    Deine Einkaufsliste ist aktuell leer. Füge oben Artikel hinzu oder wähle ein Hybrid-Rezept!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(CATEGORY_LABELS).map(([catKey, catInfo]) => {
                    const catItems = items.filter((it) => it.category === catKey);
                    if (catItems.length === 0) return null;

                    return (
                      <div key={catKey} className="p-4 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                          <span>{catInfo.icon}</span>
                          <span>{catInfo.label}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-neutral-400 font-mono">
                            {catItems.length}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {catItems.map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-2xl border transition-all",
                                item.isChecked
                                  ? "bg-zinc-950/40 border-zinc-900 opacity-50"
                                  : "bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700"
                              )}
                            >
                              <button
                                onClick={() => toggleItem(item.id)}
                                className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                              >
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                                    item.isChecked
                                      ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                                      : "border-zinc-700 bg-zinc-900"
                                  )}
                                >
                                  {item.isChecked && <Check size={12} className="stroke-[3]" />}
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

                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                                  {item.amount}
                                </span>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="p-2 -m-1 text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: Hybrid Performance Rezepte ───────────────────────────── */}
          {activeTab === "recipes" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POPULAR_HYBRID_RECIPES.map((recipe) => {
                const count = getRecipeServings(recipe.id);
                const scaledKcal = Math.round(recipe.calories * count);
                const scaledP = Math.round(recipe.protein * count);
                const scaledC = Math.round(recipe.carbs * count);
                const scaledF = Math.round(recipe.fat * count);

                return (
                  <div
                    key={recipe.id}
                    className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 space-y-4 flex flex-col justify-between shadow-md hover:border-zinc-700 transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              {recipe.category === "breakfast"
                                ? "Frühstück"
                                : recipe.category === "lunch"
                                ? "Mittagessen"
                                : recipe.category === "dinner"
                                ? "Abendessen"
                                : "Snack"}
                            </span>
                            <span className="text-xs text-neutral-400 font-medium flex items-center gap-1">
                              <Clock size={11} />
                              {recipe.prepTimeMinutes} Min
                            </span>
                          </div>
                          <h3 className="text-sm sm:text-base font-black text-zinc-100 mt-1">
                            {recipe.title}
                          </h3>
                        </div>

                        {/* Portion Scaler */}
                        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800 shrink-0">
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

                      {/* Scaled Macro Badges */}
                      <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                        <div className="p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                          <span className="text-[9px] text-neutral-400 block font-sans">Kcal</span>
                          <span className="text-xs font-black text-zinc-100">{scaledKcal}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          <span className="text-[9px] text-blue-400 block font-sans">Protein</span>
                          <span className="text-xs font-black text-blue-300">{scaledP}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <span className="text-[9px] text-amber-400 block font-sans">Carbs</span>
                          <span className="text-xs font-black text-amber-300">{scaledC}g</span>
                        </div>
                        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                          <span className="text-[9px] text-rose-400 block font-sans">Fett</span>
                          <span className="text-xs font-black text-rose-300">{scaledF}g</span>
                        </div>
                      </div>

                      {/* 2-Column Clean Ingredients List */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                          Zutaten ({count} Portion{count > 1 ? "en" : ""}):
                        </span>
                        <div className="space-y-1">
                          {recipe.ingredients.map((ing, i) => {
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
                                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs"
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
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddRecipeIngredients(recipe)}
                      className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>{count > 1 ? `${count} Portionen` : "Zutaten"} auf Einkaufsliste</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
