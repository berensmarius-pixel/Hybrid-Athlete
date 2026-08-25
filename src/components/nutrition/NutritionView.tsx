"use client";

import { useState } from "react";
import {
  Utensils,
  ScanBarcode,
  ShoppingCart,
  Target,
  Package,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { MealType } from "@/types";
import { motion } from "motion/react";
import { useApp } from "@/context/AppContext";

// Modular Tabs
import NutritionDiaryTab from "./NutritionDiaryTab";
import NutritionScannerTab from "./NutritionScannerTab";
import NutritionPlannerTab from "./NutritionPlannerTab";
const PantryTab = dynamic(() => import("./PantryTab"), { ssr: false });

// Dynamic Modals
const FoodSearchModal = dynamic(() => import("./FoodSearchModal"), { ssr: false });
const NutritionGoalsModal = dynamic(() => import("./NutritionGoalsModal"), { ssr: false });
const AIMealPlanModal = dynamic(() => import("./AIMealPlanModal"), { ssr: false });
const BarcodeScannerModal = dynamic(() => import("./BarcodeScannerModal"), { ssr: false });
const PhotoMealLoggerModal = dynamic(() => import("./PhotoMealLoggerModal"), { ssr: false });
const ShoppingListModal = dynamic(() => import("./ShoppingListModal"), { ssr: false });

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const TABS = [
  { id: "diary", label: "Tagebuch", Icon: Utensils },
  { id: "scanner", label: "KI-Scanner", Icon: ScanBarcode },
  { id: "pantry", label: "Vorrat", Icon: Package },
  { id: "planner", label: "Einkauf & Rezepte", Icon: ShoppingCart },
] as const;

export default function NutritionView() {
  const { nutritionGoals } = useApp();
  const [nutritionTab, setNutritionTab] = useState<"diary" | "scanner" | "pantry" | "planner">("diary");
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [activeModalMeal, setActiveModalMeal] = useState<MealType | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<"search" | "barcode">("search");
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isBarcodeOpen, setIsBarcodeOpen] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const [isShoppingOpen, setIsShoppingOpen] = useState(false);

  const openMealModal = (meal: MealType, tab: "search" | "barcode" = "search") => {
    setActiveModalMeal(meal);
    setModalInitialTab(tab);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 md:pb-0">
      {/* ── Top Header & Tab Navigation ─────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 border-b border-white/5 bg-zinc-950/80 backdrop-blur-2xl sticky top-0 z-10 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2 font-mono">
              <Utensils size={20} className="text-emerald-400" />
              <span>ERNÄHRUNG & MAKROS</span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                AI VISION
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
              Tages-Makros, KI-Foto & Barcode-Erkennung (OpenFoodFacts)
            </p>
          </div>

          <button
            onClick={() => setIsGoalsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300 hover:text-emerald-200 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm group"
          >
            <Sparkles size={14} className="text-emerald-400 animate-pulse group-hover:scale-110 transition-transform" />
            <span>KI-Coach Auto-Pilot</span>
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono font-bold">
              {nutritionGoals.calories} kcal
            </span>
          </button>
        </div>

        {/* 3 Main Tabs */}
        <div className="flex glass-panel p-1 rounded-2xl border border-white/10 w-full sm:max-w-md overflow-x-auto scrollbar-none relative">
          {TABS.map(({ id, label, Icon }) => {
            const active = nutritionTab === id;
            return (
              <button
                key={id}
                onClick={() => setNutritionTab(id)}
                className={cn(
                  "relative flex-1 min-w-[100px] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap z-10",
                  active ? "text-black font-black" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nutritionTabIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-xl shadow-md shadow-emerald-500/25 -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={14} className={active ? "text-black" : "text-zinc-400"} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Scrollable Body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-8 space-y-4 sm:space-y-5 pb-28 md:pb-8 max-w-[2000px] 2xl:max-w-[2400px] mx-auto w-full">
        {/* Tab 1: Tagebuch */}
        {nutritionTab === "diary" && (
          <NutritionDiaryTab
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenMealModal={openMealModal}
          />
        )}

        {/* Tab 2: KI Scanner & Vision */}
        {nutritionTab === "scanner" && (
          <NutritionScannerTab
            onOpenBarcodeScanner={() => setIsBarcodeOpen(true)}
            onOpenPhotoLogger={() => setIsPhotoOpen(true)}
          />
        )}

        {/* Tab 3: Smart Pantry & Aufbrauch-Assistent */}
        {nutritionTab === "pantry" && <PantryTab />}

        {/* Tab 4: Einkauf & Rezepte */}
        {nutritionTab === "planner" && (
          <NutritionPlannerTab
            onOpenShoppingList={() => setIsShoppingOpen(true)}
            onOpenMealPlanner={() => setIsAIModalOpen(true)}
          />
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {activeModalMeal && (
        <FoodSearchModal
          isOpen={!!activeModalMeal}
          onClose={() => setActiveModalMeal(null)}
          mealType={activeModalMeal}
          date={selectedDate}
          initialTab={modalInitialTab}
        />
      )}

      {isGoalsModalOpen && (
        <NutritionGoalsModal
          isOpen={isGoalsModalOpen}
          onClose={() => setIsGoalsModalOpen(false)}
        />
      )}

      {isAIModalOpen && (
        <AIMealPlanModal
          isOpen={isAIModalOpen}
          onClose={() => setIsAIModalOpen(false)}
          selectedDate={selectedDate}
        />
      )}

      {isBarcodeOpen && (
        <BarcodeScannerModal
          isOpen={isBarcodeOpen}
          onClose={() => setIsBarcodeOpen(false)}
          targetDate={selectedDate}
        />
      )}

      {isPhotoOpen && (
        <PhotoMealLoggerModal
          isOpen={isPhotoOpen}
          onClose={() => setIsPhotoOpen(false)}
          targetDate={selectedDate}
        />
      )}

      {isShoppingOpen && (
        <ShoppingListModal
          isOpen={isShoppingOpen}
          onClose={() => setIsShoppingOpen(false)}
        />
      )}
    </div>
  );
}
