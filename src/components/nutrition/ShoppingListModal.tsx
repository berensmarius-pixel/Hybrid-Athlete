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
import { generateId } from "@/lib/utils";

interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShoppingListModal({ isOpen, onClose }: ShoppingListModalProps) {
  const { nutritionLogs } = useApp();

  const [activeTab, setActiveTab] = useState<"list" | "recipes" | "weekly">("list");
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [copied, setCopied] = useState(false);

  // New item form
  const [newItemName, setNewItemName] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemCat, setNewItemCat] = useState<GroceryCategory>("produce");
  const [addedRecipeMsg, setAddedRecipeMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItems(getStoredShoppingList());
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

  function handleAddRecipeIngredients(recipe: HybridRecipe) {
    const newItems: GroceryItem[] = recipe.ingredients.map((ing) => ({
      id: generateId(),
      name: ing.name,
      amount: ing.amount,
      category: ing.category,
      isChecked: false,
      recipeSource: recipe.title,
    }));

    const next = [...newItems, ...items];
    setItems(next);
    saveShoppingList(next);

    setAddedRecipeMsg(`✅ Zutaten für „${recipe.title}“ zur Einkaufsliste hinzugefügt!`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShoppingCart size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Einkaufsliste & Rezepte</span>
                {uncheckedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {uncheckedCount} Artikel offen
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Performance-Rezepte mit 1 Klick auf die Einkaufsliste setzen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "list"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShoppingCart size={14} />
            <span>Einkaufsliste ({uncheckedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("recipes")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === "recipes"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BookOpen size={14} />
            <span>Hybrid Rezepte ({POPULAR_HYBRID_RECIPES.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {addedRecipeMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{addedRecipeMsg}</span>
            </div>
          )}

          {/* ── TAB 1: Shopping List ───────────────────────────────────────── */}
          {activeTab === "list" && (
            <div className="space-y-4">
              {/* Quick Add Form */}
              <form onSubmit={handleAddItem} className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Artikel (z.B. Haferflocken, Magerquark, Bananen)"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:border-emerald-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Menge (z.B. 500g)"
                    value={newItemAmount}
                    onChange={(e) => setNewItemAmount(e.target.value)}
                    className="w-24 sm:w-28 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <select
                    value={newItemCat}
                    onChange={(e) => setNewItemCat(e.target.value as GroceryCategory)}
                    className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.icon} {val.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    <Plus size={13} />
                    <span>Hinzufügen</span>
                  </button>
                </div>
              </form>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAsText}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold flex items-center gap-1.5 transition-all"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? "Kopiert!" : "Als Text kopieren"}</span>
                  </button>
                </div>

                {checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearChecked}
                    className="text-xs text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>Erledigte löschen ({checkedCount})</span>
                  </button>
                )}
              </div>

              {/* Grouped Items List */}
              {items.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <ShoppingCart size={32} className="mx-auto text-zinc-600" />
                  <p className="text-xs text-zinc-400">Deine Einkaufsliste ist leer.</p>
                  <p className="text-[11px] text-zinc-500">
                    Füge eigene Artikel hinzu oder importiere ein Rezept aus dem Reiter „Hybrid Rezepte“!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(["produce", "protein", "grains", "dairy", "supplements", "pantry", "other"] as GroceryCategory[]).map((cat) => {
                    const catItems = items.filter((it) => it.category === cat);
                    if (catItems.length === 0) return null;

                    const catMeta = CATEGORY_LABELS[cat];

                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 px-1">
                          <span>{catMeta.icon}</span>
                          <span>{catMeta.label}</span>
                          <span className="text-[10px] text-zinc-600">({catItems.length})</span>
                        </div>

                        <div className="space-y-1">
                          {catItems.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => toggleItem(item.id)}
                              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                item.isChecked
                                  ? "bg-zinc-950/40 border-zinc-900 opacity-50"
                                  : "bg-zinc-900 border-zinc-800 hover:border-emerald-500/40"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                    item.isChecked
                                      ? "bg-emerald-500 border-emerald-500 text-zinc-950"
                                      : "border-zinc-700 bg-zinc-950"
                                  }`}
                                >
                                  {item.isChecked && <Check size={12} className="stroke-[3]" />}
                                </div>
                                <div className="min-w-0">
                                  <span
                                    className={`text-xs font-bold block truncate ${
                                      item.isChecked ? "line-through text-zinc-500" : "text-zinc-100"
                                    }`}
                                  >
                                    {item.name}
                                  </span>
                                  {item.recipeSource && (
                                    <span className="text-[10px] text-zinc-500 block truncate">
                                      Aus: {item.recipeSource}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-mono font-bold text-emerald-400/90">
                                  {item.amount}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteItem(item.id);
                                  }}
                                  className="p-1 rounded text-zinc-600 hover:text-rose-400 transition-colors"
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

          {/* ── TAB 2: Hybrid Athlete Recipe Catalog ──────────────────────── */}
          {activeTab === "recipes" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 leading-relaxed">
                Wähle ein Rezept aus – alle Zutaten werden mit einem Klick auf deine Einkaufsliste gesetzt!
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {POPULAR_HYBRID_RECIPES.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="p-4 sm:p-5 rounded-3xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-0.5">
                          {recipe.tag}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-zinc-100">{recipe.title}</h3>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 shrink-0 bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800">
                        <Clock size={12} />
                        {recipe.prepTimeMinutes} Min
                      </span>
                    </div>

                    {/* Macros Bar */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold block">Kalorien</span>
                        <span className="text-xs font-mono font-bold text-amber-400">{recipe.calories} kcal</span>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold block">Protein</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">{recipe.protein}g</span>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold block">Carbs</span>
                        <span className="text-xs font-mono font-bold text-cyan-400">{recipe.carbs}g</span>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800/80">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold block">Fett</span>
                        <span className="text-xs font-mono font-bold text-zinc-300">{recipe.fat}g</span>
                      </div>
                    </div>

                    {/* Ingredients list */}
                    <div className="space-y-1 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Zutaten:</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {recipe.ingredients.map((ing, idx) => (
                          <div key={idx} className="flex items-center justify-between text-zinc-300 bg-zinc-950/60 px-2.5 py-1.5 rounded-xl border border-zinc-800/60">
                            <span className="truncate">{ing.name}</span>
                            <span className="font-mono text-zinc-400 ml-2">{ing.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddRecipeIngredients(recipe)}
                      className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
                    >
                      <Plus size={14} />
                      <span>Zutaten zur Einkaufsliste hinzufügen</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
