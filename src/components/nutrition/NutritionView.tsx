"use client";

import { useState } from "react";
import {
  Utensils,
  ScanBarcode,
  ShoppingCart,
  Target,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { MealType } from "@/types";

// Modular Tabs
import NutritionDiaryTab from "./NutritionDiaryTab";
import NutritionScannerTab from "./NutritionScannerTab";
import NutritionPlannerTab from "./NutritionPlannerTab";

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

export default function NutritionView() {
  const [nutritionTab, setNutritionTab] = useState<"diary" | "scanner" | "planner">("diary");
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
    <div className="flex flex-col h-full overflow-y-auto bg-zinc-950 pb-20 md:pb-0">
      {/* ── Top Header & Tab Navigation ─────────────────────────────────────── */}
      <header className="px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-3 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-10 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
              <Utensils size={20} className="text-emerald-400" />
              <span>Ernährung & Makros</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
              Tages-Makros, KI-Foto & Barcode-Erkennung (OpenFoodFacts)
            </p>
          </div>

          <button
            onClick={() => setIsGoalsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-300 text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            <Target size={14} className="text-emerald-400" />
            <span>Ziele & Makros anpassen</span>
          </button>
        </div>

        {/* 3 Main Tabs (Scrollable on Mobile) */}
        <div className="flex bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 w-full sm:max-w-md overflow-x-auto scrollbar-none">
          <button
            onClick={() => setNutritionTab("diary")}
            className={cn(
              "flex-1 min-w-[100px] py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              nutritionTab === "diary"
                ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Utensils size={13} />
            <span>Tagebuch</span>
          </button>

          <button
            onClick={() => setNutritionTab("scanner")}
            className={cn(
              "flex-1 min-w-[110px] py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              nutritionTab === "scanner"
                ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ScanBarcode size={13} />
            <span>KI-Scanner</span>
          </button>

          <button
            onClick={() => setNutritionTab("planner")}
            className={cn(
              "flex-1 min-w-[130px] py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
              nutritionTab === "planner"
                ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ShoppingCart size={13} />
            <span>Einkauf & Rezepte</span>
          </button>
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

        {/* Tab 3: Einkauf & Rezepte */}
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
