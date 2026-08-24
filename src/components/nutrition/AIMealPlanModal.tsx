"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  Utensils,
  Flame,
  Dumbbell,
  Check,
  RefreshCw,
  Clock,
  ChevronRight,
  Info,
  Apple,
  Sun,
  Moon,
  Coffee,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { GEMINI_API_KEY_STORAGE } from "@/components/coach/CoachView";
import type { MealType, FoodItem, MealEntry } from "@/types";
import { generateId } from "@/lib/utils";

interface AIMealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
}

interface GeneratedIngredient {
  name: string;
  amountGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface GeneratedMeal {
  mealType: MealType;
  title: string;
  prepTimeMinutes: number;
  instructions: string;
  ingredients: GeneratedIngredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  isSelected?: boolean;
}

const MEAL_ICONS: Record<MealType, { icon: React.ElementType; color: string; label: string }> = {
  breakfast: { icon: Coffee, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Frühstück" },
  lunch: { icon: Sun, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "Mittagessen" },
  dinner: { icon: Moon, color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Abendessen" },
  snack: { icon: Apple, color: "text-violet-400 bg-violet-500/10 border-violet-500/20", label: "Pre/Post-Workout Snack" },
};

export default function AIMealPlanModal({ isOpen, onClose, selectedDate }: AIMealPlanModalProps) {
  const {
    nutritionLogs,
    nutritionGoals,
    garminHealthLogs,
    weeklyPlan,
    addMultipleMealEntries,
  } = useApp();

  const [dietFocus, setDietFocus] = useState<"smart" | "high_protein" | "high_carb" | "quick">("smart");
  const [dietPreference, setDietPreference] = useState<"standard" | "vegetarian" | "vegan">("standard");
  const [loading, setLoading] = useState(false);
  const [generatedMeals, setGeneratedMeals] = useState<GeneratedMeal[]>([]);
  const [selectedMealIndices, setSelectedMealIndices] = useState<Record<number, boolean>>({});
  const [successSaved, setSuccessSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate current logged calories and remaining budget for selected date
  const currentLog = nutritionLogs.find((l) => l.date === selectedDate);
  const loggedEntries = currentLog?.entries || [];
  const loggedCalories = loggedEntries.reduce((sum, e) => sum + (e.calories || 0), 0);
  const loggedProtein = loggedEntries.reduce((sum, e) => sum + (e.protein || 0), 0);
  const loggedCarbs = loggedEntries.reduce((sum, e) => sum + (e.carbs || 0), 0);
  const loggedFat = loggedEntries.reduce((sum, e) => sum + (e.fat || 0), 0);

  // Garmin dynamic adjustments
  const garmin = garminHealthLogs[selectedDate] || {
    activeCaloriesBurned: 620,
    trainingReadiness: 78,
    bodyBattery: 82,
  };
  const activeCalories = garmin.activeCaloriesBurned || 0;
  const effectiveCalorieGoal = nutritionGoals.calories + Math.round(activeCalories * 0.9);

  const remainingCalories = Math.max(0, effectiveCalorieGoal - loggedCalories);
  const remainingProtein = Math.max(0, nutritionGoals.protein - loggedProtein);
  const remainingCarbs = Math.max(0, (nutritionGoals.carbs || 280) - loggedCarbs);
  const remainingFat = Math.max(0, (nutritionGoals.fat || 70) - loggedFat);

  // Today's planned workout
  const dayIndex = (new Date(selectedDate + "T00:00:00").getDay() + 6) % 7;
  const todayWorkout = weeklyPlan.find((p) => p.dayIndex === dayIndex);

  async function generateMealPlan() {
    setLoading(true);
    setErrorMessage(null);
    setSuccessSaved(false);

    try {
      const apiKey =
        typeof window !== "undefined"
          ? localStorage.getItem(GEMINI_API_KEY_STORAGE) ||
            process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
            ""
          : "";

      const prompt = `Erstelle einen perfekten, evidenzbasierten Mahlzeitenplan für einen Hybrid-Athleten für den heutigen Tag.

=== ATHLETEN-KONTEXT ===
Datum: ${selectedDate}
Geplantes Training: ${todayWorkout ? `${todayWorkout.title} (${todayWorkout.workoutType} - ${todayWorkout.description})` : "Allgemeines Training"}
Garmin Training Readiness: ${garmin.trainingReadiness}/100 | Body Battery: ${garmin.bodyBattery}%
Verbrannte Aktiv-Kalorien: ${activeCalories} kcal
Offenes Kalorien-Budget: ${remainingCalories} kcal
Offenes Makro-Budget: ${remainingProtein}g Protein | ${remainingCarbs}g Kohlenhydrate | ${remainingFat}g Fett
Ernährungsfokus: ${dietFocus} (smart = optimal an Training & Erholung angepasst)
Präferenz: ${dietPreference}

=== ANWEISUNG ===
Generiere genau 4 strukturierte Mahlzeiten (Frühstück, Mittagessen, Pre/Post-Workout Snack, Abendessen), die zusammen ca. ${remainingCalories} kcal, ${remainingProtein}g Protein, ${remainingCarbs}g Carbs und ${remainingFat}g Fett ergeben.
WICHTIG: Die Zutaten müssen realistisch und schmackhaft sein.

Antworte AUSSCHLIESSLICH im folgenden gültigen JSON-Format (kein Markdown, kein weiterer Text):
{
  "meals": [
    {
      "mealType": "breakfast",
      "title": "Protein-Haferflocken mit Beeren & Mandelmus",
      "prepTimeMinutes": 10,
      "instructions": "Haferflocken mit Proteinpulver und Wasser aufkochen, mit Beeren und Mandelmus toppen.",
      "ingredients": [
        { "name": "Haferflocken", "amountGrams": 80, "calories": 296, "protein": 11, "carbs": 47, "fat": 6 },
        { "name": "Whey Isolat Vanille", "amountGrams": 30, "calories": 110, "protein": 26, "carbs": 1, "fat": 1 },
        { "name": "Heidelbeeren (frisch)", "amountGrams": 100, "calories": 57, "protein": 1, "carbs": 14, "fat": 0.5 },
        { "name": "Mandelmus", "amountGrams": 15, "calories": 95, "protein": 3, "carbs": 2, "fat": 8.5 }
      ]
    },
    {
      "mealType": "lunch",
      "title": "Hähnchen-Süßkartoffel-Bowl mit Brokkoli",
      "prepTimeMinutes": 20,
      "instructions": "Süßkartoffel und Hähnchenbrust braten oder backen, mit gedünstetem Brokkoli anrichten.",
      "ingredients": [...]
    },
    {
      "mealType": "snack",
      "title": "Pre-Workout Bananen-Reiswaffel Snack",
      "prepTimeMinutes": 5,
      "instructions": "Reiswaffeln mit Erdnussbutter und Bananenscheiben belegen.",
      "ingredients": [...]
    },
    {
      "mealType": "dinner",
      "title": "Lachsfilet mit Quinoa & buntem Ofengemüse",
      "prepTimeMinutes": 25,
      "instructions": "Lachs anbraten, Quinoa kochen und mit Zucchini und Paprika servieren.",
      "ingredients": [...]
    }
  ]
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-3.5-flash",
          system_instruction: "Du bist ein führender Sporternährungsberater und Koch für Hybrid-Athleten. Du antwortest immer im reinen JSON-Format.",
          input: prompt,
          store: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`API Fehler ${res.status}`);
      }

      const data = await res.json();
      let rawJson = "";

      if (data.steps && Array.isArray(data.steps)) {
        for (const step of data.steps) {
          if (step.type === "model_output" && Array.isArray(step.content)) {
            for (const c of step.content) {
              if (c.text) rawJson += c.text;
            }
          }
        }
      }

      // Clean JSON formatting
      const cleanJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      if (parsed.meals && Array.isArray(parsed.meals)) {
        const enrichedMeals: GeneratedMeal[] = parsed.meals.map((m: any) => {
          const totalCalories = m.ingredients.reduce((s: number, i: any) => s + (i.calories || 0), 0);
          const totalProtein = Math.round(m.ingredients.reduce((s: number, i: any) => s + (i.protein || 0), 0) * 10) / 10;
          const totalCarbs = Math.round(m.ingredients.reduce((s: number, i: any) => s + (i.carbs || 0), 0) * 10) / 10;
          const totalFat = Math.round(m.ingredients.reduce((s: number, i: any) => s + (i.fat || 0), 0) * 10) / 10;

          return {
            ...m,
            totalCalories,
            totalProtein,
            totalCarbs,
            totalFat,
            isSelected: true,
          };
        });

        setGeneratedMeals(enrichedMeals);
        const initialSelection: Record<number, boolean> = {};
        enrichedMeals.forEach((_, idx) => {
          initialSelection[idx] = true;
        });
        setSelectedMealIndices(initialSelection);
      } else {
        throw new Error("Ungültiges Antwortformat erhalten.");
      }
    } catch (err: any) {
      console.error("Fehler beim Generieren des Mahlzeitenplans:", err);
      setErrorMessage(err.message || "Fehler bei der Kommunikation mit dem KI-Dienst.");
    } finally {
      setLoading(false);
    }
  }

  function handleToggleMeal(idx: number) {
    setSelectedMealIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  }

  function handleSaveSelectedMeals() {
    const selected = generatedMeals.filter((_, idx) => selectedMealIndices[idx]);
    if (selected.length === 0) return;

    const entriesToAdd: Array<Omit<MealEntry, "id" | "calories" | "protein" | "carbs" | "fat"> & { amount: number }> = [];

    for (const meal of selected) {
      for (const ing of meal.ingredients) {
        const foodItem: FoodItem = {
          id: generateId(),
          name: ing.name,
          brand: "KI Rezept",
          servingSize: 100,
          servingUnit: "g",
          caloriesPer100g: Math.round((ing.calories / (ing.amountGrams || 100)) * 100),
          proteinPer100g: Math.round(((ing.protein / (ing.amountGrams || 100)) * 100) * 10) / 10,
          carbsPer100g: Math.round(((ing.carbs / (ing.amountGrams || 100)) * 100) * 10) / 10,
          fatPer100g: Math.round(((ing.fat / (ing.amountGrams || 100)) * 100) * 10) / 10,
        };

        entriesToAdd.push({
          mealType: meal.mealType,
          food: foodItem,
          amount: ing.amountGrams,
        });
      }
    }

    addMultipleMealEntries(selectedDate, entriesToAdd);
    setSuccessSaved(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-900 via-blue-950/20 to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>KI-Mahlzeitenplaner</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  OpenNutriTracker
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Personalisiert für deinen Hybrid-Alltag & Garmin-Trainingslast
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
          {/* Daily Context Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Offenes Budget</span>
              <span className="text-sm font-bold text-zinc-100">{remainingCalories} kcal</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Offenes Protein</span>
              <span className="text-sm font-bold text-blue-400">{Math.round(remainingProtein)}g</span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Training heute</span>
              <span className="text-xs font-bold text-amber-400 truncate block">
                {todayWorkout ? todayWorkout.title : "Regeneration"}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 block">Garmin Burn</span>
              <span className="text-sm font-bold text-emerald-400">+{activeCalories} kcal</span>
            </div>
          </div>

          {/* Generator Controls */}
          {generatedMeals.length === 0 && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Fokus des Tagesplans:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDietFocus("smart")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      dietFocus === "smart"
                        ? "bg-blue-600/10 border-blue-500/50 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={14} className="text-blue-400" />
                      <span className="text-xs font-bold">Smart Hybrid</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Passt Carbs & Protein optimal an dein Garmin-Training an.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("high_protein")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      dietFocus === "high_protein"
                        ? "bg-blue-600/10 border-blue-500/50 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Dumbbell size={14} className="text-purple-400" />
                      <span className="text-xs font-bold">High Protein</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Fokus auf Muskelaufbau und maximale Sättigung.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("high_carb")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      dietFocus === "high_carb"
                        ? "bg-blue-600/10 border-blue-500/50 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Flame size={14} className="text-amber-400" />
                      <span className="text-xs font-bold">Ausdauer & Energie</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Mehr komplexe Kohlenhydrate für lange Läufe und Radeinheiten.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("quick")}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      dietFocus === "quick"
                        ? "bg-blue-600/10 border-blue-500/50 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={14} className="text-emerald-400" />
                      <span className="text-xs font-bold">Quick & Easy</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">
                      Alle Rezepte in unter 15 Minuten zubereitet.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Ernährungsform:
                </label>
                <div className="flex gap-2">
                  {[
                    { id: "standard", label: "Allesesser" },
                    { id: "vegetarian", label: "Vegetarisch" },
                    { id: "vegan", label: "Vegan" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDietPreference(p.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        dietPreference === p.id
                          ? "bg-zinc-800 border-zinc-600 text-zinc-100"
                          : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="button"
                onClick={generateMealPlan}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Berechne perfekten Mahlzeitenplan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Tagesplan jetzt generieren</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Generated Meals Preview */}
          {generatedMeals.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">
                  Generierte Mahlzeiten ({generatedMeals.filter((_, i) => selectedMealIndices[i]).length} ausgewählt):
                </span>
                <button
                  type="button"
                  onClick={generateMealPlan}
                  disabled={loading}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  <span>Neu generieren</span>
                </button>
              </div>

              <div className="space-y-3">
                {generatedMeals.map((meal, idx) => {
                  const meta = MEAL_ICONS[meal.mealType] || MEAL_ICONS.lunch;
                  const Icon = meta.icon;
                  const isChecked = !!selectedMealIndices[idx];

                  return (
                    <div
                      key={idx}
                      onClick={() => handleToggleMeal(idx)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isChecked
                          ? "bg-zinc-950/90 border-blue-500/40 shadow-sm shadow-blue-500/5"
                          : "bg-zinc-950/40 border-zinc-800/60 opacity-60 hover:opacity-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-xl border ${meta.color}`}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                              {meta.label} • {meal.prepTimeMinutes} Min
                            </span>
                            <h4 className="text-sm font-bold text-zinc-100 leading-snug">
                              {meal.title}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-zinc-100 block">
                              {meal.totalCalories} kcal
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {meal.totalProtein}g P | {meal.totalCarbs}g C | {meal.totalFat}g F
                            </span>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                              isChecked
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "border-zinc-700 bg-zinc-900"
                            }`}
                          >
                            {isChecked && <Check size={12} />}
                          </div>
                        </div>
                      </div>

                      {/* Ingredients Pills */}
                      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-zinc-800/60">
                        {meal.ingredients.map((ing, iIdx) => (
                          <span
                            key={iIdx}
                            className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
                          >
                            {ing.name} ({ing.amountGrams}g)
                          </span>
                        ))}
                      </div>

                      {/* Quick Instruction */}
                      <p className="text-[11px] text-zinc-400 italic pt-2">
                        💡 {meal.instructions}
                      </p>
                    </div>
                  );
                })}
              </div>

              {successSaved && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 animate-in zoom-in-95">
                  <CheckCircle2 size={16} />
                  <span>Mahlzeiten erfolgreich ins Tagebuch übernommen!</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {generatedMeals.length > 0 && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setGeneratedMeals([])}
              className="px-3.5 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Optionen anpassen
            </button>

            <button
              type="button"
              onClick={handleSaveSelectedMeals}
              disabled={generatedMeals.filter((_, i) => selectedMealIndices[i]).length === 0 || successSaved}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <Check size={15} />
              <span>
                {generatedMeals.filter((_, i) => selectedMealIndices[i]).length} Mahlzeiten ins Tagebuch eintragen
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
