"use client";

import { useState, useRef, useEffect } from "react";
import { X, Camera, Search, RefreshCw, Package, Plus, CalendarClock } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { useApp } from "@/context/AppContext";
import { fetchProductByBarcode, OpenFoodFactsProduct } from "@/lib/nutrition/openFoodFactsService";
import type { PantryUnit } from "@/types";

interface PantryAddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UNITS: PantryUnit[] = ["g", "kg", "ml", "l", "stk"];

export default function PantryAddItemModal({ isOpen, onClose }: PantryAddItemModalProps) {
  const { addPantryItem } = useApp();
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [calories, setCalories] = useState<number>(0);
  const [protein, setProtein] = useState<number>(0);
  const [carbs, setCarbs] = useState<number>(0);
  const [fat, setFat] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(500);
  const [unit, setUnit] = useState<PantryUnit>("g");
  const [expirationDate, setExpirationDate] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const isScanningRef = useRef(false);

  function applyProduct(p: OpenFoodFactsProduct) {
    setProduct(p);
    setName(p.name);
    setBrand(p.brand || "");
    setCalories(p.caloriesPer100g);
    setProtein(p.proteinPer100g);
    setCarbs(p.carbsPer100g);
    setFat(p.fatPer100g);
  }

  async function handleBarcodeFound(barcode: string) {
    setIsLoading(true);
    setErrorMsg(null);
    setProduct(null);

    const found = await fetchProductByBarcode(barcode);
    setIsLoading(false);

    if (found) {
      applyProduct(found);
    } else {
      // Unbekannter Barcode → manuell anlegen
      setName(`Produkt ${barcode}`);
      setErrorMsg(`Barcode "${barcode}" nicht in OpenFoodFacts gefunden – bitte Daten manuell ergänzen.`);
    }
  }

  async function startCamera() {
    stopCamera();
    setErrorMsg(null);
    try {
      const codeReader = new BrowserMultiFormatReader();
      readerRef.current = codeReader;
      isScanningRef.current = true;

      const devices = await codeReader.listVideoInputDevices();
      if (devices.length === 0) {
        setErrorMsg("Keine Kamera gefunden. Bitte Barcode manuell eingeben.");
        return;
      }
      const back = devices.find((d) =>
        /back|rück|rear|environment/i.test(d.label)
      );
      codeReader.decodeFromVideoDevice(
        back ? back.deviceId : devices[0].deviceId,
        videoRef.current,
        (result) => {
          if (result && isScanningRef.current) {
            const text = result.getText();
            if (text) {
              isScanningRef.current = false;
              stopCamera();
              handleBarcodeFound(text);
            }
          }
        }
      );
    } catch {
      setErrorMsg("Kamerazugriff wurde verweigert oder ist nicht verfügbar.");
    }
  }

  function stopCamera() {
    isScanningRef.current = false;
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
  }

  useEffect(() => {
    if (!isOpen || activeTab !== "camera" || product) {
      stopCamera();
      return;
    }
    queueMicrotask(() => startCamera());
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, product]);

  function resetForm() {
    setProduct(null);
    setManualCode("");
    setName("");
    setBrand("");
    setCalories(0); setProtein(0); setCarbs(0); setFat(0);
    setQuantity(500); setUnit("g"); setExpirationDate("");
    setErrorMsg(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOpen || !name.trim()) return;

    addPantryItem({
      barcode: product?.code,
      name: name.trim(),
      brand: brand.trim() || undefined,
      quantity: Math.max(0.1, quantity),
      unit,
      expirationDate: expirationDate || undefined,
      caloriesPer100g: calories,
      macros: { protein, carbs, fat },
      imageUrl: product?.imageUrl,
    });
    resetForm();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-amber-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">Vorrat ergänzen</h2>
              <p className="text-xs text-zinc-400">Barcode scannen oder manuell eintragen</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        {!product && (
          <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2 shrink-0 bg-zinc-950/60">
            {(["camera", "manual"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === tab ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "camera" ? <Camera size={14} /> : <Search size={14} />}
                <span>{tab === "camera" ? "Live Kamera" : "Barcode / Manuell"}</span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Scanner */}
          {!product && (
            <div className="space-y-4">
              {activeTab === "camera" ? (
                <div className="relative aspect-4/3 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-36 border-2 border-amber-400/60 rounded-2xl relative">
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-400 animate-pulse" />
                    </div>
                  </div>
                  {isLoading && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-amber-400 text-xs font-semibold">
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Rufe Produktdaten ab...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">EAN / Barcode-Nummer:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="z.B. 4008400404127"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isLoading || !manualCode.trim()}
                      onClick={() => handleBarcodeFound(manualCode)}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                      <span>Suchen</span>
                    </button>
                  </div>
                </div>
              )}
              {errorMsg && <p className="text-[11px] text-zinc-500">{errorMsg}</p>}
            </div>
          )}

          {/* Metadaten */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Name:</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Magerquark"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Menge:</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0.1, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono font-bold focus:border-amber-400 focus:outline-none"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as PantryUnit)}
                  className="px-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-semibold focus:border-amber-400 focus:outline-none"
                >
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">MHD (optional):</label>
              <div className="relative">
                <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full pl-8 pr-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:border-amber-400 focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="col-span-2 grid grid-cols-4 gap-2 pt-1">
              {[
                { label: "kcal/100", value: calories, set: setCalories },
                { label: "Protein", value: protein, set: setProtein },
                { label: "Carbs", value: carbs, set: setCarbs },
                { label: "Fett", value: fat, set: setFat },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">{label}</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={value}
                    onChange={(e) => set(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-2 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => { resetForm(); if (activeTab === "camera") startCamera(); }}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold"
            >
              Neu scannen
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus size={16} />
              <span>In den Vorrat legen</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
