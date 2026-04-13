"use client";

import { AppProvider, useApp } from "@/context/AppContext";
import { StravaProvider } from "@/context/StravaContext";
import StravaBridge from "@/components/strava/StravaBridge";
import BottomNav from "./BottomNav";
import DashboardView from "@/components/dashboard/DashboardView";
import TrainingView from "@/components/training/TrainingView";
import CoachView from "@/components/coach/CoachView";
import { PRBannerAuto } from "@/components/training/PRBanner";
import CoachInsightToast from "@/components/coach/CoachInsightToast";

function ViewRouter() {
  const { activeView } = useApp();

  return (
    <main className="flex-1 overflow-hidden">
      {activeView === "dashboard"  && <DashboardView />}
      {activeView === "training"   && <TrainingView />}
      {activeView === "coach"      && <CoachView />}
    </main>
  );
}

export default function AppShell() {
  return (
    <AppProvider>
      <StravaProvider>
        {/* Bridge auto-imports Strava activities into the training log */}
        <StravaBridge>
          <div className="flex flex-col h-full bg-zinc-950">
            <PRBannerAuto />
            <CoachInsightToast />
            <ViewRouter />
            <BottomNav />
          </div>
        </StravaBridge>
      </StravaProvider>
    </AppProvider>
  );
}
