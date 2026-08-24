"use client";

import { useState } from "react";
import { X, Target, Sparkles, Check, Flame, Dumbbell, Droplet, HelpCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { calculateNutritionTargets } from "@/lib/nutritionApi";
import type { DailyNutritionGoal } from "@/types";

interface NutritionGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NutritionGoalsModal({
  isOpen,
  onClose,
}: NutritionGoalsModalProps) {
  const { nutritionGoals, setNutritionGoals, bodyWeightLog } = useApp();

  const [calories, setCalories] = useState<number>(nutritionGoals.calories);
  const [protein, setProtein] = useState<number>(nutritionGoals.protein);
  const [carbs, setCarbs] = useState<number>(nutritionGoals.carbs || 280);
  const [fat, setFat] = useState<number>(nutritionGoals.fat || 70);
  const [waterMl, setWaterMl] = useState<number>(nutritionGoals.waterMl || 3000);

  // Auto-calculator state
  const latestWeight = bodyWeightLog.length > 0 ? bodyWeightLog[0].weight : 80;
  const [calcWeight, setCalcWeight] = useState<number>(latestWeight);
  const [activity, setActivity] = useState<"sedentary" | "light" | "moderate" | "heavy" | "athlete">("heavy");
  const [goal, setGoal] = useState<"cut" | "maintain" | "bulk">("maintain");
  const [showCalculator, setShowCalculator] = useState(false);

  if (!isOpen) return null;

  const handleApplyCalculator = () => {
    const calculated = calculateNutritionTargets({
      weightKg: calcWeight,
      activityLevel: activity,
      goal,
      proteinTargetGPerKg: 2.0, // Optimal for hybrid athlete
    });

    setCalories(calculated.calories);
    setProtein(calculated.protein);
    setCarbs(calculated.carbs);
    setFat(calculated.fat);
    setWaterMl(calculated.waterMl);
    setShowCalculator(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setNutritionGoals({
      calories: Number(calories) || 2500,
      protein: Number(protein) || 160,
      carbs: Number(carbs) || 280,
      fat: Number(fat) || 70,
      waterMl: Number(waterMl) || 3000,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-zinc-100">
              Tagesziele & Makros anpassen
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4 overflow-y-auto">
          {/* TDEE / Macro Calculator Toggle Card */}
          <div className="p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                Hybrid-Athlete Makro-Rechner
              </span>
              <button
                type="button"
                onClick={() => setShowCalculator(!showCalculator)}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
              >
                {showCalculator ? "Schließen" : "Berechnen"}
              </button>
            </div>

            {showCalculator && (
              <div className="space-y-3 pt-2 border-t border-zinc-700/50">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Körpergewicht (kg)
                    </label>
                    <input
                      type="number"
                      value={calcWeight}
                      onChange={(e) => setCalcWeight(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Ziel</label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100"
                    >
                      <option value="maintain">Gewicht halten</option>
                      <option value="cut">Defizit / Cut (-18%)</option>
                      <option value="bulk">Aufbau / Bulk (+12%)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Aktivitätslevel
                  </label>
                  <select
                    value={activity}
                    onChange={(e) => setActivity(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100"
                  >
                    <option value="moderate">Moderat (3-4x Training/Woche)</option>
                    <option value="heavy">Hoch (4-6x Hybrid Training)</option>
                    <option value="athlete">Sehr hoch (2x täglich / Ausdauer + Gym)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleApplyCalculator}
                  className="w-full py-2 px-3 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-xs font-semibold text-zinc-100 transition-colors"
                >
                  Werte übernehmen (2.0g Protein / kg)
                </button>
              </div>
            )}
          </div>

          {/* Calorie Goal */}
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Flame size={15} className="text-emerald-400" />
                Tägliches Kalorienziel
              </span>
              <span className="text-emerald-400 font-bold">{calories} kcal</span>
            </label>
            <input
              type="number"
              min="800"
              max="10000"
              step="50"
              value={calories}
              onChange={(e) => setCalories(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm font-bold focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Protein Goal */}
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Dumbbell size={15} className="text-blue-400" />
                Proteinziel (Hybrid Athlete)
              </span>
              <span className="text-blue-400 font-bold">{protein} g</span>
            </label>
            <input
              type="number"
              min="30"
              max="400"
              step="5"
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm font-bold focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Carbs & Fat */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Kohlenhydrate</span>
                <span className="text-amber-400 font-bold">{carbs}g</span>
              </label>
              <input
                type="number"
                min="0"
                max="800"
                step="5"
                value={carbs}
                onChange={(e) => setCarbs(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Fett</span>
                <span className="text-rose-400 font-bold">{fat}g</span>
              </label>
              <input
                type="number"
                min="0"
                max="300"
                step="5"
                value={fat}
                onChange={(e) => setFat(Number(e.target.value))}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Water Goal */}
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Droplet size={14} className="text-cyan-400" />
                Wasserziel (ml)
              </span>
              <span className="text-cyan-400 font-bold">{waterMl} ml</span>
            </label>
            <input
              type="number"
              min="500"
              max="8000"
              step="250"
              value={waterMl}
              onChange={(e) => setWaterMl(Number(e.target.value))}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-sm focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Ziele speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
