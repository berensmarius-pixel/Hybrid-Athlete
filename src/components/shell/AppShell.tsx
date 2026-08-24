"use client";

import { AppProvider, useApp } from "@/context/AppContext";
import { StravaProvider } from "@/context/StravaContext";
import StravaBridge from "@/components/strava/StravaBridge";
import BottomNav from "./BottomNav";
import DesktopSidebar from "./DesktopSidebar";
import DashboardView from "@/components/dashboard/DashboardView";
import TrainingView from "@/components/training/TrainingView";
import NutritionView from "@/components/nutrition/NutritionView";
import CoachView from "@/components/coach/CoachView";
import { PRBannerAuto } from "@/components/training/PRBanner";
import CoachInsightToast from "@/components/coach/CoachInsightToast";

function ViewRouter() {
  const { activeView } = useApp();

  return (
    <main className="flex-1 h-full overflow-hidden flex flex-col bg-zinc-950">
      {activeView === "dashboard" && <DashboardView />}
      {activeView === "training" && <TrainingView />}
      {activeView === "nutrition" && <NutritionView />}
      {activeView === "coach" && <CoachView />}
    </main>
  );
}

export default function AppShell() {
  return (
    <AppProvider>
      <StravaProvider>
        {/* Bridge auto-imports Strava activities into the training log */}
        <StravaBridge>
          <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none">
            {/* Desktop Navigation Sidebar (Full HD & WQHD) */}
            <DesktopSidebar />

            {/* Main Application Router */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
              <PRBannerAuto />
              <CoachInsightToast />
              <ViewRouter />

              {/* Mobile Bottom Navigation (S24 Ultra & Smartphones) */}
              <div className="md:hidden">
                <BottomNav />
              </div>
            </div>
          </div>
        </StravaBridge>
      </StravaProvider>
    </AppProvider>
  );
}
