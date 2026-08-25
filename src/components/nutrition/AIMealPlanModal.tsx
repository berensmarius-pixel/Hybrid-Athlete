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
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { geminiGenerateText, extractJson } from "@/lib/gemini/client";
import type { MealType, FoodItem, MealEntry } from "@/types";
import { generateId, cn } from "@/lib/utils";

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

type DietPreferenceType = "standard" | "pescatarian" | "vegetarian" | "vegan";
type MealCountType = 3 | 4 | 5;

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
  const [dietPreference, setDietPreference] = useState<DietPreferenceType>("standard");
  const [mealCount, setMealCount] = useState<MealCountType>(4);
  const [intolerances, setIntolerances] = useState<string[]>([]);
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

  // Today's planned workout
  const dayIndex = (new Date(selectedDate + "T00:00:00").getDay() + 6) % 7;
  const todayWorkout = weeklyPlan.find((p) => p.dayIndex === dayIndex);

  // Garmin dynamic adjustments with Plausibility Fallback
  const garmin = garminHealthLogs[selectedDate] || {
    activeCaloriesBurned: 520,
    trainingReadiness: 78,
    bodyBattery: 82,
  };
  
  let rawActiveCalories = garmin.activeCaloriesBurned || 0;
  let isEstimated = false;

  // Plausibility check: If Garmin active calories are unrealistically low (< 100 kcal) while a demanding workout exists
  if (rawActiveCalories < 100 && todayWorkout && todayWorkout.workoutType !== "rest") {
    rawActiveCalories = 520;
    isEstimated = true;
  }

  const effectiveCalorieGoal = nutritionGoals.calories + Math.round(rawActiveCalories * 0.9);

  const remainingCalories = Math.max(0, effectiveCalorieGoal - loggedCalories);
  const remainingProtein = Math.max(0, nutritionGoals.protein - loggedProtein);
  const remainingCarbs = Math.max(0, (nutritionGoals.carbs || 280) - loggedCarbs);
  const remainingFat = Math.max(0, (nutritionGoals.fat || 70) - loggedFat);

  function toggleIntolerance(name: string) {
    if (intolerances.includes(name)) {
      setIntolerances(intolerances.filter((i) => i !== name));
    } else {
      setIntolerances([...intolerances, name]);
    }
  }

  async function generateMealPlan() {
    setLoading(true);
    setErrorMessage(null);
    setSuccessSaved(false);

    try {

      const prompt = `Erstelle einen perfekten, evidenzbasierten Mahlzeitenplan für einen Hybrid-Athleten für den heutigen Tag.

=== ATHLETEN-KONTEXT ===
Datum: ${selectedDate}
Geplantes Training: ${todayWorkout ? `${todayWorkout.title} (${todayWorkout.workoutType} - ${todayWorkout.description})` : "Allgemeines Training"}
Garmin Training Readiness: ${garmin.trainingReadiness}/100 | Body Battery: ${garmin.bodyBattery}%
Aktiv-Kalorien: ${rawActiveCalories} kcal ${isEstimated ? "(Trainings-Schätzung)" : "(Garmin)"}
Offenes Kalorien-Budget: ${remainingCalories} kcal
Offenes Makro-Budget: ${remainingProtein}g Protein | ${remainingCarbs}g Kohlenhydrate | ${remainingFat}g Fett
Ernährungsfokus: ${dietFocus} (smart = optimal an Training & Erholung angepasst)
Präferenz: ${dietPreference}
Mahlzeiten-Anzahl: genau ${mealCount} Mahlzeiten
Unverträglichkeiten / Filter: ${intolerances.length > 0 ? intolerances.join(", ") : "keine"}

=== ANWEISUNG ===
Generiere genau ${mealCount} strukturierte Mahlzeiten (${mealCount === 3 ? "Frühstück, Mittagessen, Abendessen" : mealCount === 5 ? "Frühstück, Snack 1, Mittagessen, Pre/Post-Workout Snack, Abendessen" : "Frühstück, Mittagessen, Pre/Post-Workout Snack, Abendessen"}), die zusammen ca. ${remainingCalories} kcal, ${remainingProtein}g Protein, ${remainingCarbs}g Carbs und ${remainingFat}g Fett ergeben.
WICHTIG: Die Zutaten müssen realistisch, verzehrfertig und schmackhaft für Sportler sein.

Antworte AUSSCHLIESSLICH im folgenden gültigen JSON-Format (kein Markdown, kein weiterer Text):
{
  "meals": [
    {
      "mealType": "breakfast",
      "title": "Power-Oats mit Beeren & Whey",
      "prepTimeMinutes": 10,
      "instructions": "Haferflocken mit Proteinpulver und Wasser aufkochen, mit Beeren toppen.",
      "ingredients": [
        { "name": "Haferflocken", "amountGrams": 80, "calories": 296, "protein": 11, "carbs": 47, "fat": 6 },
        { "name": "Whey Isolat", "amountGrams": 30, "calories": 110, "protein": 26, "carbs": 1, "fat": 1 }
      ]
    }
  ]
}`;

      const systemInstruction =
        "Du bist ein führender Sporternährungsberater und Chefkoch für Hybrid-Athleten. Du antwortest immer im reinen JSON-Format.";
      const rawText = await geminiGenerateText(`${systemInstruction}\n\n${prompt}`, {
        model: "gemini-2.5-flash",
      });

      const parsed = extractJson(String(rawText)) as {
        meals?: Array<Record<string, unknown>>;
      };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-linear-to-r from-zinc-950 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3.5 flex-wrap min-w-0">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/25 shrink-0">
              <Sparkles size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-zinc-100">
                  KI-Mahlzeitenplaner
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  OpenNutriTracker
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Personalisiert für deinen Hybrid-Alltag & Garmin-Trainingslast
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Daily Context Bar with Complete Macro Breakdown & Plausible Burn */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center font-mono">
            <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block font-sans">
                Offenes Budget
              </span>
              <span className="text-sm sm:text-base font-black text-zinc-100">
                {remainingCalories} kcal
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-[10px] uppercase font-bold text-blue-400 block font-sans">
                Protein
              </span>
              <span className="text-sm sm:text-base font-black text-blue-300">
                {Math.round(remainingProtein)}g
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] uppercase font-bold text-amber-400 block font-sans">
                Carbs
              </span>
              <span className="text-sm sm:text-base font-black text-amber-300">
                {Math.round(remainingCarbs)}g
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] uppercase font-bold text-rose-400 block font-sans">
                Fett
              </span>
              <span className="text-sm sm:text-base font-black text-rose-300">
                {Math.round(remainingFat)}g
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-left sm:text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block font-sans">
                Aktiv-Verbrauch
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-400 block">
                +{rawActiveCalories} kcal
              </span>
              <span className="text-[9px] text-neutral-400 block truncate font-sans" title={todayWorkout?.title}>
                {todayWorkout ? todayWorkout.title : "Kein Training"}
              </span>
            </div>
          </div>

          {/* Generator Controls */}
          {generatedMeals.length === 0 && (
            <div className="space-y-4 pt-1">
              {/* Focus of Day */}
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-2">
                  Fokus des Tagesplans:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDietFocus("smart")}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                      dietFocus === "smart"
                        ? "bg-blue-600/15 border-blue-500/60 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={15} className="text-blue-400" />
                      <span className="text-xs font-bold">Smart Hybrid</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      Passt Carbs & Protein optimal an dein Garmin-Training an.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("high_protein")}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                      dietFocus === "high_protein"
                        ? "bg-blue-600/15 border-blue-500/60 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Dumbbell size={15} className="text-purple-400" />
                      <span className="text-xs font-bold">High Protein</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      Fokus auf Muskelaufbau und maximale Sättigung (2.2g/kg).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("high_carb")}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                      dietFocus === "high_carb"
                        ? "bg-blue-600/15 border-blue-500/60 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Flame size={15} className="text-amber-400" />
                      <span className="text-xs font-bold">Ausdauer & Energie</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      Mehr komplexe Kohlenhydrate für intensive Schwelleneinheiten.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDietFocus("quick")}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
                      dietFocus === "quick"
                        ? "bg-blue-600/15 border-blue-500/60 text-zinc-100 shadow-md shadow-blue-500/10"
                        : "bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={15} className="text-emerald-400" />
                      <span className="text-xs font-bold">Quick & Easy</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-tight">
                      Alle Mahlzeiten in unter 15 Minuten zubereitet.
                    </p>
                  </button>
                </div>
              </div>

              {/* Diet Preferences Segmented Control */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-200">
                  Ernährungsform:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "standard", label: "Allesesser" },
                    { id: "pescatarian", label: "Pesketarisch" },
                    { id: "vegetarian", label: "Vegetarisch" },
                    { id: "vegan", label: "Vegan" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDietPreference(p.id as any)}
                      className={cn(
                        "py-2.5 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-center",
                        dietPreference === p.id
                          ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/25"
                          : "bg-zinc-900 border-zinc-800 text-neutral-400 hover:text-zinc-200"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meal Count Switcher */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-200">
                  Mahlzeiten-Struktur:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { count: 3, label: "3 Mahlzeiten", desc: "Frühstück, Mittag, Abend" },
                    { count: 4, label: "4 Mahlzeiten", desc: "+ 1 Pre/Post Workout Snack" },
                    { count: 5, label: "5 Mahlzeiten", desc: "3 Haupt + 2 Power-Snacks" },
                  ].map((m) => (
                    <button
                      key={m.count}
                      type="button"
                      onClick={() => setMealCount(m.count as any)}
                      className={cn(
                        "p-2.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center",
                        mealCount === m.count
                          ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/25 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-neutral-400 hover:text-zinc-200"
                      )}
                    >
                      <span className="text-xs">{m.label}</span>
                      <span className="text-[9px] opacity-75 hidden sm:block">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Intolerances / Allergy Filter */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-200 block">
                  Unverträglichkeiten & Filter (optional):
                </span>
                <div className="flex gap-2 flex-wrap">
                  {["Laktosefrei", "Glutenfrei", "Nussfrei", "Ohne Schweinefleisch"].map((into) => (
                    <button
                      key={into}
                      type="button"
                      onClick={() => toggleIntolerance(into)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer",
                        intolerances.includes(into)
                          ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                          : "bg-zinc-900 border-zinc-800 text-neutral-400"
                      )}
                    >
                      {into}
                    </button>
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="button"
                onClick={generateMealPlan}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Berechne optimalen Hybrid-Mahlzeitenplan ({mealCount} Mahlzeiten)...</span>
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
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">
                  Generierte Mahlzeiten ({generatedMeals.filter((_, i) => selectedMealIndices[i]).length} von {generatedMeals.length} ausgewählt):
                </span>
                <button
                  type="button"
                  onClick={generateMealPlan}
                  disabled={loading}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
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
                      className={cn(
                        "p-4 rounded-3xl border transition-all cursor-pointer shadow-md",
                        isChecked
                          ? "bg-zinc-900/90 border-blue-500/50 shadow-blue-500/5"
                          : "bg-zinc-950/40 border-zinc-800/60 opacity-60 hover:opacity-100"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-2xl border ${meta.color}`}>
                            <Icon size={18} />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                              {meta.label} • {meal.prepTimeMinutes} Min
                            </span>
                            <h4 className="text-sm sm:text-base font-black text-zinc-100 leading-snug">
                              {meal.title}
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right font-mono">
                            <span className="text-xs font-black text-zinc-100 block">
                              {meal.totalCalories} kcal
                            </span>
                            <span className="text-[10px] text-neutral-400 font-medium">
                              {meal.totalProtein}g P | {meal.totalCarbs}g C | {meal.totalFat}g F
                            </span>
                          </div>
                          <div
                            className={cn(
                              "w-5 h-5 rounded-lg border flex items-center justify-center transition-colors",
                              isChecked
                                ? "bg-blue-600 border-blue-500 text-white"
                                : "border-zinc-700 bg-zinc-900"
                            )}
                          >
                            {isChecked && <Check size={12} className="stroke-[3]" />}
                          </div>
                        </div>
                      </div>

                      {/* Instructions */}
                      <p className="text-xs text-neutral-300 font-medium leading-relaxed mb-2.5">
                        {meal.instructions}
                      </p>

                      {/* Ingredients Pills */}
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-zinc-800/80">
                        {meal.ingredients.map((ing, iIdx) => (
                          <span
                            key={iIdx}
                            className="px-2.5 py-1 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-neutral-200 font-medium"
                          >
                            {ing.name} <strong className="text-amber-400 font-mono">({ing.amountGrams}g)</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveSelectedMeals}
                  disabled={generatedMeals.filter((_, i) => selectedMealIndices[i]).length === 0}
                  className="flex-1 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {successSaved ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Ins Tagebuch eingetragen! ✅</span>
                    </>
                  ) : (
                    <>
                      <Utensils size={15} />
                      <span>
                        {generatedMeals.filter((_, i) => selectedMealIndices[i]).length} Mahlzeiten ins Tagebuch übertragen
                      </span>
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
