"use client";

import { useState } from "react";
import {
  ScanBarcode,
  Camera,
  Sparkles,
  UploadCloud,
  Search,
  CheckCircle2,
  Plus,
  Zap,
  Loader2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { fetchProductByBarcode } from "@/lib/nutritionApi";
import { FoodItem } from "@/types";
import { getLocalDateString } from "@/lib/utils";

interface NutritionScannerTabProps {
  onOpenBarcodeScanner: () => void;
  onOpenPhotoLogger: () => void;
}

export default function NutritionScannerTab({
  onOpenBarcodeScanner,
  onOpenPhotoLogger,
}: NutritionScannerTabProps) {
  const { addMealEntry } = useApp();
  const todayStr = getLocalDateString();

  // EAN Quick Search state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [foundProduct, setFoundProduct] = useState<FoodItem | null>(null);
  const [portionGrams, setPortionGrams] = useState(100);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // Quick-Add verified presets
  const PRESET_SNACKS: (FoodItem & { defaultAmount: number })[] = [
    {
      id: "preset-hafer",
      name: "Haferflocken (Zartblatt)",
      brand: "Kölln",
      caloriesPer100g: 366,
      proteinPer100g: 13.5,
      carbsPer100g: 58.7,
      fatPer100g: 7.0,
      defaultAmount: 100,
    },
    {
      id: "preset-whey",
      name: "Whey Isolate Protein (Vanille)",
      brand: "ESN",
      caloriesPer100g: 380,
      proteinPer100g: 87.0,
      carbsPer100g: 3.0,
      fatPer100g: 1.5,
      defaultAmount: 30,
    },
    {
      id: "preset-quark",
      name: "Magerquark (Speisequark)",
      brand: "Milbona",
      caloriesPer100g: 67,
      proteinPer100g: 12.0,
      carbsPer100g: 4.0,
      fatPer100g: 0.2,
      defaultAmount: 250,
    },
    {
      id: "preset-banane",
      name: "Banane (Frisch)",
      brand: "Bio",
      caloriesPer100g: 89,
      proteinPer100g: 1.1,
      carbsPer100g: 22.8,
      fatPer100g: 0.3,
      defaultAmount: 120,
    },
  ];

  async function handleEanLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    setBarcodeLoading(true);
    setBarcodeError(null);
    setFoundProduct(null);

    try {
      const item = await fetchProductByBarcode(barcodeInput.trim());
      if (item) {
        setFoundProduct(item);
      } else {
        setBarcodeError("Produkt in OpenFoodFacts nicht gefunden. Prüfe den Barcode.");
      }
    } catch {
      setBarcodeError("Verbindungsfehler zur OpenFoodFacts Datenbank.");
    } finally {
      setBarcodeLoading(false);
    }
  }

  function handleLogFoundProduct() {
    if (!foundProduct) return;
    addMealEntry(todayStr, {
      mealType: "snack",
      food: foundProduct,
      amount: portionGrams,
    });
    setAddedSuccess(true);
    setTimeout(() => {
      setAddedSuccess(false);
      setFoundProduct(null);
      setBarcodeInput("");
    }, 2000);
  }

  function handleLogPreset(preset: FoodItem & { defaultAmount: number }) {
    addMealEntry(todayStr, {
      mealType: "snack",
      food: preset,
      amount: preset.defaultAmount,
    });
  }

  return (
    <div className="p-3.5 sm:p-5 lg:p-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full space-y-6 sm:space-y-8 pb-28 md:pb-8">
      {/* ── 1. Top Section: Fast Scanning & Vision Hub ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Live Barcode Scanner & EAN-13 Quick-Lookup */}
        <div className="p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 flex items-center justify-center shrink-0">
                <ScanBarcode size={24} />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                3+ Mio. EANs
              </span>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-zinc-100">Live Barcode-Scanner & EAN</h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                Scanne Lebensmittel sekundenschnell per Kamera oder tippe den Barcode direkt ein.
              </p>
            </div>

            {/* Quick EAN Input */}
            <form onSubmit={handleEanLookup} className="space-y-2 pt-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="EAN-13 eingeben (z. B. 4008400404127)..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-neutral-500 focus:outline-hidden focus:border-cyan-500 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={barcodeLoading || !barcodeInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  {barcodeLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>Suchen</span>
                </button>
              </div>

              {barcodeError && (
                <p className="text-[11px] text-rose-400 font-medium">{barcodeError}</p>
              )}
            </form>

            {/* Found Product Result Card */}
            {foundProduct && (
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-cyan-500/40 space-y-3 animate-in fade-in">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-cyan-400 font-mono block">{foundProduct.brand || "OpenFoodFacts"}</span>
                    <h4 className="text-sm font-bold text-zinc-100 truncate">{foundProduct.name}</h4>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={portionGrams}
                      onChange={(e) => setPortionGrams(Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-right font-mono font-bold text-cyan-400"
                    />
                    <span className="text-xs text-zinc-400">g</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                  <div className="p-1.5 rounded-lg bg-zinc-900">
                    <span className="text-[9px] text-zinc-500 block font-sans">Kcal</span>
                    <span className="font-bold text-zinc-100">
                      {Math.round(((foundProduct.caloriesPer100g || 0) * portionGrams) / 100)}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-blue-500/10">
                    <span className="text-[9px] text-blue-400 block font-sans">P</span>
                    <span className="font-bold text-blue-300">
                      {Math.round(((foundProduct.proteinPer100g || 0) * portionGrams) / 10) / 10}g
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-amber-500/10">
                    <span className="text-[9px] text-amber-400 block font-sans">C</span>
                    <span className="font-bold text-amber-300">
                      {Math.round(((foundProduct.carbsPer100g || 0) * portionGrams) / 10) / 10}g
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-rose-500/10">
                    <span className="text-[9px] text-rose-400 block font-sans">F</span>
                    <span className="font-bold text-rose-300">
                      {Math.round(((foundProduct.fatPer100g || 0) * portionGrams) / 10) / 10}g
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleLogFoundProduct}
                  className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {addedSuccess ? (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Ins Tagebuch geloggt! ✅</span>
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>{portionGrams}g ins Tagebuch eintragen</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onOpenBarcodeScanner}
            className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <ScanBarcode size={16} />
            <span>Kamera Barcode-Scanner öffnen</span>
          </button>
        </div>

        {/* AI Photo Meal Vision (Gemini Vision) */}
        <div className="p-5 sm:p-7 rounded-3xl bg-zinc-900/90 border border-zinc-800/90 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 text-purple-400 flex items-center justify-center shrink-0">
                <Camera size={24} />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/25">
                Gemini 2.5 Flash
              </span>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-zinc-100">Foto-Mahlzeitenanalyse (KI Vision)</h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                Fotografiere dein Essen: Google Gemini erkennt Zutaten, schätzt Grammaturen und berechnet Nährwerte automatisch.
              </p>
            </div>

            {/* Drag & Drop Photo Upload Zone */}
            <div
              onClick={onOpenPhotoLogger}
              className="border-2 border-dashed border-zinc-800 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer group space-y-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 group-hover:bg-purple-500/20 text-zinc-400 group-hover:text-purple-400 flex items-center justify-center transition-all">
                <UploadCloud size={24} />
              </div>
              <span className="text-xs font-bold text-zinc-200 block">
                Mahlzeiten-Foto hier ablegen
              </span>
              <span className="text-[10px] text-zinc-400 block">
                oder klicken für Kamera / Galerie
              </span>
            </div>
          </div>

          <button
            onClick={onOpenPhotoLogger}
            className="w-full py-3.5 rounded-2xl bg-purple-500 hover:bg-purple-400 text-zinc-950 font-black text-xs shadow-md shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Sparkles size={16} />
            <span>KI Foto-Analyse starten</span>
          </button>
        </div>
      </div>

      {/* ── 2. Quick-Add Verified Presets ──────────────────────────────────── */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Zap size={16} className="text-amber-400" />
            <span>Beliebte Hybrid-Snacks (1-Klick Quick Add)</span>
          </h3>
          <span className="text-[11px] text-neutral-400">Verifizierte Nährwerte</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_SNACKS.map((snack, idx) => {
            const kcal = Math.round(((snack.caloriesPer100g ?? 0) * snack.defaultAmount) / 100);
            const p = Math.round(((snack.proteinPer100g ?? 0) * snack.defaultAmount) / 10) / 10;
            const c = Math.round(((snack.carbsPer100g ?? 0) * snack.defaultAmount) / 10) / 10;

            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 flex flex-col justify-between space-y-3 hover:border-zinc-700 transition-all"
              >
                <div>
                  <span className="text-[10px] text-neutral-400 font-mono block">{snack.brand}</span>
                  <h4 className="text-xs font-bold text-zinc-200 truncate">{snack.name}</h4>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-1">
                    <span className="font-bold text-zinc-100">{kcal} kcal</span>
                    <span>•</span>
                    <span className="text-blue-400">{p}g P</span>
                    <span>•</span>
                    <span className="text-amber-400">{c}g C</span>
                  </div>
                </div>

                <button
                  onClick={() => handleLogPreset(snack)}
                  className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>{snack.defaultAmount}g eintragen</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
