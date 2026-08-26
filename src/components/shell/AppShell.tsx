"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { AppProvider, useApp } from "@/context/AppContext";
import { StravaProvider, useStrava } from "@/context/StravaContext";
import StravaBridge from "@/components/strava/StravaBridge";
import BottomNav from "./BottomNav";
import DesktopSidebar from "./DesktopSidebar";
import OfflineSyncIndicator from "./OfflineSyncIndicator";
import { PRBannerAuto } from "@/components/training/PRBanner";
import CoachInsightToast from "@/components/coach/CoachInsightToast";
import RefuelWindowBanner from "@/modules/nutrition/refueling-assistant/RefuelWindowBanner";
import { setCoachSessionContext } from "@/lib/coach/coachSession";

// Views lazy laden: Der Initial-Bundle enthält nur die Shell.
// CoachView zieht react-markdown (~288 KB) erst beim Bedarf nach.
const DashboardView = dynamic(() => import("@/components/dashboard/DashboardView"), {
  ssr: false,
  loading: () => <ViewLoading />,
});
const TrainingView = dynamic(() => import("@/components/training/TrainingView"), {
  ssr: false,
  loading: () => <ViewLoading />,
});
const NutritionView = dynamic(() => import("@/components/nutrition/NutritionView"), {
  ssr: false,
  loading: () => <ViewLoading />,
});
const CoachView = dynamic(() => import("@/components/coach/CoachView"), {
  ssr: false,
  loading: () => <ViewLoading />,
});

function ViewLoading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin" />
    </div>
  );
}

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

/**
 * Registriert den aktuellen App-/Strava-Kontext im Coach-Session-Store.
 * Bewusst NIE unmountend (lebt unter StravaProvider) – die Coach-Pipeline
 * läuft so unabhängig vom aktiven View im Hintergrund weiter.
 */
function CoachSessionBridge() {
  const app = useApp();
  const { activities, connection } = useStrava();

  useEffect(() => {
    setCoachSessionContext({ app, stravaActivities: activities, stravaConnection: connection });
  });

  return null;
}

export default function AppShell() {
  return (
    <AppProvider>
      <StravaProvider>
        {/* Bridge auto-imports Strava activities into the training log */}
        <StravaBridge>
          <CoachSessionBridge />
          {/* h-dvh: respektiert dynamische Browser-Chrome auf iOS/Android;
              w-full statt w-screen (vermeidet 100vw-Scrollbar-Überlauf) */}
          <div className="flex h-dvh w-full bg-zinc-950 text-zinc-100 overflow-hidden select-none">
            {/* Desktop Navigation Sidebar (Full HD & WQHD) */}
            <DesktopSidebar />

            {/* Main Application Router */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
              <PRBannerAuto />
              <CoachInsightToast />
              <RefuelWindowBanner />
              <OfflineSyncIndicator />
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
