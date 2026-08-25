"use client";

import { useMemo, useState } from "react";
import {
  Package,
  Plus,
  Trash2,
  Sparkles,
  ChefHat,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  RefreshCw,
  Users,
  Minus,
} from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import type {
  PantryItem,
  PantryUrgency,
  RecipeGeneratorMode,
  RecipeSuggestion,
} from "@/types";
import {
  getDaysUntilExpiry,
  getExpiryUrgency,
  sortPantryByExpiry,
} from "@/lib/nutrition/pantryService";

const URGENCY_STYLE: Record<PantryUrgency, { badge: string; label: string; dot: string }> = {
  expired: { badge: "bg-red-500/15 text-red-400 border-red-500/30", label: "Abgelaufen", dot: "bg-red-500" },
  critical: { badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", label: "Kritisch", dot: "bg-orange-500" },
  warning: { badge: "bg-amber-500/15 text-amber-300 border-amber-500/30", label: "Bald fällig", dot: "bg-amber-500" },
  stable: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Stabil", dot: "bg-emerald-500" },
};

export default function PantryTab() {
  const {
    pantryItems,
    removePantryItem,
    updatePantryItem,
    consumePantryItems,
    nutritionGoals,
    addMultipleMealEntries,
  } = useApp();

  const [mode, setMode] = useState<RecipeGeneratorMode>("minimal");
  const [servings, setServings] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeSuggestion[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [cookedRecipeId, setCookedRecipeId] = useState<string | null>(null);

  const sortedItems = useMemo(() => sortPantryByExpiry(pantryItems), [pantryItems]);

  const urgencyCounts = useMemo(() => {
    const counts: Record<PantryUrgency, number> = { expired: 0, critical: 0, warning: 0, stable: 0 };
    pantryItems.forEach((i) => { counts[getExpiryUrgency(i)] += 1; });
    return counts;
  }, [pantryItems]);

  async function generateRecipes() {
    if (sortedItems.length === 0) return;
    setIsGenerating(true);
    setGenerateError(null);
    setRecipes([]);
    try {
      const res = await fetch("/api/pantry/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: sortedItems,
          mode,
          servings,
          goals: nutritionGoals,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data?.error?.message || "Rezeptgenerierung fehlgeschlagen.");
      } else {
        setRecipes(data.recipes as RecipeSuggestion[]);
      }
    } catch {
      setGenerateError("Netzwerkfehler bei der Rezeptgenerierung.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCooked(recipe: RecipeSuggestion) {
    // 1. Vorrats-Bestand reduzieren
    consumePantryItems(recipe.pantryItemsUsed);

    // 2. Rezept ins Ernährungstagebuch loggen (eine Entry pro Zutat)
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const perServingFactor = 1 / Math.max(1, recipe.servings);

    addMultipleMealEntries(
      dateStr,
      recipe.pantryItemsUsed.map((use) => {
        const item = pantryItems.find((i) => i.id === use.pantryItemId);
        const factor = (use.amountUsed * perServingFactor) / 100;
        return {
          mealType: "lunch" as const,
          food: {
            id: `recipe_${recipe.id}_${use.pantryItemId}`,
            name: `${recipe.title}: ${use.name}`,
            caloriesPer100g: item?.caloriesPer100g ?? 0,
            proteinPer100g: item?.macros.protein ?? 0,
            carbsPer100g: item?.macros.carbs ?? 0,
            fatPer100g: item?.macros.fat ?? 0,
          },
          amount: use.amountUsed * perServingFactor,
          calories: Math.round((item?.caloriesPer100g ?? 0) * factor),
          protein: Math.round((item?.macros.protein ?? 0) * factor * 10) / 10,
          carbs: Math.round((item?.macros.carbs ?? 0) * factor * 10) / 10,
          fat: Math.round((item?.macros.fat ?? 0) * factor * 10) / 10,
        };
      })
    );

    setCookedRecipeId(recipe.id);
    setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
    setTimeout(() => setCookedRecipeId(null), 2000);
  }

  function expiryLabel(item: PantryItem): string {
    if (!item.expirationDate) return "kein MHD";
    const days = getDaysUntilExpiry(item.expirationDate);
    if (days < -1) return `${Math.abs(days)} Tage überfällig`;
    if (days === -1 || days === 0) return days === 0 ? "heute!" : "seit gestern";
    if (days === 1) return "morgen";
    return `in ${days} Tagen`;
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Clear-Out Steuerung ─────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm sm:text-base font-black text-zinc-100 font-mono flex items-center gap-2">
              <ChefHat size={18} className="text-amber-400" />
              VORRATS-AUFBRAUCHER
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                KI
              </span>
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Rezepte streng nach Verfallsdatum priorisiert – weg mit Lebensmittelverschwendung.
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] border border-white/10 hover:border-amber-500/40 text-zinc-200 hover:text-amber-300 text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            <Plus size={14} />
            <span>Vorrat ergänzen</span>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex glass-panel p-1 rounded-2xl border border-white/10 flex-1">
            {([
              { id: "strict", label: "A · Nur Vorrat (Strict)", hint: "Keine Einkäufe nötig" },
              { id: "minimal", label: "B · Minimal Einkauf", hint: "Max. 3 fehlende Zutaten" },
            ] as const).map(({ id, label, hint }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`relative flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active ? "text-black" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="pantryModeIndicator"
                      className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400 rounded-xl shadow-md shadow-amber-500/25 -z-10"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="block">{label}</span>
                  <span className={`block text-[9px] font-semibold ${active ? "text-black/70" : "text-zinc-500"}`}>{hint}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <Users size={13} className="text-zinc-500" />
              <button
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Minus size={12} />
              </button>
              <span className="w-6 text-center text-xs font-mono font-bold text-zinc-100">{servings}</span>
              <button
                onClick={() => setServings((s) => Math.min(12, s + 1))}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Plus size={12} />
              </button>
            </div>

            <button
              onClick={generateRecipes}
              disabled={isGenerating || sortedItems.length === 0}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 disabled:opacity-50 text-zinc-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>{isGenerating ? "Generiere..." : "Rezepte generieren"}</span>
            </button>
          </div>
        </div>

        {generateError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {generateError}
          </div>
        )}
      </div>

      {/* ── Rezept-Vorschläge ──────────────────────────────────────────────── */}
      {recipes.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {recipes.map((recipe) => (
            <div key={recipe.id} className="p-4 sm:p-5 rounded-3xl glass-panel border border-amber-500/20 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-zinc-100">{recipe.title}</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{recipe.description}</p>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-1 p-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 min-w-[52px]">
                  <span className="text-base font-black font-mono text-amber-400 leading-none">{recipe.expiryScore}</span>
                  <span className="text-[8px] uppercase font-bold text-amber-400/70">Expiry</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-zinc-400">
                <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800">
                  <Clock size={11} /> {recipe.totalPrepTimeMin} Min
                </span>
                <span className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800">
                  {recipe.servings} Portionen
                </span>
                <span className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono">
                  {recipe.totalMacros.calories} kcal · {recipe.totalMacros.protein}g P / {recipe.totalMacros.carbs}g C /{" "}
                  {recipe.totalMacros.fat}g F <span className="opacity-60">(pro Portion)</span>
                </span>
              </div>

              {/* Verwendete Vorräte */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500">Verwertete Vorräte:</span>
                <div className="flex flex-wrap gap-1.5">
                  {recipe.pantryItemsUsed.map((u) => {
                    const urgency = u.daysUntilExpiry !== undefined
                      ? u.daysUntilExpiry < 0 ? "expired" : u.daysUntilExpiry < 3 ? "critical" : u.daysUntilExpiry < 7 ? "warning" : "stable"
                      : "stable";
                    return (
                      <span key={u.pantryItemId} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold ${URGENCY_STYLE[urgency].badge}`}>
                        {u.name} · −{u.amountUsed}{u.unit}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Fehlende Zutaten */}
              {recipe.missingIngredients.length > 0 && (
                <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                  <span className="text-[10px] uppercase font-bold text-blue-300 flex items-center gap-1 mb-1">
                    <ShoppingCart size={11} /> Noch einkaufen:
                  </span>
                  <ul className="text-[11px] text-zinc-300 list-disc list-inside">
                    {recipe.missingIngredients.map((m, i) => (
                      <li key={i}>{m.name}{m.amount ? ` (${m.amount})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Schritte */}
              <ol className="space-y-1.5">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="text-[11px] text-zinc-300 flex gap-2">
                    <span className="shrink-0 w-4 h-4 rounded-md bg-zinc-800 text-zinc-400 text-[9px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <button
                onClick={() => handleCooked(recipe)}
                disabled={cookedRecipeId === recipe.id}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-70 text-zinc-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
              >
                {cookedRecipeId === recipe.id ? (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Gekocht! Vorrat & Tagebuch aktualisiert</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Gekocht! Vorrat abbuchen & loggen</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Inventar ────────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-3xl glass-panel border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-black text-zinc-100 font-mono flex items-center gap-2">
            <Package size={16} className="text-zinc-400" />
            DIGITALER VORRAT ({sortedItems.length})
          </h2>
          <div className="flex gap-1.5 text-[10px] font-bold">
            {(Object.keys(URGENCY_STYLE) as PantryUrgency[])
              .filter((k) => urgencyCounts[k] > 0)
              .map((k) => (
                <span key={k} className={`px-2 py-1 rounded-lg border ${URGENCY_STYLE[k].badge}`}>
                  {URGENCY_STYLE[k].label}: {urgencyCounts[k]}
                </span>
              ))}
          </div>
        </div>

        {sortedItems.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Package size={32} className="mx-auto text-zinc-700" />
            <p className="text-xs text-zinc-500">Vorrat ist leer. Scanne Barcodes oder lege Artikel manuell an.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {sortedItems.map((item) => {
              const urgency = getExpiryUrgency(item);
              const style = URGENCY_STYLE[urgency];
              return (
                <div
                  key={item.id}
                  className="group p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-600 transition-all flex items-start gap-3"
                >
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-100 truncate">{item.name}</span>
                      <button
                        onClick={() => removePantryItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Aus dem Vorrat entfernen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${style.badge}`}>
                        {expiryLabel(item)}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {item.quantity}{item.unit}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600 truncate">
                        {item.caloriesPer100g} kcal/100
                      </span>
                    </div>
                    {urgency !== "expired" && (
                      <div className="flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-all">
                        {[0.25, 0.5, 1].map((frac) => (
                          <button
                            key={frac}
                            onClick={() =>
                              frac === 1
                                ? removePantryItem(item.id)
                                : updatePantryItem(item.id, { quantity: Math.max(0, Math.round(item.quantity * (1 - frac))) })
                            }
                            className="px-1.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[9px] font-bold text-zinc-400 hover:text-amber-300 hover:border-amber-500/40"
                            title={frac === 1 ? "Komplett verbraucht" : `${frac * 100}% verbrauchen`}
                          >
                            −{frac === 1 ? "alles" : `${frac * 100}%`}
                          </button>
                        ))}
                      </div>
                    )}
                    {urgency === "expired" && (
                      <div className="flex items-center gap-1 mt-1 text-[9px] font-bold text-red-400/80">
                        <AlertTriangle size={10} /> Sofort prüfen oder entsorgen!
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add-Modal */}
      {isAddOpen && <AddModalLazy isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />}
    </div>
  );
}

const AddModalLazy = dynamic(() => import("./PantryAddItemModal"), { ssr: false });
