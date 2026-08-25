"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  ScanBarcode,
  Camera,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Flame,
  Utensils,
  Package,
  Check,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { useApp } from "@/context/AppContext";
import { fetchProductByBarcode, OpenFoodFactsProduct } from "@/lib/nutrition/openFoodFactsService";
import type { MealType, FoodItem } from "@/types";

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
}

export default function BarcodeScannerModal({
  isOpen,
  onClose,
  targetDate,
}: BarcodeScannerModalProps) {
  const { addMealEntry, saveCustomFood } = useApp();

  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Scanned / Found Product
  const [foundProduct, setFoundProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [amountGrams, setAmountGrams] = useState<number>(100);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [isLogged, setIsLogged] = useState(false);

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const isScanningRef = useRef(false);

  async function handleBarcodeFound(barcode: string) {
    setIsLoading(true);
    setErrorMsg(null);
    setFoundProduct(null);

    const product = await fetchProductByBarcode(barcode);
    setIsLoading(false);

    if (product) {
      setFoundProduct(product);
      setAmountGrams(100);
    } else {
      setErrorMsg(`Barcode "${barcode}" nicht in OpenFoodFacts gefunden.`);
    }
  }

  async function startCamera() {
    stopCamera();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const codeReader = new BrowserMultiFormatReader();
      readerRef.current = codeReader;
      isScanningRef.current = true;

      const videoInputDevices = await codeReader.listVideoInputDevices();
      if (videoInputDevices.length === 0) {
        setErrorMsg("Keine Kamera gefunden. Bitte Barcode manuell eingeben.");
        setIsLoading(false);
        return;
      }

      // Prefer back/environment camera on mobile
      const backCamera = videoInputDevices.find(
        (d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rück") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
      );
      const selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;

      setIsLoading(false);

      codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        async (result, err) => {
          if (result && isScanningRef.current) {
            const text = result.getText();
            if (text) {
              isScanningRef.current = false;
              stopCamera();
              await handleBarcodeFound(text);
            }
          }
        }
      );
    } catch (err: any) {
      console.warn("Kamera-Fehler:", err);
      setIsLoading(false);
      setErrorMsg("Kamerazugriff wurde verweigert oder ist nicht verfügbar.");
    }
  }

  function stopCamera() {
    isScanningRef.current = false;
    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch {}
      readerRef.current = null;
    }
  }

  useEffect(() => {
    if (!isOpen || activeTab !== "camera") {
      stopCamera();
      return;
    }

    // startCamera setzt synchron State – via Microtask entkoppelt
    queueMicrotask(() => {
      startCamera();
    });

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeFound(manualCode);
  }

  function handleConfirmLog() {
    if (!foundProduct) return;

    const food: FoodItem = {
      id: `off_${foundProduct.code}`,
      name: foundProduct.name,
      brand: foundProduct.brand,
      caloriesPer100g: foundProduct.caloriesPer100g,
      proteinPer100g: foundProduct.proteinPer100g,
      carbsPer100g: foundProduct.carbsPer100g,
      fatPer100g: foundProduct.fatPer100g,
    };

    // Save into local custom foods so it appears in normal searches
    saveCustomFood(food);

    // Add into daily meal entries
    addMealEntry(targetDate, {
      mealType,
      food,
      amount: amountGrams,
    });

    setIsLogged(true);
    setTimeout(() => {
      setIsLogged(false);
      onClose();
    }, 1000);
  }

  if (!isOpen) return null;

  // Calculate live nutrients for portion
  const factor = amountGrams / 100;
  const calcCalories = foundProduct ? Math.round(foundProduct.caloriesPer100g * factor) : 0;
  const calcProtein = foundProduct ? Math.round(foundProduct.proteinPer100g * factor * 10) / 10 : 0;
  const calcCarbs = foundProduct ? Math.round(foundProduct.carbsPer100g * factor * 10) / 10 : 0;
  const calcFat = foundProduct ? Math.round(foundProduct.fatPer100g * factor * 10) / 10 : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-cyan-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <ScanBarcode size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Barcode-Scanner</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  OpenFoodFacts
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Lebensmittel-Etikett scannen & in 1 Klick loggen
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        {!foundProduct && (
          <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
            <button
              type="button"
              onClick={() => setActiveTab("camera")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "camera"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Camera size={14} />
              <span>Live Kamera</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("manual")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
                activeTab === "manual"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Search size={14} />
              <span>Barcode-Nummer</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ── Mode 1: Scanner View ────────────────────────────────────────── */}
          {!foundProduct && (
            <div className="space-y-4">
              {activeTab === "camera" ? (
                <div className="relative aspect-4/3 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />

                  {/* Animated Laser Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-36 border-2 border-cyan-400/60 rounded-2xl relative shadow-2xl shadow-cyan-500/20">
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-md shadow-cyan-400 animate-pulse" />
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-300" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-300" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-300" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-300" />
                    </div>
                  </div>

                  {isLoading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-cyan-400 text-xs font-semibold">
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Rufe Produktdaten ab...</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Manual Input */
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      EAN / Barcode-Nummer:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="z.B. 4008400404127 (Magerquark)"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !manualCode.trim()}
                        className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all flex items-center gap-1.5"
                      >
                        {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                        <span>Suchen</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Mode 2: Product Found & Portion Calculator ──────────────────── */}
          {foundProduct && (
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
              {/* Product Header Card */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center gap-3.5">
                {foundProduct.imageUrl ? (
                  <img
                    src={foundProduct.imageUrl}
                    alt={foundProduct.name}
                    className="w-16 h-16 rounded-xl object-contain bg-zinc-900 border border-zinc-800 p-1 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center shrink-0">
                    <Package size={24} />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block truncate">
                    {foundProduct.brand || "OpenFoodFacts"}
                  </span>
                  <h3 className="text-sm font-bold text-zinc-100 truncate">{foundProduct.name}</h3>
                  <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
                    Pro 100g: {foundProduct.caloriesPer100g} kcal • {foundProduct.proteinPer100g}g P • {foundProduct.carbsPer100g}g C • {foundProduct.fatPer100g}g F
                  </span>
                </div>
              </div>

              {/* Portion Input & Meal Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Menge in Gramm (g):
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={amountGrams}
                    onChange={(e) => setAmountGrams(Math.max(1, parseInt(e.target.value, 10) || 0))}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono font-bold focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Mahlzeit:
                  </label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as MealType)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-semibold focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="breakfast">Frühstück</option>
                    <option value="lunch">Mittagessen</option>
                    <option value="dinner">Abendessen</option>
                    <option value="snack">Snack</option>
                  </select>
                </div>
              </div>

              {/* Calculated Portion Nutrients Banner */}
              <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-center space-y-2">
                <span className="text-[10px] uppercase font-bold text-cyan-400 block">
                  Berechnete Nährwerte für {amountGrams}g Portion:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Kalorien</span>
                    <span className="text-sm font-bold font-mono text-zinc-100">{calcCalories} kcal</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Protein</span>
                    <span className="text-sm font-bold font-mono text-cyan-400">{calcProtein}g</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Carbs</span>
                    <span className="text-sm font-bold font-mono text-amber-400">{calcCarbs}g</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Fett</span>
                    <span className="text-sm font-bold font-mono text-purple-400">{calcFat}g</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFoundProduct(null);
                    if (activeTab === "camera") startCamera();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold"
                >
                  Neu scannen
                </button>

                <button
                  type="button"
                  onClick={handleConfirmLog}
                  disabled={isLogged}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  {isLogged ? (
                    <>
                      <Check size={16} />
                      <span>Eingetragen!</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>In Ernährungstagebuch loggen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
