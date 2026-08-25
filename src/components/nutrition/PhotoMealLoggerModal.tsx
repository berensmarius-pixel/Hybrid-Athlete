"use client";

import { useState, useRef } from "react";
import {
  X,
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Flame,
  Utensils,
  Check,
  Sliders,
  Trash2,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateId } from "@/lib/utils";
import type { MealType, FoodItem } from "@/types";
import { checkGeminiConfigured, geminiGenerate, extractJson } from "@/lib/gemini/client";

interface PhotoMealLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
}

interface DetectedFoodItem {
  id: string;
  name: string;
  amountGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export default function PhotoMealLoggerModal({
  isOpen,
  onClose,
  targetDate,
}: PhotoMealLoggerModalProps) {
  const { addMultipleMealEntries } = useApp();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dishTitle, setDishTitle] = useState<string>("");
  const [detectedItems, setDetectedItems] = useState<DetectedFoodItem[]>([]);
  const [isLogged, setIsLogged] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  }

  function processImageFile(file: File) {
    setErrorMsg(null);
    setDetectedItems([]);
    setDishTitle("");
    const type = file.type || "image/jpeg";
    setMimeType(type);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImagePreview(dataUrl);
      const base64Data = dataUrl.split(",")[1];
      setImageBase64(base64Data);
      analyzePhotoWithGemini(base64Data, type);
    };
    reader.readAsDataURL(file);
  }

  async function analyzePhotoWithGemini(base64Data: string, type: string) {
    setIsAnalyzing(true);
    setErrorMsg(null);

    if (!(await checkGeminiConfigured())) {
      setErrorMsg("Kein Gemini API-Schlüssel auf dem Server konfiguriert (Env GEMINI_API_KEY).");
      setIsAnalyzing(false);
      return;
    }

    try {
      const prompt = `Analysiere dieses Foto einer Mahlzeit für einen Hybrid-Athleten.
Erkenne jedes einzelne Lebensmittel auf dem Teller/in der Mahlzeit, schätze realistische Portionsgrößen in Gramm und die genauen Nährwerte pro 100g.

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in exakt folgendem Format (kein Markdown, keine Backticks, reiner JSON-String):
{
  "dishTitle": "z.B. Gegrillte Hähnchenbrust mit Basmatireis und Brokkoli",
  "items": [
    {
      "name": "Name der Zutat (z.B. Hähnchenbrustfilet gebraten)",
      "amountGrams": 220,
      "caloriesPer100g": 165,
      "proteinPer100g": 31.0,
      "carbsPer100g": 0.0,
      "fatPer100g": 3.6
    }
  ]
}`;

      // readAsDataURL liefert "data:<mime>;base64,<payload>" – die offizielle
      // API benötigt nur den reinen Base64-Anteil.
      const base64Payload = base64Data.includes(",")
        ? base64Data.slice(base64Data.indexOf(",") + 1)
        : base64Data;

      const rawText = await geminiGenerate(
        [
          { inlineData: { mimeType: type, data: base64Payload } },
          { text: prompt },
        ],
        { model: "gemini-2.5-flash" }
      );

      const parsed = extractJson(String(rawText)) as {
        dishTitle?: string;
        items?: Array<Record<string, unknown>>;
      };

      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        setDishTitle(parsed.dishTitle || "Erkannte Mahlzeit");
        setDetectedItems(
          parsed.items.map((it: any) => ({
            id: generateId(),
            name: it.name || "Lebensmittel",
            amountGrams: parseInt(it.amountGrams, 10) || 100,
            caloriesPer100g: Math.round(it.caloriesPer100g || 100),
            proteinPer100g: Math.round((it.proteinPer100g || 0) * 10) / 10,
            carbsPer100g: Math.round((it.carbsPer100g || 0) * 10) / 10,
            fatPer100g: Math.round((it.fatPer100g || 0) * 10) / 10,
          }))
        );
      } else {
        throw new Error("Konnte keine einzelnen Lebensmittel auf dem Foto erkennen.");
      }
    } catch (err: any) {
      console.warn("Foto-Analyse-Fehler:", err);
      setErrorMsg(err.message || "Fehler bei der KI-Bilderkennung.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleUpdateGrams(id: string, newGrams: number) {
    setDetectedItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, amountGrams: Math.max(1, newGrams) } : it))
    );
  }

  function handleDeleteItem(id: string) {
    setDetectedItems((prev) => prev.filter((it) => it.id !== id));
  }

  function handleConfirmLog() {
    if (detectedItems.length === 0) return;

    const entriesToLog = detectedItems.map((it) => ({
      mealType,
      food: {
        id: `food_vision_${it.id}`,
        name: it.name,
        caloriesPer100g: it.caloriesPer100g,
        proteinPer100g: it.proteinPer100g,
        carbsPer100g: it.carbsPer100g,
        fatPer100g: it.fatPer100g,
      },
      amount: it.amountGrams,
    }));

    addMultipleMealEntries(targetDate, entriesToLog);
    setIsLogged(true);
    setTimeout(() => {
      setIsLogged(false);
      onClose();
    }, 1200);
  }

  // Live total sums
  const totalCalories = detectedItems.reduce(
    (s, it) => s + Math.round((it.caloriesPer100g * it.amountGrams) / 100),
    0
  );
  const totalProtein = Math.round(
    detectedItems.reduce((s, it) => s + (it.proteinPer100g * it.amountGrams) / 100, 0) * 10
  ) / 10;
  const totalCarbs = Math.round(
    detectedItems.reduce((s, it) => s + (it.carbsPer100g * it.amountGrams) / 100, 0) * 10
  ) / 10;
  const totalFat = Math.round(
    detectedItems.reduce((s, it) => s + (it.fatPer100g * it.amountGrams) / 100, 0) * 10
  ) / 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-purple-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>KI-Foto-Tracker</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Gemini Vision
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Teller fotografieren ➔ Zutaten & Makros automatisch schätzen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Upload Dropzone */}
          {!imagePreview && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-8 rounded-3xl border-2 border-dashed border-zinc-800 hover:border-purple-500/50 bg-zinc-950/60 text-center space-y-3 transition-colors cursor-pointer"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/10">
                <Camera size={26} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-100">
                  Foto vom Essen aufnehmen oder hochladen
                </h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Gemini Vision erkennt die Mahlzeit, schätzt Portionen und berechnet Kalorien & Makros.
                </p>
              </div>
            </div>
          )}

          {/* Image Preview & Loading Indicator */}
          {imagePreview && (
            <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 max-h-48 flex items-center justify-center">
              <img
                src={imagePreview}
                alt="Meal preview"
                className="w-full h-48 object-cover opacity-80"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-purple-300">
                  <RefreshCw size={24} className="animate-spin text-purple-400" />
                  <span className="text-xs font-bold">Gemini analysiert Mahlzeit & Makros...</span>
                </div>
              )}
              {!isAnalyzing && (
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setDetectedItems([]);
                    setDishTitle("");
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-zinc-300 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Detected Ingredients List */}
          {detectedItems.length > 0 && (
            <div className="space-y-3 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">{dishTitle}</h3>
                  <span className="text-[11px] text-zinc-400">
                    {detectedItems.length} Zutaten erkannt • Gramm bei Bedarf anpassen
                  </span>
                </div>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                  className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-semibold focus:border-purple-400 focus:outline-none"
                >
                  <option value="breakfast">Frühstück</option>
                  <option value="lunch">Mittagessen</option>
                  <option value="dinner">Abendessen</option>
                  <option value="snack">Snack</option>
                </select>
              </div>

              {/* Items List */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {detectedItems.map((it) => {
                  const factor = it.amountGrams / 100;
                  const itemKcal = Math.round(it.caloriesPer100g * factor);
                  const itemProt = Math.round(it.proteinPer100g * factor * 10) / 10;
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-zinc-100 truncate">{it.name}</h4>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {itemKcal} kcal • {itemProt}g P • {(it.carbsPer100g * factor).toFixed(1)}g C • {(it.fatPer100g * factor).toFixed(1)}g F
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="5"
                            step="5"
                            value={it.amountGrams}
                            onChange={(e) =>
                              handleUpdateGrams(it.id, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono font-bold text-center text-zinc-100 focus:border-purple-400 focus:outline-none"
                          />
                          <span className="text-xs text-zinc-500 font-bold">g</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(it.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Calculated Macro Summary Banner */}
              <div className="p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/30 text-center space-y-2">
                <span className="text-[10px] uppercase font-bold text-purple-400 block">
                  Gesamtbilanz der Mahlzeit:
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Kalorien</span>
                    <span className="text-sm font-bold font-mono text-zinc-100">{totalCalories} kcal</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Protein</span>
                    <span className="text-sm font-bold font-mono text-purple-400">{totalProtein}g</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Carbs</span>
                    <span className="text-sm font-bold font-mono text-amber-400">{totalCarbs}g</span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block">Fett</span>
                    <span className="text-sm font-bold font-mono text-cyan-400">{totalFat}g</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {detectedItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold"
            >
              Abbrechen
            </button>

            <button
              type="button"
              onClick={handleConfirmLog}
              disabled={isLogged}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all"
            >
              {isLogged ? (
                <>
                  <Check size={16} />
                  <span>Eingetragen!</span>
                </>
              ) : (
                <>
                  <Plus size={16} />
                  <span>Alle {detectedItems.length} Zutaten loggen ({totalCalories} kcal)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
