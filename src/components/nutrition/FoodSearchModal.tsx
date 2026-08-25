"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import {
  Search,
  X,
  Plus,
  Flame,
  Dumbbell,
  ScanBarcode,
  Sparkles,
  Loader2,
  Check,
  ChevronRight,
  Utensils,
  Camera,
  Trash2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  searchOpenFoodFacts,
  fetchProductByBarcode,
  calculateNutrients,
  COMMON_FITNESS_FOODS,
} from "@/lib/nutritionApi";
import type { FoodItem, MealType } from "@/types";
import { cn } from "@/lib/utils";

interface FoodSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  mealType: MealType;
  date: string;
  initialTab?: "search" | "basics" | "barcode" | "quick";
}

const MEAL_NAMES: Record<MealType, string> = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  snack: "Snacks",
};

export default function FoodSearchModal({
  isOpen,
  onClose,
  mealType,
  date,
  initialTab = "search",
}: FoodSearchModalProps) {
  const { addMealEntry, quickAddCalories, customFoods, saveCustomFood, deleteCustomFood } =
    useApp();

  const [tab, setTab] = useState<"search" | "basics" | "barcode" | "quick">(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [amountGrams, setAmountGrams] = useState<number>(100);

  // Barcode state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Quick Add state
  const [quickName, setQuickName] = useState("");
  const [quickKcal, setQuickKcal] = useState("");
  const [quickProtein, setQuickProtein] = useState("");
  const [quickCarbs, setQuickCarbs] = useState("");
  const [quickFat, setQuickFat] = useState("");
  const [saveAsCustom, setSaveAsCustom] = useState(false);

  // Camera Barcode Scanning
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setSearchTerm("");
      setSearchResults([]);
      setSelectedFood(null);
      setAmountGrams(100);
      setBarcodeError(null);
      setBarcodeInput("");
    } else {
      stopCamera();
    }
  }, [isOpen, initialTab]);

  // Debounced search
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchOpenFoodFacts(searchTerm);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 380);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Stop camera helper
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Start barcode camera scanner
  const startCamera = async () => {
    setBarcodeError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setBarcodeError("Kamerazugriff wird von diesem Browser nicht unterstützt.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);

      // Check if native BarcodeDetector is available
      const win = window as any;
      if (typeof win !== "undefined" && win.BarcodeDetector) {
        const detector = new win.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128"],
        });

        const interval = setInterval(async () => {
          if (!videoRef.current || !streamRef.current) {
            clearInterval(interval);
            return;
          }
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              clearInterval(interval);
              stopCamera();
              handleBarcodeLookup(code);
            }
          } catch {
            // ignore frame read errors
          }
        }, 400);
      }
    } catch {
      setBarcodeError("Kamera konnte nicht geöffnet werden. Bitte Barcode manuell eingeben.");
      setIsCameraActive(false);
    }
  };

  const handleBarcodeLookup = async (codeToSearch?: string) => {
    const code = codeToSearch || barcodeInput;
    if (!code.trim()) return;

    setBarcodeLoading(true);
    setBarcodeError(null);
    try {
      const product = await fetchProductByBarcode(code.trim());
      if (product) {
        setSelectedFood(product);
        setAmountGrams(product.servingSize || 100);
      } else {
        setBarcodeError(`Kein Produkt mit Barcode "${code}" auf Open Food Facts gefunden.`);
      }
    } catch {
      setBarcodeError("Fehler bei der Barcode-Abfrage.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleSelectFood = (food: FoodItem) => {
    setSelectedFood(food);
    setAmountGrams(food.servingSize || 100);
  };

  const handleConfirmAdd = () => {
    if (!selectedFood) return;
    addMealEntry(date, {
      mealType,
      food: selectedFood,
      amount: amountGrams,
    });
    onClose();
  };

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = Number(quickKcal);
    const prot = Number(quickProtein) || 0;
    const carbs = Number(quickCarbs) || 0;
    const fat = Number(quickFat) || 0;

    if (!kcal || kcal <= 0) return;

    const name = quickName.trim() || "Schnelleintrag";

    quickAddCalories(date, mealType, name, kcal, prot, carbs, fat);

    if (saveAsCustom) {
      saveCustomFood({
        id: `custom-${Date.now()}`,
        name,
        caloriesPer100g: kcal,
        proteinPer100g: prot,
        carbsPer100g: carbs,
        fatPer100g: fat,
        isCustom: true,
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  const nutrients = selectedFood
    ? calculateNutrients(selectedFood, amountGrams)
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh] shadow-2xl overflow-hidden pb-safe sm:pb-0"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/80">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Utensils size={17} className="text-emerald-400" />
              {MEAL_NAMES[mealType]} hinzufügen
            </h2>
            <p className="text-xs text-zinc-400">OpenNutriTracker • Open Food Facts</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Selected Food Detail Screen */}
        {selectedFood ? (
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            {/* Header info of selected product */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700/50">
              {selectedFood.imageUrl ? (
                <img
                  src={selectedFood.imageUrl}
                  alt={selectedFood.name}
                  className="w-16 h-16 object-contain rounded-lg bg-zinc-900 p-1 border border-zinc-700 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                  <Utensils size={24} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-zinc-100 text-sm leading-tight line-clamp-2">
                  {selectedFood.name}
                </h3>
                {selectedFood.brand && (
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedFood.brand}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  <span>Pro 100g:</span>
                  <span className="font-semibold text-emerald-400">
                    {selectedFood.caloriesPer100g} kcal
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-blue-400">
                    {selectedFood.proteinPer100g}g P
                  </span>
                </div>
              </div>
            </div>

            {/* Quantity / Grams Selector */}
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Menge (Gramm / Milliliter)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={amountGrams || ""}
                  onChange={(e) => setAmountGrams(Math.max(1, Number(e.target.value)))}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-lg font-bold text-center focus:outline-hidden focus:border-emerald-500"
                  autoFocus
                />
                <span className="text-sm font-medium text-zinc-400">g / ml</span>
              </div>

              {/* Quick portion chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[30, 50, 100, 150, 200, 250, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountGrams(val)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                      amountGrams === val
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                    )}
                  >
                    {val}g
                  </button>
                ))}
              </div>
            </div>

            {/* Live Calculated Nutrients Card */}
            <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
              <div className="p-2 rounded-lg bg-zinc-900/60">
                <span className="text-[10px] text-zinc-400 block">Kalorien</span>
                <span className="text-base font-bold text-emerald-400">
                  {nutrients.calories}
                </span>
                <span className="text-[10px] text-zinc-500 block">kcal</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900/60">
                <span className="text-[10px] text-zinc-400 block">Protein</span>
                <span className="text-base font-bold text-blue-400">
                  {nutrients.protein}
                </span>
                <span className="text-[10px] text-zinc-500 block">g</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900/60">
                <span className="text-[10px] text-zinc-400 block">Carbs</span>
                <span className="text-base font-bold text-amber-400">
                  {nutrients.carbs}
                </span>
                <span className="text-[10px] text-zinc-500 block">g</span>
              </div>
              <div className="p-2 rounded-lg bg-zinc-900/60">
                <span className="text-[10px] text-zinc-400 block">Fett</span>
                <span className="text-base font-bold text-rose-400">
                  {nutrients.fat}
                </span>
                <span className="text-[10px] text-zinc-500 block">g</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedFood(null)}
                className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                className="flex-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Eintrag speichern
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-3">
              <button
                onClick={() => setTab("search")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
                  tab === "search"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Search size={14} />
                Suche
              </button>
              <button
                onClick={() => setTab("basics")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
                  tab === "basics"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Sparkles size={14} />
                Basics
              </button>
              <button
                onClick={() => setTab("barcode")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
                  tab === "barcode"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <ScanBarcode size={14} />
                Barcode
              </button>
              <button
                onClick={() => setTab("quick")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
                  tab === "quick"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                )}
              >
                <Plus size={14} />
                Schnelleintrag
              </button>
            </div>

            {/* Tab 1: Live Open Food Facts Search */}
            {tab === "search" && (
              <div className="flex-1 overflow-y-auto flex flex-col p-4 space-y-3">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Produkt oder Marke suchen (z.B. Skyr, Kölln, Whey...)"
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-hidden focus:border-emerald-500"
                    autoFocus
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {isSearching && (
                  <div className="py-8 flex flex-col items-center justify-center text-zinc-400 text-xs gap-2">
                    <Loader2 size={24} className="animate-spin text-emerald-400" />
                    <span>Suche in Open Food Facts Datenbank...</span>
                  </div>
                )}

                {!isSearching && searchTerm.length >= 2 && searchResults.length === 0 && (
                  <div className="py-8 text-center text-zinc-400 text-xs">
                    Keine Produkte gefunden. Versuche einen anderen Suchbegriff oder nutze den
                    Schnelleintrag.
                  </div>
                )}

                {!isSearching && searchResults.length > 0 && (
                  <div className="space-y-1.5">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectFood(item)}
                        className="w-full text-left p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-10 h-10 object-contain rounded-md bg-zinc-900 p-0.5 border border-zinc-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-500 shrink-0">
                              <Utensils size={16} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
                              {item.name}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {item.brand ? `${item.brand} • ` : ""}
                              <span className="text-emerald-400/90 font-medium">
                                {item.caloriesPer100g} kcal
                              </span>
                              {" • "}
                              <span className="text-blue-400 font-medium">
                                {item.proteinPer100g}g P
                              </span>
                              {" • "}
                              <span className="text-zinc-500">je 100g</span>
                            </p>
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          className="text-zinc-500 group-hover:text-zinc-300 shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {searchTerm.length < 2 && (
                  <div className="py-6 text-center text-zinc-500 text-xs space-y-1">
                    <p>Tippe z.B. &quot;Haferflocken&quot;, &quot;Magerquark&quot;, &quot;Skyr&quot; oder &quot;Lachs&quot;</p>
                    <p className="text-[11px] text-zinc-600">
                      Direkt angebunden an die freie Open Food Facts Datenbank
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Basics & Custom Favorites */}
            {tab === "basics" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {customFoods.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
                      Eigene Lebensmittel ({customFoods.length})
                    </h4>
                    {customFoods.map((item) => (
                      <div
                        key={item.id}
                        className="w-full text-left p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 flex items-center justify-between gap-3 group"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectFood(item)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm font-medium text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </p>
                          <p className="text-xs text-zinc-400">
                            <span className="text-emerald-400 font-medium">
                              {item.caloriesPer100g} kcal
                            </span>
                            {" • "}
                            <span className="text-blue-400 font-medium">
                              {item.proteinPer100g}g Protein
                            </span>
                            {" (je 100g)"}
                          </p>
                        </button>
                        <button
                          onClick={() => deleteCustomFood(item.id)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
                    Häufige Fitness-Basics (Offline verfügbar)
                  </h4>
                  {COMMON_FITNESS_FOODS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectFood(item)}
                      className="w-full text-left p-3 rounded-xl bg-zinc-800/30 hover:bg-zinc-800 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
                          {item.name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {item.brand ? `${item.brand} • ` : ""}
                          <span className="text-emerald-400 font-medium">
                            {item.caloriesPer100g} kcal
                          </span>
                          {" • "}
                          <span className="text-blue-400 font-medium">
                            {item.proteinPer100g}g P
                          </span>
                          {" • "}
                          <span className="text-zinc-500">je 100g</span>
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-zinc-500 group-hover:text-zinc-300 shrink-0"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Barcode Scanner / EAN */}
            {tab === "barcode" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Camera Scanner View */}
                {isCameraActive ? (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-zinc-700 flex items-center justify-center">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-8 inset-y-12 border-2 border-emerald-400/80 rounded-xl pointer-events-none animate-pulse" />
                    </div>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                    >
                      Kamera schließen
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 bg-zinc-950/60 hover:bg-zinc-900/60 flex flex-col items-center justify-center gap-2 text-zinc-300 transition-all group"
                  >
                    <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                      <Camera size={24} />
                    </div>
                    <span className="font-semibold text-sm">Kamera-Scanner starten</span>
                    <span className="text-xs text-zinc-500">
                      Halte den Barcode vor die Kamera
                    </span>
                  </button>
                )}

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-zinc-800"></div>
                  <span className="shrink-0 mx-4 text-xs text-zinc-500 uppercase">
                    Oder Barcode-Nummer
                  </span>
                  <div className="flex-grow border-t border-zinc-800"></div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-400">
                    EAN / Barcode eingeben
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="z.B. 4008400404128"
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleBarcodeLookup()}
                      disabled={barcodeLoading || !barcodeInput.trim()}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-sm transition-colors flex items-center gap-1.5"
                    >
                      {barcodeLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Search size={16} />
                      )}
                      Suchen
                    </button>
                  </div>
                </div>

                {barcodeError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
                    {barcodeError}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Quick Add */}
            {tab === "quick" && (
              <form
                onSubmit={handleQuickAddSubmit}
                className="flex-1 overflow-y-auto p-4 space-y-3.5"
              >
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Bezeichnung (optional)
                  </label>
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="z.B. Kantine Mittagessen, Proteinriegel..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1">
                      <Flame size={14} className="text-emerald-400" />
                      Kalorien (kcal) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={quickKcal}
                      onChange={(e) => setQuickKcal(e.target.value)}
                      placeholder="z.B. 450"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm font-bold focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center gap-1">
                      <Dumbbell size={14} className="text-blue-400" />
                      Protein (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={quickProtein}
                      onChange={(e) => setQuickProtein(e.target.value)}
                      placeholder="z.B. 35"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm font-bold focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      Kohlenhydrate (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={quickCarbs}
                      onChange={(e) => setQuickCarbs(e.target.value)}
                      placeholder="z.B. 50"
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      Fett (g)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={quickFat}
                      onChange={(e) => setQuickFat(e.target.value)}
                      placeholder="z.B. 12"
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAsCustom}
                    onChange={(e) => setSaveAsCustom(e.target.checked)}
                    className="w-4 h-4 rounded-md accent-emerald-500 bg-zinc-900 border-zinc-700"
                  />
                  <span className="text-xs text-zinc-400">
                    Als eigenes Lebensmittel für später merken
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={!quickKcal}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Plus size={18} />
                  Zu {MEAL_NAMES[mealType]} hinzufügen
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
